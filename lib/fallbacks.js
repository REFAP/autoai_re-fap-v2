// lib/fallbacks.js
export function extractBotPayload(str) {
  if (typeof str === "object" && str.stage) return str; // dÃ©jÃ  JSON
  const start = String(str).indexOf("{");
  const end   = String(str).lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) throw new Error("JSON introuvable");
  const candidate = String(str).slice(start, end + 1);
  return JSON.parse(candidate.replace(/,\s*([}\]])/g, "$1"));
}

