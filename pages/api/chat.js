// pages/api/chat.js — adaptateur LLM JSON → UI (reply markdown + nextAction)
import fs from "fs/promises";
import Ajv from "ajv";
import addFormats from "ajv-formats";

const MODEL = process.env.MISTRAL_MODEL || "mistral-large-latest";

// ===== Schéma (identique au lab) =====
const schema = {
  type: "object",
  additionalProperties: false,
  required: ["stage","title","summary","questions","suspected","risk","actions","cta","alt_cta","follow_up","legal"],
  properties: {
    stage: { enum: ["triage","diagnosis","handoff"] },
    title: { type: "string", minLength: 1 },
    summary: { type: "string", minLength: 1 },
    questions: { type: "array", items: { type:"object", required:["id","q"], additionalProperties:false, properties:{ id:{type:"string"}, q:{type:"string"} } } },
    suspected: { type:"array", items:{type:"string"}, maxItems:5 },
    risk: { enum: ["low","moderate","high"] },
    actions: { type:"array", items:{type:"string"}, minItems:2, maxItems:4 },
    cta: { type:"object", required:["label","url","reason"], additionalProperties:false,
      properties:{ label:{type:"string"}, url:{type:"string", format:"uri", pattern:"^https://"}, reason:{type:"string"} } },
    alt_cta: { type:"array", items: { $ref:"#/properties/cta" }, maxItems:3 },
    follow_up: { type:"array", items:{type:"string"}, maxItems:3 },
    legal: { type:"string", minLength:1 }
  },
  allOf: [
    { if: { properties:{ stage:{ const:"triage"} }, required:["stage"] },
      then: { properties:{ questions:{ minItems:3, maxItems:5 } } },
      else: { properties:{ questions:{ maxItems:0 } } }
    }
  ]
};

const ajv = new Ajv({ allErrors:true, strict:false }); addFormats(ajv);
const validate = ajv.compile(schema);

// ===== Utils =====
function parseJsonLoose(out) {
  let s = (out ?? "").trim();
  try { return JSON.parse(s); } catch {}
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) { s = fence[1].trim(); try { return JSON.parse(s); } catch {} }
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a > -1 && b > a) { try { return JSON.parse(s.slice(a, b+1)); } catch {} }
  throw new Error("non-json");
}

function allowCta(url) {
  try {
    const u = new URL(url);
    const okHost = ["re-fap.fr","www.re-fap.fr","carter-cash.com","www.carter-cash.com","idgarages.com","www.idgarages.com"]
      .includes(u.hostname);
    return u.protocol === "https:" && okHost;
  } catch { return false; }
}

function renderReply(j) {
  const L = [];
  L.push(`**${j.title}**`, "", j.summary);
  if (j.stage === "triage" && (j.questions||[]).length) {
    L.push("", "**Questions**");
    j.questions.forEach(q => L.push(`- ${q.q}`));
  }
  if ((j.suspected||[]).length) {
    L.push("", "**Pistes**");
    j.suspected.forEach(s => L.push(`- ${s}`));
  }
  if ((j.actions||[]).length) {
    L.push("", "**Actions**");
    j.actions.forEach(a => L.push(`- ${a}`));
  }
  L.push("", `[${j.cta.label}](${j.cta.url}) — ${j.cta.reason}`, "", `_${j.legal}_`);
  return L.join("\n");
}

function mapNextAction(j) {
  const url = (j.cta?.url || "").toLowerCase();
  if (url.includes("carter-cash")) return { type: "FAP" };
  if (url.includes("idgarages") || j.stage === "handoff") return { type: "DIAG" };
  return { type: "GEN" };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { question = "" } = req.body || {};
  if (!process.env.MISTRAL_API_KEY) return res.status(500).json({ error: "Missing MISTRAL_API_KEY" });

  try {
    // 1) prompt EXACT (chargé à chaque requête pour pouvoir itérer sans redeploy)
    const SYSTEM_PROMPT = await fs.readFile(process.cwd() + "/data/prompt.txt", "utf8");

    // 2) appel modèle
    const { Mistral } = await import("@mistralai/mistralai");
    const client = new Mistral({ apiKey: process.env.MISTRAL_API_KEY });
    const r = await client.chat.complete({
      model: MODEL,
      temperature: 0.0,
      maxTokens: 800,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: question }
      ]
    });

    // 3) parse + validation + garde-fous
    const raw = r?.choices?.[0]?.message?.content ?? "";
    const data = parseJsonLoose(raw);
    if (!validate(data)) throw new Error("schema: " + ajv.errorsText(validate.errors));
    if (!allowCta(data?.cta?.url)) throw new Error("cta not allowed: " + (data?.cta?.url || ""));

    // 4) adapter à l’UI existante
    const reply = renderReply(data);
    const nextAction = mapNextAction(data);

    const payload = { reply, nextAction };
    if (process.env.NODE_ENV !== "production") payload.raw = data; // debug en Preview

    res.status(200).json(payload);

  } catch (e) {
    console.error("chat error", e);
    // Fallback sûr
    res.status(200).json({
      reply:
        "⚠️ Erreur temporaire. Par sécurité : **urgence atelier**.\n\n" +
        "[Trouver un garage partenaire](https://re-fap.fr/trouver_garage_partenaire/)\n\n" +
        "_En cas d’odeur de brûlé, arrête immédiatement le véhicule._",
      nextAction: { type: "DIAG" }
    });
  }
}
