// pages/api/chat.js
// Bot "mécano triage" orienté RDV diagnostic (IDGarages) + option Carter-Cash si FAP déjà démonté.
// - Tarifs verrouillés côté serveur
// - Pas de régénération
// - Deep link avec lead_id + cp + immat (si consentis)

// ===== 0) PRICING & COMMERCIAL WORDING =====
const PRICING = {
  fap_clean_min: 99,
  fap_clean_max: 149,
  replacement_ref: 1000,
  diag_min: 50,
  diag_max: 90,
};

// --- Commercial : wording imposé
const COMMERCIAL_FIX =
  "pack tout compris (démontage → nettoyage Re-FAP → remontage → réinitialisation)";

// Toute mention confuse est remplacée par COMMERCIAL_FIX
const BAN_REGEX =
  /(nettoyage\s+sans\s+d[eé]monter|nettoyage\s+sans\s+d[eé]montage|additif[s]?|produit\s+à\s+injecter|defap|défap|suppression\s+fap)/gi;

// ===== 1) Utils =====
const DIAG_BASE_URL =
  "https://www.idgarages.com/fr-fr/prestations/diagnostic-electronique";

function normalize(s = "") {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}+/gu, "")
    .replace(/[^\p{L}\p{N}\s\-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// --- Extraction consentie du CP/immat ---------------------------------
function extractCp(text = "") {
  const m = String(text).match(/\b(\d{5})\b/);
  return m ? m[1] : null;
}
function extractImmat(text = "") {
  // Formats FR: AA-123-BB ou AA123BB (standard SIV)
  const m = String(text).toUpperCase().match(/\b([A-Z]{2}-?\d{3}-?[A-Z]{2})\b/);
  return m ? m[1].replace(/-/g, "-") : null;
}
function buildDiagUrl({ lead_id, cp, immat, ref, promo }) {
  const params = new URLSearchParams({
    utm_source: "re-fap",
    utm_medium: "bot",
    utm_campaign: "conseils-eco-auto",
  });
  if (lead_id) params.set("lead_id", lead_id);
  if (ref) params.set("ref", ref);
  if (cp) params.set("cp", cp);
  if (immat) params.set("immat", immat);
  if (promo) params.set("promo", promo);
  return `${DIAG_BASE_URL}?${params.toString()}`;
}

// --- Détection cas FAP urgent (voyant + perte de puissance) ---
function looksUrgentFap(text = "") {
  const t = normalize(text);
  const hasVoyant = /\b(voyant|lumi[eè]re)\b/.test(t);
  const hasPertePuiss = /\b(perte|plus)\b.{0,10}\b(puissance)\b/.test(t);
  const mentionsFap = /\b(fap|dpf|filtre.?a.?particule[s]?)\b/.test(t);
  return hasVoyant && hasPertePuiss && (mentionsFap || true);
}

function urgentFapJSON() {
  return {
    stage: "handoff",
    title: "FAP saturé : RDV diag urgent",
    summary:
      "Perte de puissance + voyant = risque mécanique. On confirme au diagnostic puis on traite vite.",
    questions: [{ id: "q1", q: "Peux-tu déposer le FAP toi-même ? (oui/non)" }],
    suspected: ["FAP"],
    risk: "high",
    actions: [
      "Évite les longs trajets et les régimes élevés jusqu’au RDV.",
      "Prendre RDV diagnostic : lecture défauts, vérif capteurs, mesure contre-pression.",
      `Si FAP confirmé : ${COMMERCIAL_FIX}.`,
      `Le nettoyage seul (FAP déjà déposé chez Carter-Cash) coûte ${PRICING.fap_clean_min}–${PRICING.fap_clean_max} €. Avec dépose/remontage + réinitialisation, le total est chiffré par le garage (selon le véhicule).`,
    ],
    cta: { label: "", url: "", reason: "" },
    alt_cta: [
      {
        label: "Déposer mon FAP chez Carter-Cash",
        url: "https://auto.re-fap.fr",
        reason:
          "FAP déjà démonté : dépôt simple, nettoyage Re-FAP, récup’ comme neuf.",
      },
    ],
    follow_up: [
      "Si tu as un code défaut OBD, indique-le.",
      "Dis-moi si tu préfères déposer le FAP toi-même (Carter-Cash) ou passer par le garage partenaire.",
    ],
    legal:
      "Ne constitue pas un diagnostic officiel. Suppression/neutralisation du FAP interdite.",
  };
}

function looksLikeVibrationQuery(q) {
  const qn = normalize(q);
  return /\b(vibration|vibrations|vibre|tremblement|tremblements|tremble|equilibrage|equilibrer|jante|jantes|disque voil|cardan|cardans|rotule|rotules|amortisseur|amortisseurs)\b/.test(
    qn
  );
}
function mentionsFapDemonte(text = "") {
  const t = normalize(text);
  return /\b(fap\b.*(demonte|depose)|demonte\b.*fap|depose\b.*fap)\b/.test(t);
}
function hasFapInSuspected(obj) {
  const suspected = Array.isArray(obj?.suspected)
    ? obj.suspected.join(" ").toLowerCase()
    : "";
  return /(?:^|\W)(fap|dpf|filtre.*particule)(?:$|\W)/.test(suspected);
}

function sanitizeText(s = "") {
  let t = String(s || "");
  // Interdit : promesses de prix erronées / gratuit / remboursé
  t = t.replace(
    /diagnostic\s+(gratuit|rembours[ée]|d[ée]duit)/gi,
    "diagnostic (prix affiché avant validation)"
  );
  t = t.replace(/\b(gratuit|free)\b/gi, "affiché avant validation");
  // Interdit : "nettoyage sans démonter", additifs, défap, etc.
  t = t.replace(BAN_REGEX, COMMERCIAL_FIX);
  return t;
}

function ensurePedoCommerciale(obj, isFap) {
  obj.follow_up = Array.isArray(obj.follow_up) ? obj.follow_up : [];
  const lines = isFap
    ? [
        `Pourquoi le nettoyage Re-FAP : solution légale, résultat équivalent à neuf, ~10× moins cher qu’un remplacement > ${PRICING.replacement_ref} €, garanti 1 an.`,
        "Le diagnostic évite les frais au hasard : lecture défauts, vérif capteurs, mesure contre-pression, puis la bonne suite.",
      ]
    : [
        "Le diagnostic évite les dépenses au hasard : lecture défauts + essai routier = cause confirmée et plan clair.",
      ];
  for (const l of lines) {
    if (!obj.follow_up.some((x) => String(x || "").toLowerCase() === l.toLowerCase())) {
      obj.follow_up.push(l);
    }
  }
}

function oneStrongCTA(obj, label, url, reason) {
  obj.cta = { label, url, reason };
  obj.alt_cta = []; // on force un seul CTA (Phase A)
}

function sanitizeObjToBrief(obj, { leadUrl, isFap, forceCarter }) {
  if (!obj || typeof obj !== "object") obj = {};
  obj.stage = obj.stage || "triage";
  obj.title = obj.title || (isFap ? "FAP probable : on confirme" : "Diagnostic recommandé");
  obj.summary =
    obj.summary ||
    (isFap
      ? "On confirme d’abord au diagnostic, puis on propose la solution la plus économique."
      : "Symptômes incertains : un diagnostic confirmera la cause et évitera des dépenses inutiles.");
  obj.questions = Array.isArray(obj.questions) ? obj.questions.slice(0, 5) : [];

  // Nettoyage des actions : pas de régénération, pas d'ambiguïtés commerciales
  obj.actions = (obj.actions || []).filter((a) => {
    const s = String(a || "");
    const banRegen = /r[eé]g[eé]n[eé]ration|2500.?3000|tr.?min/i.test(s);
    const banAmbig =
      /(sans\s+d[eé]monter|sans\s+d[eé]montage|additif|produit\s+à\s+injecter|defap|défap|suppression\s+fap)/i.test(
        s
      );
    return !banRegen && !banAmbig;
  });

  if (isFap && !forceCarter) {
    obj.actions.unshift(
      `Si FAP confirmé : devis ${COMMERCIAL_FIX}, bien moins cher qu’un remplacement.`
    );
  } else if (!forceCarter) {
    obj.actions.unshift(
      "Le garage lit les défauts, vérifie capteurs et freins/train roulant, puis te donne la bonne suite."
    );
  }

  ensurePedoCommerciale(obj, isFap);
  obj.legal =
    "Ne constitue pas un diagnostic officiel. Suppression/neutralisation du FAP interdite.";

  if (forceCarter) {
    oneStrongCTA(
      obj,
      "Déposer mon FAP chez Carter-Cash",
      "https://auto.re-fap.fr",
      "FAP déjà démonté : dépôt simple, nettoyage Re-FAP, récup’ comme neuf."
    );
  } else {
    oneStrongCTA(
      obj,
      "Prendre RDV diagnostic près de chez moi",
      leadUrl,
      "On confirme la cause et on évite les frais au hasard."
    );
  }

  // Sanitize textes
  obj.actions = obj.actions.map(sanitizeText);
  obj.follow_up = obj.follow_up.map(sanitizeText);
  obj.summary = sanitizeText(obj.summary);

  return obj;
}

function renderTextFromObj(obj, { isFap, forceCarter }) {
  const L = [];
  if (forceCarter) {
    L.push("FAP déjà démonté : inutile de diagnostiquer, on passe direct au nettoyage Re-FAP.");
    L.push("👉 Dépose en Carter-Cash, tu récupères un FAP comme neuf (garantie 1 an).");
    L.push("Prochaine étape : Clique sur « Déposer mon FAP chez Carter-Cash » (bouton à droite).");
    return L.join("\n");
  }

  if (isFap) {
    L.push(
      "Ça ressemble à un FAP saturé. On confirme d’abord pour éviter les frais au hasard, puis on traite vite."
    );
    L.push("");
    L.push("Au diagnostic, le garage :");
    L.push("- lit les défauts et vérifie les capteurs,");
    L.push("- mesure la contre-pression du FAP,");
    L.push("- te propose la bonne suite.");
    L.push("Le diagnostic est obligatoire pour confirmer que c’est bien le FAP.");
    L.push("");
    L.push(`Si FAP confirmé : ${COMMERCIAL_FIX}.`);
    L.push(
      `Important : les ${PRICING.fap_clean_min}–${PRICING.fap_clean_max} € correspondent au nettoyage seul quand le FAP est déjà déposé en point de dépôt Carter-Cash.`
    );
    L.push(
      "Avec dépose/remontage + réinitialisation (devis tout compris chez le garage partenaire), le total est plus élevé et dépend du véhicule."
    );
    L.push(
      `Référence : un remplacement FAP dépasse souvent ${PRICING.replacement_ref} € ; notre solution reste bien plus économique.`
    );
  } else {
    L.push("Symptômes incertains. On ne va pas te faire payer au hasard : on confirme d’abord.");
    L.push("Au diagnostic : lecture défauts + essai routier → cause confirmée et plan clair.");
  }
  L.push("");
  L.push("Prochaine étape : Clique sur « Prendre RDV diagnostic près de chez moi » (bouton à droite).");
  return L.join("\n");
}

function decideNextActionFromObj(obj, { forceCarter, isFap }) {
  if (forceCarter) return { type: "FAP" };
  if (isFap) return { type: "FAP" };
  return { type: "DIAG" };
}

function fallbackVibrationJSON() {
  return {
    stage: "triage",
    title: "Vibrations : diagnostic recommandé",
    summary:
      "Vibrations = souvent roues/freins/train roulant. Un diagnostic évite les dépenses au hasard.",
    questions: [
      { id: "q1", q: "À quelle vitesse ? (>90 km/h = roues)" },
      { id: "q2", q: "Au freinage ? (disques à contrôler)" },
      { id: "q3", q: "Au volant ou dans le siège ? (avant vs transmission)" },
    ],
    suspected: ["roues déséquilibrées", "disques voilés", "rotules/amortisseurs"],
    risk: "low",
    actions: [
      "Contrôle rapide pneus/équilibrage, évite les hautes vitesses.",
      "Le garage lit les défauts + essai routier, puis te donne la bonne suite.",
    ],
    cta: { label: "", url: "", reason: "" },
    alt_cta: [],
    follow_up: [],
    legal: "",
  };
}

// ===== 2) LLM handler =====
export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Méthode non autorisée" });
    if (!process.env.MISTRAL_API_KEY)
      return res.status(500).json({ error: "MISTRAL_API_KEY manquante" });

    const { question, historique, consent_cp_immat } = req.body || {};
    if (!question || typeof question !== "string")
      return res.status(400).json({ error: "Question invalide" });

    // Génération lead_id
    const lead_id =
      globalThis.crypto?.randomUUID?.() || require("crypto").randomUUID();
    const ref = "bot_autoai";
    const textPool = `${historique || ""}\n${question || ""}`;

    // Extraction CP/immat si l’utilisateur l’a implicitement permis
    const cp = consent_cp_immat ? extractCp(textPool) : null;
    const immat = consent_cp_immat ? extractImmat(textPool) : null;

    const forceCarter = mentionsFapDemonte(textPool);
    const diagUrl = buildDiagUrl({ lead_id, cp, immat, ref });

    // Kill-switch vibrations → pas d’appel LLM
    if (looksLikeVibrationQuery(question)) {
      const base = fallbackVibrationJSON();
      const clean = sanitizeObjToBrief(base, {
        leadUrl: diagUrl,
        isFap: false,
        forceCarter: false,
      });
      const text = renderTextFromObj(clean, { isFap: false, forceCarter: false });
      const meta = {
        service: "diag_fap",
        confidence: 0.35,
        reason: "vibrations hors FAP → besoin d’un garage",
        params: {
          lead_id,
          cp,
          immat,
          ref,
          utm_source: "re-fap",
          utm_medium: "bot",
          utm_campaign: "conseils-eco-auto",
        },
        cta: clean.cta,
        fallback: false,
      };
      return res.status(200).json({
        reply: text,
        data: clean,
        nextAction: decideNextActionFromObj(clean, {
          forceCarter: false,
          isFap: false,
        }),
        handoff_meta: meta,
      });
    }

    // Kill-switch urgence FAP (voyant + perte de puissance)
    if (looksUrgentFap(textPool) && !forceCarter) {
      const base = urgentFapJSON();
      const clean = sanitizeObjToBrief(base, {
        leadUrl: diagUrl,
        isFap: true,
        forceCarter,
      });
      const text = renderTextFromObj(clean, { isFap: true, forceCarter });
      const meta = {
        service: "diag_fap",
        confidence: 0.85,
        reason: "voyant + perte de puissance → urgence FAP",
        params: {
          lead_id,
          cp,
          immat,
          ref,
          utm_source: "re-fap",
          utm_medium: "bot",
          utm_campaign: "conseils-eco-auto",
        },
        cta: clean.cta,
        fallback: false,
      };
      return res.status(200).json({
        reply: text,
        data: clean,
        nextAction: decideNextActionFromObj(clean, { forceCarter, isFap: true }),
        handoff_meta: meta,
      });
    }

    // Sinon, on utilise le LLM pour classer FAP vs non-FAP (le rendu/CTA reste serveur)
    const system = `Tu es AutoAI, mécano triage Re-FAP.
Objectif: en ≤5 questions, orienter l’utilisateur vers un RDV diagnostic si un garage est nécessaire (99% des cas).
Règles:
- Pas de régénération, pas de reprogrammation, jamais de suppression FAP.
- Ton pro, direct, humain, sans jargon inutile.
- Si "FAP déjà démonté" → orienter Carter-Cash (point de dépôt).
- Réponds UNIQUEMENT par un objet JSON conforme au schéma demandé, ≤120 mots, FR.
Schéma:{
  "stage": "triage|diagnosis|handoff",
  "title": "string",
  "summary": "string",
  "questions": [{"id":"q1","q":"string"}],
  "suspected": ["string"],
  "risk": "low|moderate|high",
  "actions": ["string"],
  "cta": {"label":"string","url":"string","reason":"string"},
  "alt_cta": [{"label":"string","url":"string","reason":"string"}],
  "follow_up": ["string"],
  "legal": "string"
}`;

    const userContent = `Historique (résumé): ${historique || "(vide)"}
Question: ${question}

Consigne: rends UNIQUEMENT l'objet JSON conforme au schéma (≤120 mots).`;

    let obj = null;
    try {
      const r = await fetch("https://api.mistral.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.MISTRAL_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "mistral-medium-latest",
          temperature: 0.2,
          top_p: 0.9,
          max_tokens: 600,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: system },
            { role: "user", content: userContent },
          ],
        }),
      });
      if (r.ok) {
        const data = await r.json();
        const raw = (data.choices?.[0]?.message?.content || "").trim();
        try {
          obj = JSON.parse(raw);
        } catch {}
      }
    } catch {}

    // Fail-safe JSON min
    if (!obj) {
      obj = {
        stage: "triage",
        title: "Triage initial",
        summary: "On confirme la cause d’abord, puis on agit.",
        questions: [
          { id: "q1", q: "Voyant FAP/moteur allumé ?" },
          { id: "q2", q: "Perte de puissance ou fumée ?" },
          { id: "q3", q: "Trajets courts répétés ?" },
        ],
        suspected: [],
        risk: "low",
        actions: ["Réponds aux 3 questions pour orienter correctement."],
        cta: { label: "", url: "", reason: "" },
        alt_cta: [],
        follow_up: [],
        legal:
          "Ne constitue pas un diagnostic officiel. Suppression/neutralisation du FAP interdite.",
      };
    }

    // Détection FAP robuste: JSON + texte utilisateur
    const isFap =
      hasFapInSuspected(obj) ||
      /\b(fap|dpf|filtre.?a.?particule[s]?)\b/i.test(normalize(textPool));

    const clean = sanitizeObjToBrief(obj, {
      leadUrl: buildDiagUrl({ lead_id, cp, immat, ref }),
      isFap,
      forceCarter,
    });
    const text = renderTextFromObj(clean, { isFap, forceCarter });
    const meta = {
      service: "diag_fap",
      confidence: isFap ? 0.7 : 0.5,
      reason: isFap ? "signaux FAP" : "symptômes incertains",
      params: {
        lead_id,
        cp,
        immat,
        ref,
        utm_source: "re-fap",
        utm_medium: "bot",
        utm_campaign: "conseils-eco-auto",
      },
      cta: clean.cta,
      fallback: !obj,
    };

    return res.status(200).json({
      reply: text,
      data: clean,
      nextAction: decideNextActionFromObj(clean, { forceCarter, isFap }),
      handoff_meta: meta,
    });
  } catch (e) {
    console.error("/api/chat error", e);
    return res.status(500).json({ error: "Erreur serveur" });
  }
}
