ï»¿// services/mistral.js â€” Mistral dynamic import + JSON enforcement + guardrails (accent-proof)
import { RF_SCHEMA, SYSTEM_PROMPT } from "../constants/contract.js";
import { extractBotPayload } from "../lib/fallbacks.js";

const MODEL = process.env.MISTRAL_MODEL || "mistral-large-latest";
let _client = null;

// --- import dynamique CJS/ESM safe
async function getMistralClient() {
  if (_client) return _client;
  const mod = await import("@mistralai/mistralai");
  const MistralCtor = mod.default || mod.MistralClient || mod.Mistral;
  if (!MistralCtor) throw new Error("[Mistral] SDK introuvable");
  const apiKey = process.env.MISTRAL_API_KEY || process.env.MISTRAL_TOKEN || "";
  if (!apiKey) console.error("[Mistral] MISTRAL_API_KEY manquant");
  _client = new MistralCtor(apiKey);
  return _client;
}

// ---------- Utils ----------
function safeParse(str){try{return typeof str==="object"?str:JSON.parse(str);}catch{return null;}}
function isValidPayload(o){return o&&typeof o==="object"&&o.stage&&o.title&&o.summary&&o.risk&&o.cta&&o.cta.url;}
function strip(s){ return (s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,""); } // enlÃ¨ve accents

// Heuristiques signaux (accent-proof)
function signalsFrom(text){
  const t = strip(String(text||"")).toLowerCase();
  return {
    q1: /\b(voyant|fap|moteur)\b/.test(t),
    q2: /fumee\s*noire/.test(t),
    q3: /(perte\s+de\s+puissance|mode\s+degrade)/.test(t)
  };
}
function isGeneric(text){
  const t = strip(String(text||"")).trim().toLowerCase();
  if (!t) return true;
  const tokens = t.split(/\s+/);
  if (tokens.length<=2) return /^(fap|dpf|voyant|panne|diag|diagnostic|filtre)$/.test(t);
  return false;
}

// Triages/diagnostics standardisÃ©s
function makeTriagePayload(){
  return {
    stage:"triage",
    title:"Diagnostic rapide FAP",
    summary:"Je vÃ©rifie en 5 questions oui/non pour trier vite et bien.",
    questions:[
      {id:"q1",q:"Voyant moteur/FAP allumÃ© ?"},
      {id:"q2",q:"FumÃ©e noire Ã  lâ€™accÃ©lÃ©ration ?"},
      {id:"q3",q:"Perte de puissance / mode dÃ©gradÃ© ?"},
      {id:"q4",q:"Trajets courts rÃ©pÃ©tÃ©s rÃ©cemment ?"},
      {id:"q5",q:"Dernier trajet >20 min Ã  >2500 tr/min ?"}
    ],
    suspected:[],
    risk:"low",
    actions:[],
    cta:{label:"Voir un garage partenaire",url:"https://re-fap.fr/trouver_garage_partenaire/",reason:"Utile si voyant/puissance/fumÃ©e"},
    alt_cta:[],
    follow_up:["RÃ©ponds: 1.oui 2.non 3.oui 4.non 5.non"],
    legal:"Pas de suppression du FAP (illÃ©gal)."
  };
}
function makeFapDiagnosis(){
  return {
    stage:"diagnosis",
    title:"FAP possiblement encrassÃ© (rÃ©gÃ©nÃ©ration bloquÃ©e)",
    summary:"FumÃ©e noire +/ou perte de puissance â†’ filtre saturÃ© ou capteur diff. Ã  contrÃ´ler.",
    questions:[],
    suspected:["FAP"],
    risk:"moderate",
    actions:[
      "Rouler 20â€“30 min Ã  2500â€“3000 tr/min (voie rapide) pour tenter une rÃ©gÃ©nÃ©ration.",
      "ContrÃ´ler capteur pression diffÃ©rentielle + admissions (fuites).",
      "Si aucun effet â†’ passer au garage partenaire."
    ],
    cta:{label:"Prendre un diag + dÃ©montage (garage partenaire)",url:"https://re-fap.fr/trouver_garage_partenaire/",reason:"Valider FAP et Ã©viter le mode dÃ©gradÃ©."},
    alt_cta:[{label:"FAP dÃ©jÃ  dÃ©montÃ© ? Envoyer chez Re-FAP",url:"https://www.re-fap.fr",reason:"Nettoyage direct si FAP dÃ©posÃ©."}],
    follow_up:["Odeur de brÃ»lÃ© ou bruit mÃ©tallique ? (oui/non)"],
    legal:"Pas de suppression FAP (illÃ©gal). ArrÃªt immÃ©diat si odeur de brÃ»lÃ©."
  };
}

// ---------- Pass 2: forcer la sortie JSON ----------
async function forceJsonFromDraft(draft){
  const client = await getMistralClient();
  const schemaText = JSON.stringify(RF_SCHEMA.schema);
  const resp = await client.chat.complete({
    model: MODEL, temperature: 0, maxTokens: 700,
    messages: [
      { role:"system", content:"Validateur JSON strict. RÃ©ponds UNIQUEMENT par un objet JSON conforme au schÃ©ma. Aucun texte hors JSON." },
      { role:"user", content:"SchÃ©ma:\n"+schemaText+"\n\nConvertis ce brouillon en JSON strict:\n"+String(draft) }
    ]
  });
  return resp?.choices?.[0]?.message?.content ?? "";
}

// ---------- Guardrails post-modÃ¨le ----------
function enforceGuardrails(messages, payload){
  const last = [...messages].reverse().find(m=>m.role==="user")?.content || "";
  const sig = signalsFrom(last);
  const score = [sig.q1,sig.q2,sig.q3].filter(Boolean).length;
  const generic = isGeneric(last);
  const saysFap = Array.isArray(payload?.suspected) && payload.suspected.includes("FAP");
  // trace dev (visible dans npm run dev)
  console.log("[guard]", JSON.stringify({ last, generic, score, saysFap, stage: payload?.stage }));

  // 1) EntrÃ©e gÃ©nÃ©rique â†’ TRIAGE
  if (generic) return makeTriagePayload();

  // 2) â‰¥2 signaux â†’ DIAG FAP si pas dÃ©jÃ  FAP
  if (score>=2 && !saysFap) return makeFapDiagnosis();

  // 3) payload invalide â†’ TRIAGE
  if (!isValidPayload(payload)) return makeTriagePayload();

  // 4) sinon on garde tel quel
  return payload;
}

// ---------- API principale ----------
export async function askModel(messages = []){
  const client = await getMistralClient();

  const schemaText = JSON.stringify(RF_SCHEMA.schema);
  const sys = {
    role:"system",
    content: SYSTEM_PROMPT +
      "\n\nIMPORTANT: RÃ©ponds STRICTEMENT en JSON valide (un seul objet). Aucun texte hors JSON. " +
      "Respecte ce schÃ©ma:\n" + schemaText
  };

  try{
    // Pass 1 â€” demande JSON direct
    const r1 = await client.chat.complete({
      model: MODEL, temperature: 0.0, maxTokens: 800,
      messages: [sys, ...messages]
    });
    const draft = r1?.choices?.[0]?.message?.content ?? "";

    let payload = safeParse(draft);
    if (!payload) { try{ payload = extractBotPayload(draft);}catch{} }
    if (!isValidPayload(payload)) {
      const forced = await forceJsonFromDraft(draft);
      payload = safeParse(forced);
      if (!payload) { try{ payload = extractBotPayload(forced);}catch{} }
    }

    return enforceGuardrails(messages, payload);
  }catch(e){
    console.error("[Mistral] askModel error:", e);
    // fallback: au pire, applique la mÃªme logique mÃ©tier
    return enforceGuardrails(messages, null);
  }
}

