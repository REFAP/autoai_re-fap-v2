import fs from "fs";
import path from "path";

const DEFAULTS = { /* optionnel: mêmes clés que le JSON, avec valeurs par défaut */ };
let CACHE = null;

function deepMerge(a, b) {
  if (Array.isArray(a) && Array.isArray(b)) return [...a, ...b];
  if (a && typeof a === "object" && b && typeof b === "object") {
    const out = { ...a };
    for (const k of Object.keys(b)) out[k] = deepMerge(a[k], b[k]);
    return out;
  }
  return b === undefined ? a : b;
}

function readConfig() {
  const p = process.env.BOT_CONFIG_PATH || path.join(process.cwd(), "data", "bot-config.json");
  try {
    const raw = fs.readFileSync(p, "utf8");
    return JSON.parse(raw);
  } catch (e) {
    return {};
  }
}

export function getConfig() {
  // En dev: pas de cache pour hot-reload, en prod: cache
  if (process.env.NODE_ENV === "production") {
    if (!CACHE) CACHE = deepMerge(DEFAULTS, readConfig());
    return CACHE;
  }
  return deepMerge(DEFAULTS, readConfig());
}
