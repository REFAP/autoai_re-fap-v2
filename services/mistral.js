import { MistralClient } from "@mistralai/mistralai";

const client = new MistralClient(process.env.MISTRAL_API_KEY || "");
const MODEL = process.env.MISTRAL_MODEL || "mistral-large-latest";

function safeParse(s){ try{ return typeof s==="object"?s:JSON.parse(s); } catch{ return null; } }
function isValid(o){ return o && typeof o==="object" && o.stage && o.title && o.summary && o.risk && o.cta && o.cta.url; }

function heuristic(messages){
  const last = [...messages].reverse().find(m=>m.role==="user")?.content?.toLowerCase() || "";
  const y = re => re.test(last);
  const score = [y(/voyant|fap|moteur/i), y(/fum(é|e)e?\s*noire|fumee noire/i), y(/perte de puissance|mode dégradé|degrade/i)].filter(Boolean).length;
  const suspected = score>=2?["FAP"]:["Non-FAP: à confirmer"];
  const risk = score>=2?"moderate":"low";
  const cta = score>=2
    ? { label:"Prendre un diag + démontage (garage partenaire)", url:"https://re-fap.fr/trouver_garage_partenaire/", reason:"Valider FAP et éviter le mode dégradé." }
    : { label:"Confirmer la panne (garage partenaire)", url:"https://www.idgarages.com/fr-fr/prestations/diagnostic-electronique?utm_source=re-fap&utm_medium=partenariat&utm_campaign=diagnostic-electronique&ept-publisher=re-fap&ept-name=re-fap-diagnostic-electronique", reason:"Diagnostic complet." };

  return {
    stage:"diagnosis",
    title: suspected[0]==="FAP" ? "FAP possiblement encrassé (régénération bloquée)" : "Panne à confirmer",
    summary: suspected[0]==="FAP" ? "Fumée noire +/ou perte de puissance → filtre saturé ou capteur diff. à contrôler." : "Symptômes non conclusifs sur le FAP.",
    questions:[], suspected, risk,
    actions: suspected[0]==="FAP"
      ? ["Rouler 20–30 min à 2500–3000 tr/min (voie rapide).","Contrôler capteur pression différentielle + admissions (fuites).","Si aucun effet → garage partenaire."]
      : ["Lire les codes défauts (OBD).","Éviter trajets courts jusqu’au diagnostic."],
    cta,
    alt_cta:[{ label:"FAP déjà démonté ? Envoyer chez Re-FAP", url:"https://www.re-fap.fr", reason:"Nettoyage direct si FAP déposé." }],
    follow_up:["Odeur de brûlé ou bruit métallique ? (oui/non)"],
    legal:"Pas de suppression FAP (illégal). Arrêt si odeur de brûlé."
  };
}

export async function askModel(messages=[]){
  try{
    const r = await client.chat.complete({
      model: MODEL, temperature: 0.2, maxTokens: 800,
      messages: [{ role:"system", content:"Réponds STRICTEMENT en JSON valide (un objet) correspondant au plan d'action automobile Re-FAP." }, ...messages],
    });
    const draft = r?.choices?.[0]?.message?.content ?? "";
    const parsed = safeParse(draft);
    if (isValid(parsed)) return parsed;
    return heuristic(messages);
  }catch(e){
    console.error("[Mistral] error:", e);
    return heuristic(messages);
  }
}