// pages/api/chat.js — handler ultra tolérant + raccourci métier + DEBUG (robuste aux accents cassés)
import { askModel } from "../../services/mistral.js";

export const config = { api: { bodyParser: false } };
const INCLUDE_DEBUG = process.env.NODE_ENV !== 'production';

// ------- utils lecture body -------
function readRaw(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}
function coerceMessages(payload, query) {
  if (Array.isArray(payload?.messages)) return payload.messages;
  const keys = ["message", "msg", "prompt", "q", "text", "input", "content"];
  for (const k of keys) {
    if (typeof payload?.[k] === "string" && payload[k].trim()) {
      return [{ role: "user", content: String(payload[k]) }];
    }
  }
  if (typeof query?.q === "string" && query.q.trim()) {
    return [{ role: "user", content: String(query.q) }];
  }
  return [];
}

// ------- règles métier locales -------
function strip(s){ return (s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,""); } // retire accents

function isGeneric(text){
  const t = strip(String(text||"")).trim().toLowerCase();
  if (!t) return true;
  const tokens = t.split(/\s+/);
  if (tokens.length <= 2) return /^(fap|dpf|voyant|panne|diag|diagnostic|filtre)$/.test(t);
  return false;
}

function signalsScore(text){
  const raw = String(text||"");
  const t   = strip(raw).toLowerCase(); // ex: "fumee noire"
  const u   = raw.toLowerCase();        // ex: "fum�e noire" (mojibake)

  const hasVoyant      = /\b(voyant|fap|moteur)\b/.test(t) || /\b(voyant|fap|moteur)\b/.test(u);
  const hasFumeeNoire  = /fumee\s*noire/.test(t) || /fum\S*?\s*noire/.test(u); // match "fumée", "fumee", "fum�e"
  const hasPertePuiss  = /(perte\s+de\s+puissance|mode\s+degrade)/.test(t) || /(perte\s+de\s+puissance|mode\s+d[eé]grad[ée]?)/.test(u);

  const score = (hasVoyant?1:0) + (hasFumeeNoire?1:0) + (hasPertePuiss?1:0);
  return { score, hasVoyant, hasFumeeNoire, hasPertePuiss };
}

function triagePayload(){
  return {
    stage:"triage",
    title:"Diagnostic rapide FAP",
    summary:"Je vérifie en 5 questions oui/non pour trier vite et bien.",
    questions:[
      {id:"q1",q:"Voyant moteur/FAP allumé ?"},
      {id:"q2",q:"Fumée noire à l’accélération ?"},
      {id:"q3",q:"Perte de puissance / mode dégradé ?"},
      {id:"q4",q:"Trajets courts répétés récemment ?"},
      {id:"q5",q:"Dernier trajet >20 min à >2500 tr/min ?"}
    ],
    suspected:[],
    risk:"low",
    actions:[],
    cta:{label:"Voir un garage partenaire",url:"https://re-fap.fr/trouver_garage_partenaire/",reason:"Utile si voyant/puissance/fumée"},
    alt_cta:[],
    follow_up:["Réponds: 1.oui 2.non 3.oui 4.non 5.non"],
    legal:"Pas de suppression du FAP (illégal)."
  };
}

function diagFapPayload(){
  return {
    stage:"diagnosis",
    title:"FAP possiblement encrassé (régénération bloquée)",
    summary:"Fumée noire +/ou perte de puissance → filtre saturé ou capteur diff. à contrôler.",
    questions:[],
    suspected:["FAP"],
    risk:"moderate",
    actions:[
      "Rouler 20–30 min à 2500–3000 tr/min (voie rapide) pour tenter une régénération.",
      "Contrôler capteur pression différentielle + admissions (fuites).",
      "Si aucun effet → passer au garage partenaire."
    ],
    cta:{label:"Prendre un diag + démontage (garage partenaire)",url:"https://re-fap.fr/trouver_garage_partenaire/",reason:"Valider FAP et éviter le mode dégradé."},
    alt_cta:[{label:"FAP déjà démonté ? Envoyer chez Re-FAP",url:"https://www.re-fap.fr",reason:"Nettoyage direct si FAP déposé."}],
    follow_up:["Odeur de brûlé ou bruit métallique ? (oui/non)"],
    legal:"Pas de suppression FAP (illégal). Arrêt immédiat si odeur de brûlé."
  };
}

// ------- handler -------
export default async function handler(req, res) {
  try {
    let payload = {};
    if (req.method === "POST") {
      const raw = await readRaw(req);
      if (raw) {
        try { payload = JSON.parse(raw); }
        catch {
          if (raw.includes("=") && raw.includes("&")) {
            try { payload = Object.fromEntries(new URLSearchParams(raw)); }
            catch { payload = { message: raw }; }
          } else { payload = { message: raw }; }
        }
      }
    } else if (req.method === "GET") {
      payload = {};
    } else {
      return res.status(405).json({ error: "method_not_allowed", hint: "POST or GET ?q=" });
    }

    const messages = coerceMessages(payload, req.query);
    if (!messages.length) {
      return res.status(400).json({ error:"messages_missing", hint:"Send { messages:[{role:'user',content:'...'}] } or { message:'...' } or GET ?q=" });
    }

    const last = messages[messages.length-1]?.content || "";
    const generic = isGeneric(last);
    const sig = signalsScore(last);

    // Raccourcis métier (avec debug)
    if (generic) {
      const out = triagePayload();
      if (INCLUDE_DEBUG) out.debug = { path:"shortcut-triage", last, ...sig, generic };
      return res.status(200).json(out);
    }
    if (sig.score >= 2) {
      const out = diagFapPayload();
      if (INCLUDE_DEBUG) out.debug = { path:"shortcut-fap", last, ...sig, generic };
      return res.status(200).json(out);
    }

    // Sinon: modèle
    const out = await askModel(messages);
    if (out && typeof out === "object") if (INCLUDE_DEBUG) out.debug = { path:"model", last, ...sig, generic };
    return res.status(200).json(out);
  } catch (e) {
    console.error("API /chat error:", e);
    return res.status(500).json({ error: "server_error", detail: String(e?.message || e) });
  }
}


