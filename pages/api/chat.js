// /pages/api/chat.js
// FAPexpert Re-FAP — VERSION 5.0 STABLE
// Flow 100% hardcodé - PAS de LLM pour les messages

import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

// ============================================================
// CONFIG
// ============================================================
const FORM_URL = "https://auto.re-fap.fr/#devis";

// ============================================================
// SUPABASE
// ============================================================
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ============================================================
// CORS
// ============================================================
const ALLOWED_ORIGINS = [
  "https://autoai-re-fap-v2.vercel.app",
  "https://re-fap.fr",
  "https://www.re-fap.fr",
  "http://localhost:3000",
];

// ============================================================
// EXTRACTION : Symptôme
// ============================================================
function extractSymptome(text) {
  const t = String(text || "").toLowerCase();
  if (t.includes("voyant")) return "voyant_fap";
  if (t.includes("puissance") || t.includes("avance") || t.includes("tire")) return "perte_puissance";
  if (t.includes("dégradé") || t.includes("tortue")) return "mode_degrade";
  if (t.includes("fume") || t.includes("fumée")) return "fumee";
  if (t.includes("odeur")) return "odeur";
  if (t.includes("bouché") || t.includes("encrassé") || t.includes("fap")) return "autre";
  return "inconnu";
}

// ============================================================
// EXTRACTION : Véhicule
// ============================================================
function extractVehicule(text) {
  const t = String(text || "").toLowerCase();
  const marques = ["peugeot", "renault", "citroen", "citroën", "volkswagen", "vw", "audi", "bmw", "mercedes", "ford", "opel", "fiat", "toyota", "nissan", "hyundai", "kia", "seat", "skoda", "dacia", "volvo", "mini", "mazda", "suzuki", "honda"];
  
  for (const marque of marques) {
    if (t.includes(marque)) {
      const regex = new RegExp(marque + "[\\s\\-]*([a-z0-9]+)?", "i");
      const match = text.match(regex);
      if (match) {
        let v = match[0].trim();
        const motor = text.match(/(hdi|tdi|dci|cdti|jtd|bluehdi)/i);
        if (motor) v += " " + motor[1].toUpperCase();
        return v;
      }
    }
  }
  
  // Si message court sans marque, c'est probablement le véhicule
  if (text.length < 25) {
    const motor = text.match(/(hdi|tdi|dci|cdti)/i);
    if (motor || text.match(/[0-9]{3}/)) {
      return text.trim();
    }
  }
  return null;
}

// ============================================================
// INFÉRENCES
// ============================================================
function inferUrgence(text) {
  const t = String(text || "").toLowerCase();
  if (["bloqué", "panne", "plus rouler", "urgent", "autoroute"].some(w => t.includes(w))) return "haute";
  if (["voyant", "puissance", "fume", "dégradé"].some(w => t.includes(w))) return "moyenne";
  return "basse";
}

function buildSynthese(allTexts) {
  const all = allTexts.join(" ").toLowerCase();
  const parts = [];
  if (all.includes("voyant")) parts.push("voyant allumé");
  if (all.includes("puissance") || all.includes("avance") || all.includes("tire")) parts.push("perte de puissance");
  if (all.includes("fume") || all.includes("fumée")) parts.push("fumée");
  if (all.includes("dégradé")) parts.push("mode dégradé");
  if (all.includes("bloqué") || all.includes("panne")) parts.push("véhicule bloqué");
  if (parts.length === 0) parts.push("problème FAP");
  return parts.join(" + ");
}

function extractMotsCles(text, vehicule) {
  const kw = [];
  const t = String(text || "").toLowerCase();
  if (t.includes("voyant")) kw.push("voyant fap allumé");
  if (t.includes("puissance")) kw.push("perte puissance fap");
  if (t.includes("bouché")) kw.push("fap bouché");
  if (vehicule) kw.push(`nettoyage fap ${vehicule}`.toLowerCase());
  return kw;
}

// ============================================================
// AUTH
// ============================================================
function getCookie(req, name) {
  const h = req.headers.cookie || "";
  const f = h.split(";").find(c => c.trim().startsWith(name + "="));
  return f ? decodeURIComponent(f.split("=").slice(1).join("=")) : null;
}

function verifySignedCookie(value, secret) {
  if (!value || !secret) return false;
  const [nonce, sig] = value.split(".");
  if (!nonce || !sig) return false;
  return sig === crypto.createHmac("sha256", secret).update(nonce).digest("hex");
}

// ============================================================
// HELPERS
// ============================================================
function userSaysYes(text) {
  const t = String(text || "").toLowerCase().trim();
  return ["oui", "ouais", "ok", "d'accord", "yes", "yep", "volontiers", "je veux", "avec plaisir", "bien sûr", "carrément"].some(w => t.includes(w)) || t === "o";
}

function userSaysNo(text) {
  const t = String(text || "").toLowerCase().trim();
  return ["non", "nan", "nope", "pas maintenant", "plus tard"].some(w => t.includes(w));
}

function userWantsForm(text) {
  const t = String(text || "").toLowerCase();
  return ["rdv", "rendez-vous", "devis", "rappel", "prix", "tarif", "combien"].some(w => t.includes(w));
}

function countUserTurns(history) {
  return (history || []).filter(m => m?.role === "user").length;
}

function getLastBotIntent(history) {
  for (let i = (history || []).length - 1; i >= 0; i--) {
    const m = history[i];
    if (m?.role === "assistant" && m?.intent) return m.intent;
  }
  return null;
}

// ============================================================
// HANDLER
// ============================================================
export default async function handler(req, res) {
  // AUTH
  const secret = process.env.CHAT_API_TOKEN;
  const cookieName = process.env.CHAT_COOKIE_NAME || "re_fap_chat";
  if (!verifySignedCookie(getCookie(req, cookieName), secret)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  // CORS
  const origin = req.headers.origin;
  if (origin) {
    if (ALLOWED_ORIGINS.includes(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
    } else {
      return res.status(403).json({ error: "Origin non autorisée" });
    }
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Méthode non autorisée" });

  try {
    const { message, session_id, history = [] } = req.body;
    if (!message) return res.status(400).json({ error: "Message requis" });
    if (!session_id) return res.status(400).json({ error: "session_id requis" });

    // Collecter tous les messages user
    const allUserMessages = [...history.filter(m => m.role === "user").map(m => m.content), message];
    const allText = allUserMessages.join(" ");
    const userTurns = countUserTurns(history) + 1;
    const lastIntent = getLastBotIntent(history);

    // Extraire données
    let vehicule = null;
    for (const msg of [...allUserMessages].reverse()) {
      vehicule = extractVehicule(msg);
      if (vehicule) break;
    }
    
    const data = {
      symptome: extractSymptome(allText),
      vehicule: vehicule,
      urgence: inferUrgence(allText),
      verbatim_brut: allUserMessages[0] || "",
      mots_cles_seo: extractMotsCles(allText, vehicule),
    };

    // DB
    const { data: conv, error: convErr } = await supabase
      .from("conversations")
      .upsert({ session_id, last_seen_at: new Date().toISOString() }, { onConflict: "session_id" })
      .select("id").single();
    if (convErr) return res.status(500).json({ error: "Erreur DB", details: convErr.message });

    await supabase.from("messages").insert({ conversation_id: conv.id, role: "user", content: message });

    // ============================================================
    // LOGIQUE DE CONVERSATION
    // ============================================================
    let reply = "";
    let intent = "question";
    let action = null;

    // Demande explicite de formulaire
    if (userWantsForm(message)) {
      reply = "Parfait ! Laissez vos coordonnées ici, on vous rappelle rapidement pour vous orienter vers la meilleure solution.";
      intent = "form";
      action = { type: "OPEN_FORM", url: FORM_URL };
    }
    // Réponse à la question closing : OUI
    else if (lastIntent === "closing" && userSaysYes(message)) {
      reply = "Super ! Laissez vos coordonnées ici et on vous rappelle rapidement pour vous orienter vers la meilleure solution près de chez vous.";
      intent = "form";
      action = { type: "OPEN_FORM", url: FORM_URL };
    }
    // Réponse à la question closing : NON
    else if (lastIntent === "closing" && userSaysNo(message)) {
      reply = "Pas de souci ! Si vous changez d'avis ou avez d'autres questions, je suis là. Bonne route !";
      intent = "end";
    }
    // Tour 1 : Question ouverte
    else if (userTurns === 1) {
      reply = "Qu'est-ce qui se passe exactement avec votre voiture ?";
      intent = "question";
    }
    // Tour 2 : Demander le véhicule si pas encore donné
    else if (userTurns === 2 && !vehicule) {
      reply = "D'accord. C'est quelle voiture ?";
      intent = "question";
    }
    // Tour 2+ avec véhicule OU Tour 3+ : Closing
    else if ((userTurns === 2 && vehicule) || userTurns >= 3) {
      const synthese = buildSynthese(allUserMessages);
      const vehStr = vehicule ? ` sur votre ${vehicule}` : "";
      reply = `Merci pour ces infos. Ce que vous décrivez (${synthese}${vehStr}) ressemble à un encrassement du filtre à particules. Chez Re-FAP, on traite ce problème sans remplacement et sans suppression. Vous voulez qu'on vous aide à trouver un spécialiste près de chez vous ?`;
      intent = "closing";
    }
    // Fallback
    else {
      reply = "Pouvez-vous me décrire ce qui se passe avec votre voiture ?";
      intent = "question";
    }

    // Sauvegarder avec intent pour le tracking
    const fullContent = JSON.stringify({ reply, intent, data });
    await supabase.from("messages").insert({ conversation_id: conv.id, role: "assistant", content: fullContent });

    // Réponse
    const response = {
      reply: reply,
      session_id,
      conversation_id: conv.id,
      extracted_data: data,
      intent: intent,
    };
    if (action) response.action = action;

    return res.status(200).json(response);

  } catch (e) {
    console.error("❌ Erreur:", e);
    return res.status(500).json({ error: "Erreur serveur", details: e.message });
  }
}
