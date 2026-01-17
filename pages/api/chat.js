// /pages/api/chat.js
// FAPexpert Re-FAP - API Chat avec Mistral + Supabase
// VERSION 2.5 - Production Ready + Auth cookie signé + Garde-fous (UI short + DATA repair)

import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

// ============================================================
// SYSTEM PROMPT FAPEXPERT V2.1
// ============================================================
const SYSTEM_PROMPT = `Tu es FAPexpert, assistant Re-FAP. Tu collectes les mots du client pour comprendre son problème de Filtre à Particules.

DÉFINITION
"FAP" = Filtre à Particules automobile. Aucune autre interprétation.

COMPORTEMENT
- Une seule question par message.
- Pars toujours de ce que le client vient de dire.
- Si l'entrée est courte ou ambiguë, pose une question factuelle sur ce qui s'est passé, pas sur le problème en général.
- Si la réponse est émotionnelle ou non factuelle, ramène calmement vers un fait observable (voyant, comportement, moment).
- Cherche la précision, pas l'explication.
- Accepte les réponses floues, incomplètes, contradictoires.
- Ne corrige jamais son vocabulaire.
- Ne reformule jamais en jargon technique.
- Ne conclus jamais sans qu'il valide.

INTERDITS
- Listes, tableaux, checklists.
- Diagnostic avant d'avoir assez d'éléments.
- Résumés non demandés.
- Réponses longues.
- Ton professoral.
- Sujets hors automobile.
- Conseils de suppression FAP ou reprogrammation.

LONGUEUR
2 phrases max. 1 question max.

DATA
À la fin de chaque message, ajoute une seule ligne :
DATA: {"symptome":"<enum>","codes":[],"intention":"<enum>","urgence":"<enum>","vehicule":<string|null>,"next_best_action":"<enum>"}

La DATA est une structuration progressive des verbatims. Elle peut être partielle, évolutive, contradictoire. Ne force jamais une valeur pour "conclure".

Ne renseigne intention ou urgence que si l'utilisateur les exprime clairement. Sinon, conserve "inconnu" ou "inconnue".

next_best_action reste "poser_question" tant que le client n'a pas validé une attente.

Enums :
- symptome : "voyant_fap" | "perte_puissance" | "mode_degrade" | "fumee" | "odeur" | "regeneration_impossible" | "code_obd" | "autre" | "inconnu"
- codes : tableau de strings (ex: ["P2002"]) ou []
- intention : "diagnostic" | "devis" | "rdv" | "info_generale" | "comparaison" | "urgence" | "inconnu"
- urgence : "haute" | "moyenne" | "basse" | "inconnue"
- vehicule : string descriptif ou null
- next_best_action : "poser_question" | "proposer_diagnostic" | "proposer_rdv" | "proposer_devis" | "rediriger_garage" | "clore"`;

// ============================================================
// INITIALISATION SUPABASE
// ============================================================
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("❌ Variables Supabase manquantes");
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// ============================================================
// CORS : Domaines autorisés (production)
// ============================================================
const ALLOWED_ORIGINS = [
  "https://autoai-re-fap-v2.vercel.app",
  "https://re-fap.fr",
  "https://www.re-fap.fr",
  "http://localhost:3000",
];

// ============================================================
// AUTH : Helpers pour cookie signé
// ============================================================
function getCookie(req, name) {
  const cookieHeader = req.headers.cookie || "";
  const parts = cookieHeader.split(";").map((s) => s.trim());
  const found = parts.find((p) => p.startsWith(name + "="));
  if (!found) return null;
  return decodeURIComponent(found.split("=").slice(1).join("="));
}

function verifySignedCookie(value, secret) {
  if (!value || !secret) return false;
  const [nonce, sig] = value.split(".");
  if (!nonce || !sig) return false;
  const expected = crypto.createHmac("sha256", secret).update(nonce).digest("hex");
  return sig === expected;
}

// ============================================================
// FONCTION : Normaliser la position de DATA (force \n avant)
// ============================================================
function normalizeDataPosition(reply) {
  if (!reply) return "";
  return String(reply).replace(/([^\n])\s*DATA:\s*\{/g, "$1\nDATA: {");
}

// ============================================================
// FONCTION : Nettoyer la réponse (retirer DATA:) - REGEX ROBUSTE
// ============================================================
function cleanReplyForUI(fullReply) {
  if (!fullReply) return "";

  const normalized = normalizeDataPosition(fullReply);

  const match = normalized.match(/^([\s\S]*?)(?:\nDATA:\s*\{[\s\S]*\})\s*$/);
  if (match) {
    return match[1].trim();
  }

  const lines = normalized.split("\n");
  const cleanLines = [];
  for (const line of lines) {
    if (line.trim().startsWith("DATA:")) break;
    cleanLines.push(line);
  }

  const result = cleanLines.join("\n").trim();
  return result || String(fullReply).trim();
}

// ============================================================
// FONCTION : Extraire les données JSON de DATA: - REGEX ROBUSTE
// ============================================================
function extractDataFromReply(fullReply) {
  if (!fullReply) return null;

  const normalized = normalizeDataPosition(fullReply);

  const match = normalized.match(/\nDATA:\s*(\{[\s\S]*\})\s*$/);
  if (match) {
    try {
      return JSON.parse(match[1]);
    } catch (e) {
      console.warn("⚠️ Impossible de parser DATA JSON:", e.message);
    }
  }

  const lines = normalized.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (line.startsWith("DATA:")) {
      try {
        const jsonStr = line.substring(5).trim();
        return JSON.parse(jsonStr);
      } catch (e) {
        console.warn("⚠️ Fallback parse échoué:", e.message);
      }
      break;
    }
  }

  return null;
}

// ============================================================
// FALLBACK DATA
// ============================================================
const DEFAULT_DATA = {
  symptome: "inconnu",
  codes: [],
  intention: "inconnu",
  urgence: "inconnue",
  vehicule: null,
  next_best_action: "poser_question",
};

// ============================================================
// GARDE-FOU #1 : Enforcer réponse courte côté UI
// - 2 phrases max
// - 1 question max
// ============================================================
function enforceShortUI(text) {
  if (!text) return "";

  let t = String(text).replace(/\s+/g, " ").trim();

  // Garder au plus 2 "phrases" (split naïf mais efficace)
  const parts = t.match(/[^.!?]+[.!?]?/g) || [t];
  t = parts.slice(0, 2).join(" ").trim();

  // Garder au plus 1 question
  const qCount = (t.match(/\?/g) || []).length;
  if (qCount > 1) {
    const firstQ = t.indexOf("?");
    t = t.slice(0, firstQ + 1).trim();
  }

  return t;
}

// ============================================================
// GARDE-FOU #2 : Repair-call DATA only si absent / invalide
// ============================================================
function buildDataOnlySystemPrompt() {
  return `Tu génères UNIQUEMENT une seule ligne qui commence par "DATA: " suivie d'un JSON valide.
Aucun autre texte. Pas de backticks. Pas de phrases.

Format EXACT :
DATA: {"symptome":"<enum>","codes":[],"intention":"<enum>","urgence":"<enum>","vehicule":<string|null>,"next_best_action":"<enum>"}

Règles :
- Ne force pas une valeur si tu n'as pas l'info : utilise "inconnu"/"inconnue", [], null.
- codes = tableau de strings (ex: ["P2002"]) ou [].

Enums :
- symptome : "voyant_fap" | "perte_puissance" | "mode_degrade" | "fumee" | "odeur" | "regeneration_impossible" | "code_obd" | "autre" | "inconnu"
- intention : "diagnostic" | "devis" | "rdv" | "info_generale" | "comparaison" | "urgence" | "inconnu"
- urgence : "haute" | "moyenne" | "basse" | "inconnue"
- next_best_action : "poser_question" | "proposer_diagnostic" | "proposer_rdv" | "proposer_devis" | "rediriger_garage" | "clore"`;
}

async function repairDataOnly({ mistralApiKey, mistralModel, messagesForMistral }) {
  // Contexte réduit pour limiter coût + dérive
  const tail = messagesForMistral.slice(-8);

  const repairMessages = [
    { role: "system", content: buildDataOnlySystemPrompt() },
    ...tail,
    { role: "user", content: "Génère maintenant UNIQUEMENT la ligne DATA: (JSON valide) à partir du contexte." },
  ];

  const resp = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${mistralApiKey}`,
    },
    body: JSON.stringify({
      model: mistralModel,
      messages: repairMessages,
      temperature: 0.0,
      max_tokens: 120,
    }),
  });

  if (!resp.ok) return null;

  try {
    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content || "";
    return extractDataFromReply(content) || null;
  } catch {
    return null;
  }
}

// ============================================================
// HANDLER API
// ============================================================
export default async function handler(req, res) {
  const origin = req.headers.origin;

  // --------------------------------------------------------
  // AUTH : cookie httpOnly signé (vrai secret)
  // --------------------------------------------------------
  const cookieName = process.env.CHAT_COOKIE_NAME || "re_fap_chat";
  const secret = process.env.CHAT_API_TOKEN;

  const cookieValue = getCookie(req, cookieName);
  if (!verifySignedCookie(cookieValue, secret)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  // --------------------------------------------------------
  // CORS restreint + blocage explicite
  // --------------------------------------------------------
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

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Méthode non autorisée" });
  }

  try {
    const { message, session_id, history = [] } = req.body;

    // Validation
    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "Message requis" });
    }

    if (!session_id || typeof session_id !== "string") {
      return res.status(400).json({ error: "session_id requis" });
    }

    // Variables Mistral
    const mistralApiKey = process.env.MISTRAL_API_KEY;
    const mistralModel = process.env.MISTRAL_MODEL || "mistral-small-latest";

    if (!mistralApiKey) {
      return res.status(500).json({ error: "MISTRAL_API_KEY manquante" });
    }

    // --------------------------------------------------------
    // 1. UPSERT CONVERSATION
    // --------------------------------------------------------
    const { data: convData, error: convError } = await supabase
      .from("conversations")
      .upsert(
        {
          session_id: session_id,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: "session_id" }
      )
      .select("id")
      .single();

    if (convError) {
      console.error("❌ Erreur upsert conversation:", convError);
      return res.status(500).json({
        error: "Erreur DB conversation",
        details: convError.message,
      });
    }

    const conversationId = convData.id;

    // --------------------------------------------------------
    // 2. ENREGISTRER MESSAGE USER
    // --------------------------------------------------------
    const { error: userMsgError } = await supabase.from("messages").insert({
      conversation_id: conversationId,
      role: "user",
      content: message,
    });

    if (userMsgError) {
      console.error("❌ Erreur insert message user:", userMsgError);
      return res.status(500).json({
        error: "Erreur DB message user",
        details: userMsgError.message,
      });
    }

    // --------------------------------------------------------
    // 3. CONSTRUIRE MESSAGES POUR MISTRAL
    // --------------------------------------------------------
    const messagesForMistral = [{ role: "system", content: SYSTEM_PROMPT }];

    if (Array.isArray(history)) {
      for (const msg of history) {
        if (msg?.role === "user") {
          messagesForMistral.push({ role: "user", content: msg.content });
        } else if (msg?.role === "assistant") {
          const contentToSend = msg.raw || msg.content;
          messagesForMistral.push({ role: "assistant", content: contentToSend });
        }
      }
    }

    messagesForMistral.push({ role: "user", content: message });

    // --------------------------------------------------------
    // 4. APPEL MISTRAL (réponse texte + tentative DATA)
    // --------------------------------------------------------
    const mistralResponse = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${mistralApiKey}`,
      },
      body: JSON.stringify({
        model: mistralModel,
        messages: messagesForMistral,
        temperature: 0.5,
        max_tokens: 180,
      }),
    });

    if (!mistralResponse.ok) {
      const errText = await mistralResponse.text();
      console.error("❌ Erreur Mistral API:", errText);
      return res.status(500).json({
        error: "Erreur Mistral API",
        details: errText,
      });
    }

    const mistralData = await mistralResponse.json();
    const replyFull =
      mistralData.choices?.[0]?.message?.content || "Désolé, je n'ai pas pu générer de réponse.";

    // --------------------------------------------------------
    // 5. GARDE-FOUS
    // - UI: always short
    // - DATA: repair if missing
    // --------------------------------------------------------
    const replyCleanRaw = cleanReplyForUI(replyFull);
    const replyClean = enforceShortUI(replyCleanRaw);

    let extractedData = extractDataFromReply(replyFull);
    if (!extractedData) {
      console.warn("⚠️ DATA manquante dans replyFull → repair-call exécuté");
      extractedData = await repairDataOnly({
        mistralApiKey,
        mistralModel,
        messagesForMistral,
      });
    }
    if (!extractedData) extractedData = DEFAULT_DATA;

    // --------------------------------------------------------
    // 6. ENREGISTRER MESSAGE ASSISTANT
    // --------------------------------------------------------
    const { error: assistantMsgError } = await supabase.from("messages").insert({
      conversation_id: conversationId,
      role: "assistant",
      content: replyFull,
      // Optionnel (si tu ajoutes la colonne) : data_json: extractedData,
    });

    if (assistantMsgError) {
      console.error("❌ Erreur insert message assistant:", assistantMsgError);
    }

    // --------------------------------------------------------
    // 7. RÉPONDRE AU FRONT
    // --------------------------------------------------------
    return res.status(200).json({
      reply: replyClean,       // UI conforme
      reply_full: replyFull,   // historique modèle (raw)
      session_id: session_id,
      conversation_id: conversationId,
      extracted_data: extractedData, // toujours non-null (ou default)
    });
  } catch (error) {
    console.error("❌ Erreur handler chat:", error);
    return res.status(500).json({
      error: "Erreur serveur interne",
      details: error.message,
    });
  }
}
