// /pages/api/chat.js
import { createClient } from "@supabase/supabase-js";

/**
 * Whitelist meta fields to avoid poisoning upsert with unexpected keys.
 */
function pickMeta(meta = {}) {
  return {
    page_url: meta.page_url ?? null,
    page_slug: meta.page_slug ?? null,
    page_type: meta.page_type ?? null,

    utm_source: meta.utm_source ?? null,
    utm_medium: meta.utm_medium ?? null,
    utm_campaign: meta.utm_campaign ?? null,
    utm_content: meta.utm_content ?? null,
    utm_term: meta.utm_term ?? null,

    referrer: meta.referrer ?? null,
    user_agent: meta.user_agent ?? null,
    ip_hash: meta.ip_hash ?? null,
  };
}

/**
 * Remove trailing DATA line from model output.
 * We keep DATA in DB but hide it in UI.
 */
function stripDataLine(text = "") {
  if (!text) return "";
  // Remove only the last DATA line if present
  return String(text)
    .replace(/\n?DATA:\s*\{[\s\S]*?\}\s*$/i, "")
    .trim();
}

/**
 * Extract trailing DATA JSON line if present.
 */
function extractDataJson(text = "") {
  if (!text) return null;
  const m = String(text).match(/DATA:\s*(\{[\s\S]*\})\s*$/i);
  if (!m) return null;
  const raw = m[1];
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function callMistral({ apiKey, model, messages }) {
  const resp = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.2,
    }),
  });

  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    throw new Error(`Mistral ${resp.status}: ${txt}`);
  }

  const data = await resp.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error("Mistral returned empty content");
  return String(content);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });

  try {
    // ✅ Vars (comme sur ton Vercel)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const mistralKey = process.env.MISTRAL_API_KEY;
    const mistralModel = process.env.MISTRAL_MODEL || "mistral-large-latest";

    if (!supabaseUrl) return res.status(500).json({ error: "Missing NEXT_PUBLIC_SUPABASE_URL" });
    if (!serviceKey) return res.status(500).json({ error: "Missing SUPABASE_SERVICE_ROLE_KEY" });
    if (!mistralKey) return res.status(500).json({ error: "Missing MISTRAL_API_KEY" });

    const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    const body = req.body || {};
    const session_id = body.session_id ? String(body.session_id) : "";
    const message = body.message ? String(body.message) : "";
    const meta = body.meta || {};

    if (!session_id) return res.status(400).json({ error: "Missing session_id" });
    if (!message.trim()) return res.status(400).json({ error: "Missing message" });

    // 1) Upsert conversation (1 conversation = 1 visiteur)
    const convoPayload = {
      session_id,
      source: "chatbot",
      last_seen_at: new Date().toISOString(),
      ...pickMeta(meta),
    };

    const { data: convo, error: convoErr } = await supabaseAdmin
      .from("conversations")
      .upsert(convoPayload, { onConflict: "session_id" })
      .select("id")
      .single();

    if (convoErr) {
      console.log("CONVO_UPSERT_ERR", convoErr);
      return res.status(500).json({ error: "Conversation upsert failed", details: convoErr.message });
    }

    const conversation_id = convo?.id;
    if (!conversation_id) return res.status(500).json({ error: "Missing conversation_id after upsert" });

    // 2) Insert message user
    const { error: userMsgErr } = await supabaseAdmin.from("messages").insert({
      conversation_id,
      role: "user",
      content: message,
    });

    if (userMsgErr) {
      console.log("USER_MSG_ERR", userMsgErr);
      return res.status(500).json({ error: "Insert user message failed", details: userMsgErr.message });
    }

    // 3) Load last 20 messages (for context)
    const { data: history, error: historyErr } = await supabaseAdmin
      .from("messages")
      .select("role, content")
      .eq("conversation_id", conversation_id)
      .order("created_at", { ascending: true })
      .limit(20);

    if (historyErr) {
      console.log("HISTORY_ERR", historyErr);
      return res.status(500).json({ error: "Load history failed", details: historyErr.message });
    }

    // 4) System Prompt (verrouillé stratégie + DATA)
    const systemPrompt = {
      role: "system",
      content: [
        "Tu es FAPexpert, assistant automobile officiel de Re-FAP (France).",
        "",
        "DEFINITION CRITIQUE :",
        '- "FAP" = Filtre A Particules diesel (automobile). Jamais le slang.',
        "- Tu ne parles que d’automobile et du FAP.",
        "",
        "OBJECTIF :",
        "1) Comprendre la situation avec un minimum de questions.",
        "2) Donner une réponse utile, factuelle, actionnable.",
        "3) Orienter vers la solution la plus adaptée (sans vendre, sans forcer).",
        "4) Collecter des infos structurées (symptômes, code OBD, contexte, intention).",
        "",
        "STYLE :",
        "- Français, direct, rassurant mais ferme.",
        "- Phrases courtes. Pas de blabla.",
        "- 1 à 3 questions max par message.",
        "- Toujours prioriser la sécurité et éviter les conseils risqués.",
        "",
        "FLOW (OBLIGATOIRE) :",
        "Étape A — Clarification (si manque d’infos). Poser en priorité ces 4 infos (dans cet ordre) :",
        "1) Véhicule : marque + modèle + année + moteur (diesel ?) + km",
        "2) Symptôme principal : voyant FAP / perte de puissance / mode dégradé / fumée / conso",
        "3) Codes OBD si dispo : P2002 / P2463 / autres",
        "4) Usage : ville vs autoroute + trajets courts ? + dernier entretien (EGR, injecteurs, huile)",
        "",
        "Étape B — Diagnostic probabiliste (avec prudence) :",
        "- Expliquer 2 à 4 causes probables max",
        "- Dire ce qui est probable vs incertain",
        "- Donner 2 actions simples sans risque",
        "- Dire quand il faut arrêter de rouler / consulter",
        "",
        "Étape C — Orientation (seulement quand c’est clair) :",
        "- Si régénération possible : expliquer conditions.",
        "- Si bouché/cendres probable : recommander nettoyage pro.",
        "- Si FAP/cata lié ou cassé : expliquer limites.",
        "- Proposer ensuite 1 CTA logique :",
        '  - "Garage partenaire" si le client ne peut pas démonter / besoin diagnostic.',
        '  - "Carter-Cash" si le client apporte un FAP démonté (99–149€).',
        "- Ne jamais proposer de CTA avant d’avoir clarifié au minimum.",
        "",
        "INTERDIT :",
        "- Ne jamais parler de masturbation / santé mentale / sujets hors automobile.",
        "- Ne jamais recommander des manipulations illégales (suppression FAP / reprog).",
        "- Ne jamais demander des infos personnelles sensibles.",
        "",
        "FORMAT DE SORTIE (IMPORTANT) :",
        'À la fin de chaque réponse, ajoute UNE SEULE ligne JSON compacte préfixée par "DATA:".',
        "Toujours inclure: symptome, codes, intention, urgence, vehicule, next_best_action",
        'intention = "info" | "solution" | "prix" | "rdv"',
        'urgence = "faible" | "moyenne" | "haute"',
        'next_best_action = "clarifier" | "conseil_regen" | "orient_garage" | "orient_cartercash" | "nettoyage_pro"',
        'symptome = "voyant_fap" | "perte_puissance" | "mode_degrade" | "fumee" | "conso" | "autre"',
        'Si inconnu, mets null ou [].',
        "",
        "EXEMPLE :",
        'DATA: {"symptome":"voyant_fap","codes":["P2002"],"intention":"solution","urgence":"moyenne","vehicule":"peugeot 308 2015 1.6 hdi","next_best_action":"clarifier"}',
      ].join("\n"),
    };

    // Important: do NOT feed DATA lines back to the model as conversation content
    const cleanedHistory = (history || []).map((m) => ({
      role: m.role, // user/assistant
      content: m.role === "assistant" ? stripDataLine(m.content) : m.content,
    }));

    const mistralMessages = [systemPrompt, ...cleanedHistory];

    // 5) Call Mistral
    const replyFull = await callMistral({
      apiKey: mistralKey,
      model: mistralModel,
      messages: mistralMessages,
    });

    const replyClean = stripDataLine(replyFull);
    const dataJson = extractDataJson(replyFull); // not mandatory, but useful for logs
    if (!dataJson) {
      // no crash: the model may forget sometimes
      console.log("NO_DATA_LINE_FROM_MODEL");
    }

    // 6) Insert assistant message (store FULL with DATA for later extraction)
    const { error: botMsgErr } = await supabaseAdmin.from("messages").insert({
      conversation_id,
      role: "assistant",
      content: replyFull,
    });

    if (botMsgErr) {
      console.log("BOT_MSG_ERR", botMsgErr);
      return res.status(500).json({ error: "Insert assistant message failed", details: botMsgErr.message });
    }

    // 7) Touch last_seen_at
    await supabaseAdmin
      .from("conversations")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("id", conversation_id);

    // Return CLEAN reply to UI
    return res.status(200).json({
      reply: replyClean,
      conversation_id,
    });
  } catch (e) {
    console.log("API_ERROR", e);
    return res.status(500).json({ error: "Server error", details: e?.message || String(e) });
  }
}
