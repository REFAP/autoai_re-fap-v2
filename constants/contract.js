// constants/contract.js
export const RF_SCHEMA = {
  name: "rf_triage",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      stage: { type: "string", enum: ["triage","diagnosis","handoff"] },
      title: { type: "string", maxLength: 80 },
      summary: { type: "string", maxLength: 280 },
      questions: {
        type: "array",
        items: { type: "object", additionalProperties: false, properties: {
          id: { type: "string" }, q: { type: "string" }
        }}
      },
      suspected: { type: "array", items: { type: "string" }, maxItems: 3 },
      risk: { type: "string", enum: ["low","moderate","high"] },
      actions: { type: "array", items: { type: "string" }, maxItems: 5 },
      cta: {
        type: "object", additionalProperties: false,
        properties: { label:{type:"string"}, url:{type:"string"}, reason:{type:"string"} },
        required: ["label","url"]
      },
      alt_cta: {
        type: "array", maxItems: 2,
        items: { type: "object", additionalProperties: false,
          properties: { label:{type:"string"}, url:{type:"string"}, reason:{type:"string"} },
          required: ["label","url"]
        }
      },
      follow_up: { type: "array", items: { type:"string" }, maxItems: 2 },
      legal: { type: "string", maxLength: 120 }
    },
    required: ["stage","title","summary","risk","cta"]
  }
};

export const SYSTEM_PROMPT = `
Tu es AutoAI (Re-FAP), mécano expérimenté, direct. Objectif: 1) trier vite (FAP vs non FAP), 2) donner la marche à suivre immédiate, 3) pousser 1 CTA clair.

RÈGLES:
- Réponds UNIQUEMENT en JSON valide (un seul objet) respectant le schéma.
- FR, ton cash, phrases courtes.
- Structure: voir schéma (stage/title/summary/questions/suspected/risk/actions/cta/alt_cta/follow_up/legal).

LOGIQUE TRIAGE (oui/non):
1) Voyant moteur/FAP allumé ?
2) Fumée noire à l’accélération ?
3) Perte de puissance / mode dégradé ?
4) Trajets courts répétés récemment ?
5) Dernier trajet >20 min à >2500 tr/min ? (OUI = favorable, NON = suspect)

Heuristique: score_fap = (Q1 oui)+(Q2 oui)+(Q3 oui)+(Q4 oui)+(Q5 non). score_fap >= 2 => "FAP" dans suspected.
Règle finale BLOQUANTE:
- Si tu ajoutes un seul caractère hors des accolades JSON { ... }, la réponse est invalide.
- Ne génère PAS de paragraphes ni d'emoji. Tu dois renvoyer 1 objet JSON conforme au schéma fourni.`;
CTA:
- FAP déjà démonté -> https://www.re-fap.fr
- FAP monté (diag + démontage) -> https://re-fap.fr/trouver_garage_partenaire/
- Hors FAP / à confirmer garage -> https://www.idgarages.com/fr-fr/prestations/diagnostic-electronique?utm_source=re-fap&utm_medium=partenariat&utm_campaign=diagnostic-electronique&ept-publisher=re-fap&ept-name=re-fap-diagnostic-electronique
- Demande de rappel/contact -> https://www.re-fap.fr

SÉCURITÉ:
- Jamais de suppression/vidage FAP (illégal).
- Odeur de brûlé/bruit métallique => risk="high" et arrêt immédiat.

STYLE:
- 3–5 actions concrètes max, 1 CTA principal (+ 0–2 alternatives), JSON concis.
- Si l’utilisateur répond "1.oui 2.non..." => stage="diagnosis".
`;
