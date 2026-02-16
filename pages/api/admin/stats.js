// /pages/api/admin/stats.js
// FAPexpert Admin Dashboard API — v1.0
// Accède aux env vars Supabase côté serveur

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_TOKEN = process.env.ADMIN_DASHBOARD_TOKEN || "re-fap-2026-dash";

function getSupabase() {
  if (!supabaseUrl || !supabaseServiceKey) return null;
  return createClient(supabaseUrl, supabaseServiceKey);
}

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  // Auth simple par token
  const authHeader = req.headers.authorization || "";
  const token = authHeader.replace("Bearer ", "").trim() || req.query.token;
  if (token !== ADMIN_TOKEN) {
    return res.status(401).json({ error: "Token invalide" });
  }

  const supabase = getSupabase();
  if (!supabase) return res.status(500).json({ error: "Supabase non configuré" });

  try {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const sevenDaysAgo = new Date(now - 7 * 86400000).toISOString();
    const thirtyDaysAgo = new Date(now - 30 * 86400000).toISOString();

    // ========================================
    // 1. CONVERSATIONS & MESSAGES
    // ========================================
    // Fetch all messages with pagination (Supabase caps at 1000 per request)
    let allMessages = [];
    let offset = 0;
    const PAGE_SIZE = 1000;
    while (true) {
      const { data: batch, error: batchErr } = await supabase
        .from("messages")
        .select("id, conversation_id, created_at, role, content")
        .gte("created_at", thirtyDaysAgo)
        .order("created_at", { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1);
      if (batchErr) throw batchErr;
      if (!batch || batch.length === 0) break;
      allMessages = allMessages.concat(batch);
      if (batch.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }
    const msgErr = null;

    if (msgErr) throw msgErr;

    // Group by conversation
    const convMap = {};
    for (const msg of allMessages || []) {
      if (!convMap[msg.conversation_id]) convMap[msg.conversation_id] = [];
      convMap[msg.conversation_id].push(msg);
    }

    const convIds = Object.keys(convMap);
    const convCount30d = convIds.length;

    // Count by period
    let convCountToday = 0, convCount7d = 0;
    const todayTs = new Date(today).getTime();
    const sevenDaysAgoTs = new Date(sevenDaysAgo).getTime();
    // Helper: parse Supabase timestamps (may have space instead of T, or +00 suffix)
    const parseTs = (s) => {
      if (!s) return 0;
      const normalized = String(s).replace(' ', 'T').replace(/\+00$/, '+00:00');
      const t = new Date(normalized).getTime();
      return isNaN(t) ? 0 : t;
    };
    for (const cid of convIds) {
      const firstMsg = convMap[cid][0]?.created_at;
      const firstMsgTs = parseTs(firstMsg);
      if (firstMsgTs >= todayTs) convCountToday++;
      if (firstMsgTs >= sevenDaysAgoTs) convCount7d++;
    }

    // Average turns (user messages only)
    const turnCounts = convIds.map(cid => convMap[cid].filter(m => m.role === "user").length);
    const avgTurns = turnCounts.length > 0
      ? (turnCounts.reduce((a, b) => a + b, 0) / turnCounts.length).toFixed(1)
      : 0;

    // ========================================
    // 2. FLOW ANALYSIS (from messages)
    // ========================================
    let flowComplete = 0;
    let expertOrientation = 0;
    let attemptsCollected = 0;
    let vehicleAsked = 0;
    let modelAsked = 0;
    let kmAsked = 0;
    let cityCollected = 0;
    let closingReached = 0;
    let formCTA = 0;
    let mistralClosing = 0;
    let mentions1500 = 0;
    let deterministicFirst = 0;
    const unrecognizedMarques = {};
    const recentConvs = [];

    for (const cid of convIds) {
      const msgs = convMap[cid];
      const botMsgs = msgs.filter(m => m.role === "assistant").map(m => (m.content || "").toLowerCase());
      const userMsgs = msgs.filter(m => m.role === "user").map(m => (m.content || "").toLowerCase());
      const allBot = botMsgs.join(" ");

      const firstBot = botMsgs[0] || "";
      const deterPhrases = ["pas de panique", "c'est quelle voiture", "pot d'échappement avec des petits points"];
      if (deterPhrases.some(p => firstBot.includes(p))) deterministicFirst++;

      const hasVehicle = allBot.includes("quelle voiture") || allBot.includes("quel modèle");
      const hasModel = allBot.includes("quel modèle") || allBot.includes("modèle exactement");
      const hasKm = allBot.includes("combien de km");
      const hasAttempts = allBot.includes("déjà essayé") || allBot.includes("deja essaye");
      const hasExpert = allBot.includes("cendres métalliques") || allBot.includes("cendres metalliques");
      const hasCity = allBot.includes("quel coin") || allBot.includes("quelle ville");
      const hasClosing = allBot.includes("expert re-fap") && (allBot.includes("gratuit") || allBot.includes("rappelle"));
      const hasForm = allBot.includes("laisse tes coordonnées") || allBot.includes("formulaire");
      const hasMistral = allBot.includes("on est là pour t'aider") || allBot.includes("on est la pour t'aider");
      const has1500 = allBot.includes("1500");

      if (hasVehicle) vehicleAsked++;
      if (hasModel) modelAsked++;
      if (hasKm) kmAsked++;
      if (hasAttempts) attemptsCollected++;
      if (hasExpert) expertOrientation++;
      if (hasCity) cityCollected++;
      if (hasClosing) closingReached++;
      if (hasForm) formCTA++;
      if (hasMistral) mistralClosing++;
      if (has1500) mentions1500++;
      if (hasVehicle && hasAttempts && hasExpert) flowComplete++;

      // Detect unrecognized marques: bot asked vehicle 2+ times in same conv
      const vehicleAskCount = botMsgs.filter(m => m.includes("quelle voiture") || m.includes("quelle marque")).length;
      if (vehicleAskCount >= 2) {
        // Find user messages after first vehicle ask
        for (let i = 0; i < msgs.length; i++) {
          if (msgs[i].role === "assistant" && (msgs[i].content || "").toLowerCase().includes("quelle voiture")) {
            if (i + 1 < msgs.length && msgs[i + 1].role === "user") {
              const userReply = (msgs[i + 1].content || "").trim();
              if (userReply.length >= 3 && userReply.length < 80) {
                unrecognizedMarques[userReply] = (unrecognizedMarques[userReply] || 0) + 1;
              }
            }
            break;
          }
        }
      }

      // Recent conversations (last 20)
      const firstMsgTime = msgs[0]?.created_at;
      if (firstMsgTime >= sevenDaysAgo) {
        recentConvs.push({
          id: cid.substring(0, 8),
          date: firstMsgTime,
          userTurns: userMsgs.length,
          firstMsg: (userMsgs[0] || "").substring(0, 100),
          hasVehicle, hasModel, hasKm, hasAttempts, hasExpert, hasClosing, hasForm,
          hasMistral, has1500,
        });
      }
    }

    // Sort recent by date descending, keep 20
    recentConvs.sort((a, b) => new Date(b.date) - new Date(a.date));
    const recentTop20 = recentConvs.slice(0, 20);

    // ========================================
    // 3. ENRICHMENTS (from conversation_enrichments)
    // ========================================
    const { data: enrichments, error: enrErr } = await supabase
      .from("conversation_enrichments")
      .select("symptome_principal, marque, modele, ville, departement, km, previous_attempts, urgency_level, a_demande_prix, outcome, updated_at")
      .gte("updated_at", thirtyDaysAgo);

    if (enrErr) console.warn("Enrichments error:", enrErr.message);

    // Top marques
    const marqueCounts = {};
    const modeleCounts = {};
    const symptomeCounts = {};
    const villeCounts = {};
    const urgencyCounts = {};

    for (const e of enrichments || []) {
      if (e.marque) marqueCounts[e.marque] = (marqueCounts[e.marque] || 0) + 1;
      if (e.modele) modeleCounts[`${e.marque || "?"} ${e.modele}`] = (modeleCounts[`${e.marque || "?"} ${e.modele}`] || 0) + 1;
      if (e.symptome_principal) symptomeCounts[e.symptome_principal] = (symptomeCounts[e.symptome_principal] || 0) + 1;
      if (e.ville) villeCounts[e.ville] = (villeCounts[e.ville] || 0) + 1;
      if (e.urgency_level) urgencyCounts[e.urgency_level] = (urgencyCounts[e.urgency_level] || 0) + 1;
    }

    const sortObj = (obj, limit = 10) =>
      Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, limit).map(([name, count]) => ({ name, count }));

    // ========================================
    // 4. DAILY TREND (7 days)
    // ========================================
    const dailyTrend = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now - i * 86400000);
      const key = d.toISOString().split("T")[0];
      dailyTrend[key] = { conversations: 0, formCTA: 0, flowComplete: 0 };
    }
    for (const cid of convIds) {
      const firstMsg = convMap[cid][0]?.created_at;
      const firstMsgTs = parseTs(firstMsg);
      if (!firstMsg || firstMsgTs < sevenDaysAgoTs) continue;
      const day = String(firstMsg).replace(' ', 'T').split("T")[0];
      if (dailyTrend[day]) {
        dailyTrend[day].conversations++;
        const allBot = convMap[cid].filter(m => m.role === "assistant").map(m => (m.content || "").toLowerCase()).join(" ");
        if (allBot.includes("laisse tes coordonnées") || allBot.includes("formulaire")) dailyTrend[day].formCTA++;
        const hv = allBot.includes("quelle voiture") || allBot.includes("quel modèle");
        const ha = allBot.includes("déjà essayé");
        const he = allBot.includes("cendres métalliques") || allBot.includes("cendres metalliques");
        if (hv && ha && he) dailyTrend[day].flowComplete++;
      }
    }

    // ========================================
    // RESPONSE
    // ========================================
    const pct = (val, total) => total > 0 ? Math.round(val * 100 / total) : 0;

    return res.status(200).json({
      generated_at: now.toISOString(),
      overview: {
        conversations: { today: convCountToday, last7d: convCount7d, last30d: convCount30d },
        avgTurns: parseFloat(avgTurns),
      },
      flow: {
        total: convCount30d,
        deterministicFirst: { count: deterministicFirst, pct: pct(deterministicFirst, convCount30d) },
        vehicleAsked: { count: vehicleAsked, pct: pct(vehicleAsked, convCount30d) },
        modelAsked: { count: modelAsked, pct: pct(modelAsked, convCount30d) },
        kmAsked: { count: kmAsked, pct: pct(kmAsked, convCount30d) },
        attemptsCollected: { count: attemptsCollected, pct: pct(attemptsCollected, convCount30d) },
        expertOrientation: { count: expertOrientation, pct: pct(expertOrientation, convCount30d) },
        cityCollected: { count: cityCollected, pct: pct(cityCollected, convCount30d) },
        closingReached: { count: closingReached, pct: pct(closingReached, convCount30d) },
        formCTA: { count: formCTA, pct: pct(formCTA, convCount30d) },
        flowComplete: { count: flowComplete, pct: pct(flowComplete, convCount30d) },
      },
      quality: {
        mistralClosing: { count: mistralClosing, pct: pct(mistralClosing, convCount30d) },
        mentions1500: { count: mentions1500, pct: pct(mentions1500, convCount30d) },
      },
      topMarques: sortObj(marqueCounts),
      topModeles: sortObj(modeleCounts),
      topSymptomes: sortObj(symptomeCounts),
      topVilles: sortObj(villeCounts),
      urgencyDistribution: urgencyCounts,
      unrecognizedMarques: sortObj(unrecognizedMarques, 20),
      dailyTrend: Object.entries(dailyTrend).map(([date, data]) => ({ date, ...data })),
      recentConversations: recentTop20,
    });
  } catch (err) {
    console.error("Admin stats error:", err);
    return res.status(500).json({ error: err.message });
  }
}
