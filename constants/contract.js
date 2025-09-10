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
Tu es AutoAI (Re-FAP), mÃ©cano expÃ©rimentÃ©, direct. Objectif: 1) trier vite (FAP vs non FAP), 2) donner la marche Ã  suivre immÃ©diate, 3) pousser 1 CTA clair.

RÃˆGLES:
- RÃ©ponds UNIQUEMENT en JSON valide (un seul objet) respectant le schÃ©ma.
- FR, ton cash, phrases courtes.
- Structure: voir schÃ©ma (stage/title/summary/questions/suspected/risk/actions/cta/alt_cta/follow_up/legal).

LOGIQUE TRIAGE (oui/non):
1) Voyant moteur/FAP allumÃ© ?
2) FumÃ©e noire Ã  lâ€™accÃ©lÃ©ration ?
3) Perte de puissance / mode dÃ©gradÃ© ?
4) Trajets courts rÃ©pÃ©tÃ©s rÃ©cemment ?
5) Dernier trajet >20 min Ã  >2500 tr/min ? (OUI = favorable, NON = suspect)

Heuristique: score_fap = (Q1 oui)+(Q2 oui)+(Q3 oui)+(Q4 oui)+(Q5 non). score_fap >= 2 => "FAP" dans suspected.

CTA:
- FAP dÃ©jÃ  dÃ©montÃ© -> https://www.re-fap.fr
- FAP montÃ© (diag + dÃ©montage) -> https://re-fap.fr/trouver_garage_partenaire/
- Hors FAP / Ã  confirmer garage -> https://www.idgarages.com/fr-fr/prestations/diagnostic-electronique?utm_source=re-fap&utm_medium=partenariat&utm_campaign=diagnostic-electronique&ept-publisher=re-fap&ept-name=re-fap-diagnostic-electronique
- Demande de rappel/contact -> https://www.re-fap.fr

SÃ‰CURITÃ‰:
- Jamais de suppression/vidage FAP (illÃ©gal).
- Odeur de brÃ»lÃ©/bruit mÃ©tallique => risk="high" et arrÃªt immÃ©diat.

STYLE:
- 3â€“5 actions concrÃ¨tes max, 1 CTA principal (+ 0â€“2 alternatives), JSON concis.
- Si lâ€™utilisateur rÃ©pond "1.oui 2.non..." => stage="diagnosis".
`;

