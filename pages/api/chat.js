// pages/api/chat.js — UTF-8 SANS BOM
import fs from "fs/promises";
import path from "path";
import { Mistral } from "@mistralai/mistralai";
import Ajv from "ajv";
import addFormats from "ajv-formats";

export const config = { runtime: "nodejs" };

const PROMPT_PATH = path.join(process.cwd(), "data", "prompt.txt");
const DEFAULT_MODEL = process.env.MISTRAL_MODEL || "mistral-large-latest";
const DEFAULT_TEMPERATURE = process.env.TEMPERATURE ? Number(process.env.TEMPERATURE) : 0.2;

// ---------- Ajv: schéma imposé ----------
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const schema = {
  type: "object",
  required: ["stage","title","summary","questions","suspected","risk","actions","cta","alt_cta","follow_up","legal"],
  properties: {
    stage: { enum: ["triage","diagnosis","handoff"] },
    title: { type: "string" },
    summary: { type: "string" },
    questions: {
      type: "array",
      items: { type: "object", required: ["id","q"], properties: { id: { type: "string" }, q: { type: "string" } } }
    },
    suspected: { type: "array", items: { type: "string" } },
    risk: { enum: ["low","moderate","high"] },
    actions: { type: "array", items: { type: "string" } },
    cta: {
      type: "object",
      required: ["label","url","reason"],
      properties: {
        label: { type: "string" },
        url:   { type: "string", format: "uri" },
        reason:{ type: "string" }
      }
    },
    alt_cta: {
      type: "array",
      items: {
        type: "object",
        required: ["label","url","reason"],
        properties: {
          label: { type: "string" },
          url:   { type: "string", format: "uri" },
          reason:{ type: "string" }
        }
      }
    },
    follow_up: { type: "array", items: { type: "string" } },
    legal: { type: "string" }
  }
};
const validate = ajv.compile(schema);

// ---------- Helpers ----------
async function loadPrompt() {
  return fs.readFile(PROMPT_PATH, "utf8");
}

// Parse robuste: extrait un bloc JSON même si le modèle parle autour / met ```json```
function extractJson(text) {
  if (!text) return null;
  // Retire les fences ```json ... ```
  const fence = text.match(/```json([\s\S]*?)```/i);
  if (fence) {
    try { return JSON.parse(fence[1].trim()); } catch {}
  }
  // Cherche la première accolade ouvrante et la dernière fermante
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first) {
    const slice = text.slice(first, last + 1);
    try { return JSON.parse(slice); } catch {}
  }
  // Dernière tentative: direct
  try { return JSON.parse(text); } catch {}
  return null;
}

// Normalise quelques champs au cas où (évite null/undefined)
function normalize(j) {
  j.questions  = Array.isArray(j.questions)  ? j.questions  : [];
  j.suspected  = Array.isArray(j.suspected)  ? j.suspected  : [];
  j.actions    = Array.isArray(j.actions)    ? j.actions    : [];
  j.alt_cta    = Array.isArray(j.alt_cta)    ? j.alt_cta    : [];
  j.follow_up  = Array.isArray(j.follow_up)  ? j.follow_up  : [];
  return j;
}

// Mapping déterministe pour l’UI
function toNextAction(j) {
  if (j.stage === "handoff") return { type: "DIAG" };
  if (j.stage === "diagnosis") {
    const isFap = (j.suspected || []).some(s => /FAP/i.test(s));
    return { type: isFap ? "FAP" : "DIAG" };
  }
  return { type: "GEN" }; // triage ou défaut
}

// Bloc pédagogie (activé si explain=1 ou body.explain=true)
function pedagogyBlock(nextAction) {
  const lines = [];
  lines.push("\n---\n**À savoir (FAP en bref)**");
  lines.push(
    "- Le FAP retient les particules fines; il peut s’encrasser (trajets courts, capteurs/EGR).",
    "- Remplacement = souvent **> 1000 €** ; le **nettoyage Re-FAP (99–149 €)** restaure l’efficacité à moindre coût.",
    "- Avantages Re-FAP : efficacité éprouvée, solution durable, évite un changement inutile.",
    "- Si vous passez par un garage : **demandez explicitement un nettoyage Re-FAP**."
  );
  return lines.join("\n");
}

// Rendu Markdown depuis le JSON
function renderReply(j, { explain = false } = {}) {
  const lines = [];
  lines.push(`**${j.title}**`);
  if (j.summary) lines.push("", j.summary);

  if (j.stage === "triage" && Array.isArray(j.questions) && j.questions.length) {
    lines.push("", "**Questions :**");
    j.questions.forEach((q, i) => lines.push(`${i + 1}. ${q.q}`));
  }
  if (Array.isArray(j.actions) && j.actions.length) {
    lines.push("", "**À faire :**", ...j.actions.map(a => `- ${a}`));
  }
  if (j.cta?.label && j.cta?.url) {
    lines.push("", `**Suivant :** [${j.cta.label}](${j.cta.url})`);
  }

  // Bloc pédagogie optionnel
  if (explain) {
    const next = toNextAction(j);
    if (next.type === "FAP") {
      lines.push(pedagogyBlock(next));
    }
  }

  return lines.join("\n");
}

// ---------- Handler ----------
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method_not_allowed" });
  }

  try {
    const body = req.body || {};
    const { question, historique } = body;

    if (!question || typeof question !== "string" || !question.trim()) {
      return res.status(400).json({ error: "invalid_question" });
    }
    if (!process.env.MISTRAL_API_KEY) {
      return res.status(500).json({ error: "missing_api_key" });
    }

    // Overrides pour tests (query OU body)
    const model = (req.query.model || body.model || DEFAULT_MODEL).toString();
    const temperature = Number(req.query.temperature ?? body.temperature ?? DEFAULT_TEMPERATURE);
    const wantRaw   = req.query.raw   === "1";
    const wantDebug = req.query.debug === "1";
    const explain   = true; // toujours afficher le bloc "À savoir (FAP en bref)";

    const systemPrompt = await loadPrompt();
    const client = new Mistral({ apiKey: process.env.MISTRAL_API_KEY });

    const messages = [{ role: "system", content: systemPrompt }];
    if (historique && typeof historique === "string" && historique.trim()) {
      messages.push({ role: "user", content: historique.trim() });
    }
    messages.push({ role: "user", content: question.trim() });

    const r = await client.chat.complete({
      model,
      temperature: isNaN(temperature) ? DEFAULT_TEMPERATURE : temperature,
      maxTokens: 800,
      messages
    });

    const out = r?.choices?.[0]?.message?.content?.trim() || "";
    let json = extractJson(out);
    if (!json) {
      return res.status(422).json({ error: "llm_not_json", preview: out.slice(0, 400) });
    }

    json = normalize(json);
    const ok = validate(json);
    if (!ok) {
      return res.status(422).json({ error: "invalid_shape", details: validate.errors, preview: json });
    }

    // Mode RAW: renvoyer le JSON tel quel du modèle
    if (wantRaw) return res.status(200).json(json);

    const reply = renderReply(json, { explain });
    const nextAction = toNextAction(json);

    if (wantDebug) {
      return res.status(200).json({ reply, nextAction, modelJson: json });
    }
    return res.status(200).json({ reply, nextAction });

  } catch (err) {
    console.error("API /chat error:", err);
    return res.status(500).json({ error: "server_error" });
  }
}
