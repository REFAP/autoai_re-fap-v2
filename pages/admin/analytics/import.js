// /pages/admin/analytics/import.js
// Import intelligent multi-sources — Support UTF-16 Meta natif + fusion multi-fichiers

import { useState, useCallback, useRef } from "react";
import Head from "next/head";
import Link from "next/link";

const TOKEN = process.env.NEXT_PUBLIC_ADMIN_TOKEN || "";

const C = {
  bg: "#0a0e17", surface: "#111827", border: "#1e293b",
  green: "#22c55e", blue: "#3b82f6", yellow: "#f59e0b",
  red: "#ef4444", purple: "#8b5cf6", cyan: "#06b6d4",
  orange: "#f97316", pink: "#ec4899", muted: "#64748b",
  text: "#e2e8f0", sub: "#94a3b8",
};

const NAV_ITEMS = [
  { href: "/admin", label: "Terrain" },
  { href: "/admin/social", label: "Social" },
  { href: "/admin/seo", label: "SEO" },
  { href: "/admin/performance", label: "Performance" },
  { href: "/admin/magasins", label: "Magasins" },
  { href: "/admin/analytics", label: "Analytics" },
  { href: "/admin/financier", label: "Financier" },
  { href: "/admin/cc-ventes", label: "CC Ventes" },
];

// ═══════ META TITLE → DB FIELD MAPPING ═══════
const META_TITLE_MAP = [
  { keys: ["visites", "page views", "page visit"],       field: "reach_organic" },
  { keys: ["spectateur", "viewers", "couverture payante","reach paid"], field: "reach_paid" },
  { keys: ["vues", "views", "impressions"],              field: "impressions" },
  { keys: ["clics sur un lien", "link click"],           field: "clicks" },
  { keys: ["interactions", "engagement"],                field: "engagement" },
  { keys: ["followers", "abonnes", "nouveaux abonn"],    field: "followers_gained" },
  { keys: ["portee", "portée", "couverture", "reach"],   field: "reach_organic" },
  { keys: ["depense", "dépense", "spend", "budget"],     field: "spend" },
];

function detectMetaField(titleLine) {
  const t = titleLine.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ");
  for (const { keys, field } of META_TITLE_MAP) {
    if (keys.some(k => t.includes(k))) return field;
  }
  return null;
}

function decodeBuffer(buffer) {
  const bytes = new Uint8Array(buffer);
  if (bytes[0] === 0xFF && bytes[1] === 0xFE) return new TextDecoder("utf-16le").decode(buffer);
  if (bytes[0] === 0xFE && bytes[1] === 0xFF) return new TextDecoder("utf-16be").decode(buffer);
  return new TextDecoder("utf-8").decode(buffer);
}

function isMetaSingleFile(lines) {
  if (lines.length < 4) return false;
  const hasSep = lines[0].toLowerCase().startsWith("sep=");
  const hasDatePrimary = lines.slice(0, 5).some(l => {
    const c = l.replace(/"/g, "").trim();
    return c.startsWith("Date,Primary") || c.startsWith("Date\tPrimary") || c === "Date,Primary";
  });
  return hasSep && hasDatePrimary;
}

function parseMetaSingle(lines) {
  const titleLine = (lines[1] || "").replace(/"/g, "").trim();
  const field = detectMetaField(titleLine) || "impressions";
  const rows = [];
  for (let i = 3; i < lines.length; i++) {
    const parts = lines[i].replace(/"/g, "").split(",");
    if (parts.length < 2) continue;
    const date = parts[0].trim().slice(0, 10);
    const val = parseInt((parts[1] || "").trim().replace(/\s/g, ""));
    if (date.length === 10 && !isNaN(val)) rows.push({ date, [field]: String(val) });
  }
  return { headers: ["date", field], rows, metaField: field, metaTitle: titleLine, isMeta: true };
}

function parseRawText(text) {
  const clean = text.replace(/^\uFEFF/, "").replace(/\r/g, "");
  const lines = clean.split("\n").map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return { headers: [], rows: [], separator: "," };

  // Detect Meta single-metric file (UTF-16 exported)
  if (isMetaSingleFile(lines)) return parseMetaSingle(lines);

  const startIdx = lines[0].toLowerCase().startsWith("sep=") ? 1 : 0;
  const firstLine = lines[startIdx] || "";
  const sep = firstLine.includes("\t") ? "\t" : firstLine.includes(";") ? ";" : ",";

  function splitLine(line) {
    const vals = []; let cur = ""; let inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; continue; }
      if (ch === sep && !inQ) { vals.push(cur.trim()); cur = ""; continue; }
      cur += ch;
    }
    vals.push(cur.trim());
    return vals;
  }

  const headers = splitLine(lines[startIdx]).map(h => h.replace(/^["\'"]|["\'"]$/g, "").trim());
  const rows = lines.slice(startIdx + 1).map(line => {
    const vals = splitLine(line);
    const obj = {};
    headers.forEach((h, i) => { obj[h] = vals[i] || ""; });
    return obj;
  });
  return { headers, rows, separator: sep };
}

// ═══════ SOURCE DEFINITIONS ═══════
const SOURCE_DEFS = {
  gsc_main: {
    label: "GSC — re-fap.fr", icon: "G", color: C.blue, table: "analytics_gsc",
    fields: [
      { db: "date", aliases: ["date"], type: "date", required: true },
      { db: "clicks", aliases: ["clicks", "clics"], type: "number" },
      { db: "impressions", aliases: ["impressions", "impr"], type: "number" },
      { db: "ctr", aliases: ["ctr", "taux de clic"], type: "percentage" },
      { db: "position", aliases: ["position", "pos"], type: "number" },
      { db: "query", aliases: ["query", "requete"], type: "text" },
      { db: "page", aliases: ["page", "url", "landing page"], type: "text" },
    ],
  },
  gsc_cc: {
    label: "GSC — auto.re-fap.fr", icon: "G", color: "#4285f4", table: "analytics_gsc",
    fields: [
      { db: "date", aliases: ["date"], type: "date", required: true },
      { db: "clicks", aliases: ["clicks", "clics"], type: "number" },
      { db: "impressions", aliases: ["impressions"], type: "number" },
      { db: "ctr", aliases: ["ctr"], type: "percentage" },
      { db: "position", aliases: ["position"], type: "number" },
    ],
  },
  youtube: {
    label: "YouTube Analytics", icon: "▶", color: "#ff0000", table: "analytics_youtube",
    fields: [
      { db: "date", aliases: ["date"], type: "date", required: true },
      { db: "video_title", aliases: ["video title", "titre"], type: "text" },
      { db: "views", aliases: ["views", "vues", "nombre de vues"], type: "number" },
      { db: "watch_time_hours", aliases: ["watch time hours", "duree de visionnage", "heures de visionnage"], type: "number" },
      { db: "likes", aliases: ["likes", "jaime"], type: "number" },
      { db: "subscribers_gained", aliases: ["subscribers gained", "abonnes gagnes", "nouveaux abonnes"], type: "number" },
    ],
  },
  tiktok: {
    label: "TikTok", icon: "♪", color: C.cyan, table: "analytics_tiktok",
    fields: [
      { db: "date", aliases: ["date"], type: "date", required: true },
      { db: "views", aliases: ["views", "vues"], type: "number" },
      { db: "reach", aliases: ["reach", "portee"], type: "number" },
      { db: "likes", aliases: ["likes", "jaime"], type: "number" },
      { db: "followers_gained", aliases: ["new followers", "nouveaux abonnes"], type: "number" },
    ],
  },
  meta: {
    label: "Meta / Facebook / Instagram", icon: "f", color: "#1877f2", table: "analytics_meta",
    fields: [
      { db: "date", aliases: ["date"], type: "date", required: true },
      { db: "reach_organic", aliases: ["reach_organic", "reach organic", "portee organique", "visites"], type: "number" },
      { db: "reach_paid", aliases: ["reach_paid", "reach paid", "portee payante", "spectateur"], type: "number" },
      { db: "impressions", aliases: ["impressions", "vues", "impr"], type: "number" },
      { db: "engagement", aliases: ["engagement", "interactions"], type: "number" },
      { db: "clicks", aliases: ["clicks", "clics", "clics sur un lien"], type: "number" },
      { db: "followers_gained", aliases: ["followers_gained", "followers", "abonnes"], type: "number" },
      { db: "spend", aliases: ["spend", "depense", "montant depense"], type: "currency" },
    ],
  },
  email: {
    label: "Brevo (Email/SMS)", icon: "✉", color: C.green, table: "analytics_email",
    fields: [
      { db: "date", aliases: ["date"], type: "date", required: true },
      { db: "campaign_name", aliases: ["campagne", "campaign name"], type: "text" },
      { db: "sends", aliases: ["sends", "envois", "destinataires"], type: "number" },
      { db: "opens", aliases: ["opens", "ouvertures"], type: "number" },
      { db: "clicks", aliases: ["clicks", "clics"], type: "number" },
      { db: "open_rate", aliases: ["open rate", "taux ouverture"], type: "percentage" },
      { db: "click_rate", aliases: ["click rate", "taux clic"], type: "percentage" },
    ],
  },
  cc_csv: {
    label: "Carter-Cash (Ventes FAP)", icon: "CC", color: C.orange, table: "prestations_weekly",
    fields: [
      { db: "store_code", aliases: ["store code", "code centre", "magasin", "centre"], type: "text", required: true },
      { db: "ventes_fap", aliases: ["ventes fap", "ventes", "nb fap", "prestations"], type: "number" },
      { db: "ca_ht", aliases: ["ca ht", "ca", "chiffre affaires", "revenue"], type: "currency" },
      { db: "marge", aliases: ["marge", "marge brute", "profit"], type: "currency" },
    ],
  },
};

// ═══════ DETECTION ENGINE ═══════
function normalize(str) {
  return String(str || "").toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "").trim();
}

function autoMapColumns(sourceKey, headers) {
  const sourceDef = SOURCE_DEFS[sourceKey];
  if (!sourceDef) return {};
  const mapping = {};
  const used = new Set();
  for (const field of sourceDef.fields) {
    let best = null, bestScore = 0;
    for (const header of headers) {
      if (used.has(header)) continue;
      const hn = normalize(header);
      for (const alias of field.aliases) {
        const an = normalize(alias);
        let score = 0;
        if (hn === an) score = 10;
        else if (hn.includes(an) || an.includes(hn)) score = 7;
        else if (hn.startsWith(an.slice(0, 4)) && an.length >= 4) score = 4;
        if (score > bestScore) { bestScore = score; best = header; }
      }
    }
    mapping[field.db] = best || null;
    if (best) used.add(best);
  }
  return mapping;
}

function detectBestSource(headers, rows, isMeta) {
  if (isMeta) return { sourceKey: "meta", confidence: "haute", matchedFields: 2, format: "meta-single", alternatives: [] };
  
  const scores = {};
  for (const [key, def] of Object.entries(SOURCE_DEFS)) {
    let score = 0, matched = 0;
    for (const field of def.fields) {
      const aliases = field.aliases.map(a => normalize(a));
      if (headers.some(h => aliases.includes(normalize(h)))) { matched++; score += field.required ? 15 : 8; }
    }
    const ratio = matched / def.fields.length;
    scores[key] = { score, confidence: ratio >= 0.5 ? "haute" : ratio >= 0.3 ? "moyenne" : "faible", matchedFields: matched, format: "flat" };
  }
  const sorted = Object.entries(scores).sort((a, b) => b[1].score - a[1].score);
  if (!sorted[0] || sorted[0][1].score < 5) return null;
  return { sourceKey: sorted[0][0], ...sorted[0][1], alternatives: sorted.slice(1, 3).filter(s => s[1].score > 0) };
}

// ═══════ MAIN COMPONENT ═══════
export default function AnalyticsImport() {
  const [step, setStep] = useState("upload");
  const [rawText, setRawText] = useState("");
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState([]);
  const [rows, setRows] = useState([]);
  const [detected, setDetected] = useState(null);
  const [selectedSource, setSelectedSource] = useState("");
  const [columnMapping, setColumnMapping] = useState({});
  const [purge, setPurge] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [metaQueue, setMetaQueue] = useState([]); // fichiers Meta en attente fusion
  const fileRef = useRef(null);
  const multiRef = useRef(null);

  const getToken = () => TOKEN || (typeof window !== "undefined" ? localStorage.getItem("fapexpert_admin_token") || "" : "");

  const processData = useCallback((text, name, isMeta = false) => {
    setError(null); setResult(null);
    const { headers: h, rows: r, isMeta: detectedMeta, metaField, metaTitle } = parseRawText(text);
    if (h.length === 0 || r.length === 0) { setError("Aucune donnée exploitable. Vérifiez le format."); return; }
    setHeaders(h); setRows(r); setFileName(name || "Données collées");
    const detection = detectBestSource(h, r, detectedMeta || isMeta);
    setDetected(detection);
    if (detection) {
      setSelectedSource(detection.sourceKey);
      setColumnMapping(autoMapColumns(detection.sourceKey, h));
    } else { setSelectedSource(""); setColumnMapping({}); }
    setStep("preview");
  }, []);

  // ─── Gestion fichier unique ───
  const handleFile = useCallback(async (file) => {
    if (!file) return;
    const buffer = await file.arrayBuffer();
    const text = decodeBuffer(buffer);
    processData(text, file.name);
  }, [processData]);

  // ─── Gestion multi-fichiers Meta ───
  const handleMultiFiles = useCallback(async (files) => {
    const fileArr = Array.from(files);
    const metaData = {}; // date -> { field: value }

    for (const file of fileArr) {
      const buffer = await file.arrayBuffer();
      const text = decodeBuffer(buffer);
      const clean = text.replace(/^\uFEFF/, "").replace(/\r/g, "");
      const lines = clean.split("\n").map(l => l.trim()).filter(Boolean);
      if (!isMetaSingleFile(lines)) continue;
      const { rows: fileRows, metaField } = parseMetaSingle(lines);
      for (const row of fileRows) {
        if (!metaData[row.date]) metaData[row.date] = {};
        metaData[row.date][metaField] = row[metaField];
      }
    }

    if (Object.keys(metaData).length === 0) {
      // Fallback: traiter comme fichier unique
      handleFile(fileArr[0]);
      return;
    }

    // Construire CSV fusionné
    const allFields = ["reach_organic", "impressions", "reach_paid", "clicks", "engagement", "followers_gained", "spend"];
    const presentFields = allFields.filter(f => Object.values(metaData).some(d => d[f] !== undefined));
    const headers = ["date", ...presentFields];
    const rows = Object.entries(metaData).sort(([a], [b]) => a.localeCompare(b)).map(([date, vals]) => {
      const row = { date };
      for (const f of presentFields) row[f] = vals[f] !== undefined ? String(vals[f]) : "";
      return row;
    });

    setHeaders(headers); setRows(rows);
    setFileName(`Meta fusionné (${fileArr.length} fichiers)`);
    const detection = { sourceKey: "meta", confidence: "haute", matchedFields: presentFields.length, format: "meta-multi", alternatives: [] };
    setDetected(detection); setSelectedSource("meta");
    setColumnMapping(autoMapColumns("meta", headers));
    setStep("preview");
  }, [handleFile]);

  const handleDrop = useCallback((e) => {
    e.preventDefault(); setDragOver(false);
    const files = e.dataTransfer.files;
    if (files.length > 1) handleMultiFiles(files);
    else if (files.length === 1) handleFile(files[0]);
  }, [handleFile, handleMultiFiles]);

  const handlePaste = useCallback(() => { if (rawText.trim()) processData(rawText, "Données collées"); }, [rawText, processData]);
  const handleSourceChange = useCallback((s) => { setSelectedSource(s); if (s && headers.length > 0) setColumnMapping(autoMapColumns(s, headers)); }, [headers]);
  const updateMapping = useCallback((db, val) => setColumnMapping(prev => ({ ...prev, [db]: val || null })), []);

  const handleImport = useCallback(async () => {
    if (!selectedSource) { setError("Sélectionnez une destination"); return; }
    setLoading(true); setError(null); setResult(null);
    try {
      const resp = await fetch(`/api/admin/analytics-import?token=${encodeURIComponent(getToken())}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: selectedSource, rows, column_mapping: columnMapping, ...(purge ? { purge: true } : {}) }),
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json.error || `Erreur ${resp.status}`);
      setResult({ ok: true, msg: `${json.inserted} lignes importées${json.skipped ? ` | ${json.skipped} ignorées` : ""}`, details: json });
      setStep("done");
    } catch (err) { setError(err.message); }
    setLoading(false);
  }, [selectedSource, rows, columnMapping, purge]);

  const handleReset = useCallback(() => {
    setStep("upload"); setRawText(""); setFileName(""); setHeaders([]); setRows([]);
    setDetected(null); setSelectedSource(""); setColumnMapping({}); setPurge(false); setResult(null); setError(null);
  }, []);

  return (
    <>
      <Head><title>Import Analytics — Re-FAP</title></Head>
      <div style={{ minHeight: "100vh", background: C.bg, fontFamily: "system-ui, sans-serif", color: C.text }}>

        <header style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: "16px 32px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 100 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 36, height: 36, background: C.green, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 14, color: "#000" }}>RE</div>
            <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Import Intelligent</h1>
            <span style={{ fontSize: 12, color: C.muted, background: "#1a2234", padding: "2px 8px", borderRadius: 4 }}>Multi-sources · Auto-detection · UTF-16 Meta natif</span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {step !== "upload" && <button onClick={handleReset} style={{ background: "#1a2234", border: `1px solid ${C.border}`, color: C.text, padding: "8px 16px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontFamily: "inherit" }}>Nouvel import</button>}
            <Link href="/admin/analytics" style={{ background: C.blue, color: "#fff", padding: "8px 16px", borderRadius: 8, textDecoration: "none", fontSize: 13, fontWeight: 600 }}>Dashboard</Link>
          </div>
        </header>

        <nav style={{ background: "#0f1523", borderBottom: `1px solid ${C.border}`, padding: "0 32px", display: "flex" }}>
          {NAV_ITEMS.map(item => (
            <Link key={item.href} href={item.href} style={{ padding: "10px 18px", fontSize: 13, fontWeight: 600, textDecoration: "none", color: item.href === "/admin/analytics" ? C.text : C.muted, borderBottom: item.href === "/admin/analytics" ? `2px solid ${C.green}` : "2px solid transparent" }}>{item.label}</Link>
          ))}
        </nav>

        <main style={{ maxWidth: 1200, margin: "0 auto", padding: "32px" }}>

          {step === "upload" && (
            <>
              {/* Meta tip */}
              <div style={{ background: `#1877f211`, border: `1px solid #1877f233`, borderRadius: 12, padding: "16px 20px", marginBottom: 24, display: "flex", gap: 12, alignItems: "flex-start" }}>
                <span style={{ fontSize: 20, color: "#1877f2" }}>f</span>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4, color: "#1877f2" }}>Import Meta / Facebook — Nouveau : glissez plusieurs fichiers en même temps</div>
                  <div style={{ color: C.sub, fontSize: 13 }}>
                    Exportez chaque métrique séparément depuis Meta Business Suite (Visites, Vues, Interactions, Clics, Followers...) puis <strong>glissez tous les fichiers en même temps</strong>. La fusion et la détection sont automatiques, même en UTF-16.
                  </div>
                </div>
              </div>

              {/* Drop zone */}
              <div
                onDrop={handleDrop}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onClick={() => fileRef.current?.click()}
                style={{ background: dragOver ? `${C.blue}15` : C.surface, border: `2px dashed ${dragOver ? C.blue : C.border}`, borderRadius: 16, padding: "60px 40px", textAlign: "center", cursor: "pointer", marginBottom: 16 }}
              >
                <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.6 }}>{dragOver ? "⬇" : "📁"}</div>
                <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>{dragOver ? "Lâchez les fichiers ici" : "Glissez-déposez un ou plusieurs fichiers"}</div>
                <div style={{ color: C.sub, fontSize: 14, marginBottom: 8 }}>CSV, TSV, TXT — UTF-8 ou UTF-16 (Meta)</div>
                <div style={{ color: C.muted, fontSize: 12 }}>Pour Meta : glissez tous les fichiers métriques en une seule fois</div>
                <input ref={fileRef} type="file" accept=".csv,.tsv,.txt" multiple onChange={(e) => { const files = e.target.files; if (files?.length > 1) handleMultiFiles(files); else if (files?.length === 1) handleFile(files[0]); e.target.value = ""; }} style={{ display: "none" }} />
              </div>

              {/* Multi-file button */}
              <div style={{ textAlign: "center", marginBottom: 24 }}>
                <button onClick={() => multiRef.current?.click()} style={{ background: `#1877f222`, border: `1px solid #1877f244`, color: "#1877f2", padding: "10px 24px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "inherit" }}>
                  Sélectionner plusieurs fichiers Meta
                </button>
                <input ref={multiRef} type="file" accept=".csv" multiple onChange={(e) => { if (e.target.files?.length) handleMultiFiles(e.target.files); e.target.value = ""; }} style={{ display: "none" }} />
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
                <div style={{ flex: 1, height: 1, background: C.border }} />
                <span style={{ color: C.muted, fontSize: 13, fontWeight: 600 }}>OU COLLER</span>
                <div style={{ flex: 1, height: 1, background: C.border }} />
              </div>

              <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24 }}>
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>Coller des données brutes</div>
                <textarea value={rawText} onChange={(e) => setRawText(e.target.value)}
                  placeholder="Collez ici vos données..."
                  style={{ width: "100%", minHeight: 140, background: "#0a0e17", border: `1px solid ${C.border}`, borderRadius: 8, padding: 16, color: C.text, fontSize: 13, fontFamily: "monospace", resize: "vertical", outline: "none" }} />
                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
                  <button onClick={handlePaste} disabled={!rawText.trim()} style={{ background: rawText.trim() ? `${C.green}22` : `${C.muted}22`, border: `1px solid ${rawText.trim() ? C.green : C.muted}44`, color: rawText.trim() ? C.green : C.muted, padding: "10px 24px", borderRadius: 8, cursor: rawText.trim() ? "pointer" : "default", fontSize: 14, fontWeight: 600, fontFamily: "inherit" }}>Analyser</button>
                </div>
              </div>

              <div style={{ marginTop: 32 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.sub, textTransform: "uppercase", letterSpacing: 2, marginBottom: 12 }}>Sources détectées automatiquement</div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {Object.entries(SOURCE_DEFS).map(([key, def]) => (
                    <div key={key} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 14px", display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ color: def.color, fontWeight: 700, fontSize: 14 }}>{def.icon}</span>
                      <span style={{ color: C.sub, fontSize: 12 }}>{def.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {step === "preview" && (
            <PreviewStep
              fileName={fileName} headers={headers} rows={rows} detected={detected}
              selectedSource={selectedSource} columnMapping={columnMapping} purge={purge}
              loading={loading} error={error}
              onSourceChange={handleSourceChange} onMappingChange={updateMapping}
              onPurgeChange={setPurge} onImport={handleImport} onReset={handleReset}
            />
          )}

          {step === "done" && result && (
            <div style={{ textAlign: "center", padding: "60px 0" }}>
              <div style={{ fontSize: 64, marginBottom: 24 }}>✅</div>
              <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 16, color: C.green }}>Import réussi !</div>
              <div style={{ background: `${C.green}11`, border: `1px solid ${C.green}33`, borderRadius: 12, padding: "16px 24px", display: "inline-block", fontSize: 14, color: C.green }}>{result.msg}</div>
              <div style={{ marginTop: 32, display: "flex", gap: 12, justifyContent: "center" }}>
                <button onClick={handleReset} style={{ background: `${C.blue}22`, border: `1px solid ${C.blue}44`, color: C.blue, padding: "12px 28px", borderRadius: 10, cursor: "pointer", fontSize: 14, fontWeight: 700, fontFamily: "inherit" }}>Importer d'autres données</button>
                <Link href="/admin/analytics" style={{ background: `${C.green}22`, border: `1px solid ${C.green}44`, color: C.green, padding: "12px 28px", borderRadius: 10, textDecoration: "none", fontSize: 14, fontWeight: 700 }}>Voir le dashboard</Link>
              </div>
            </div>
          )}

          {error && step !== "preview" && (
            <div style={{ marginTop: 24, padding: "16px 20px", borderRadius: 12, background: `${C.red}11`, border: `1px solid ${C.red}33`, color: C.red, fontSize: 14 }}>{error}</div>
          )}
        </main>
      </div>
    </>
  );
}

function PreviewStep({ fileName, headers, rows, detected, selectedSource, columnMapping, purge, loading, error, onSourceChange, onMappingChange, onPurgeChange, onImport, onReset }) {
  const sourceDef = SOURCE_DEFS[selectedSource];
  const mappedCount = Object.values(columnMapping).filter(Boolean).length;

  return (
    <>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24, marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>Fichier : {fileName}</div>
            <div style={{ color: C.sub, fontSize: 13 }}>{rows.length} lignes · {headers.length} colonnes · {headers.join(", ")}</div>
          </div>
          <button onClick={onReset} style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.muted, padding: "6px 14px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>Changer</button>
        </div>

        {detected && (
          <div style={{ background: detected.confidence === "haute" ? `${C.green}11` : `${C.yellow}11`, border: `1px solid ${detected.confidence === "haute" ? C.green : C.yellow}33`, borderRadius: 8, padding: "12px 16px", marginBottom: 16 }}>
            <span style={{ fontWeight: 700, fontSize: 14, color: detected.confidence === "haute" ? C.green : C.yellow }}>
              ✓ Source détectée : {SOURCE_DEFS[detected.sourceKey]?.label} — confiance {detected.confidence}
              {detected.format === "meta-single" && " · Fichier Meta unique UTF-16"}
              {detected.format === "meta-multi" && ` · ${detected.matchedFields} métriques fusionnées`}
            </span>
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span style={{ color: C.sub, fontSize: 13, fontWeight: 600 }}>Destination :</span>
          {Object.entries(SOURCE_DEFS).map(([key, def]) => (
            <button key={key} onClick={() => onSourceChange(key)} style={{ background: selectedSource === key ? `${def.color}22` : "transparent", border: `1px solid ${selectedSource === key ? def.color : C.border}`, color: selectedSource === key ? def.color : C.muted, padding: "6px 14px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "inherit" }}>
              {def.icon} {def.label}
            </button>
          ))}
        </div>
      </div>

      {sourceDef && (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24, marginBottom: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Mapping · {mappedCount}/{sourceDef.fields.length} champs</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {sourceDef.fields.map(field => (
              <div key={field.db} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 160, flexShrink: 0 }}>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{field.db}</span>
                  {field.required && <span style={{ color: C.red, marginLeft: 4 }}>*</span>}
                  <div style={{ fontSize: 10, color: C.muted }}>{field.type}</div>
                </div>
                <span style={{ color: C.muted }}>→</span>
                <select value={columnMapping[field.db] || ""} onChange={(e) => onMappingChange(field.db, e.target.value)}
                  style={{ flex: 1, background: "#0a0e17", border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 10px", color: columnMapping[field.db] ? C.text : C.muted, fontSize: 12, fontFamily: "inherit", outline: "none" }}>
                  <option value="">— Non mappé —</option>
                  {headers.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24, marginBottom: 24 }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Aperçu — {Math.min(5, rows.length)} premières lignes</div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                {headers.map(h => <th key={h} style={{ padding: "8px 10px", textAlign: "left", color: Object.values(columnMapping).includes(h) ? C.green : C.muted, fontSize: 11 }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 5).map((row, i) => (
                <tr key={i} style={{ borderBottom: `1px solid ${C.border}30` }}>
                  {headers.map(h => <td key={h} style={{ padding: "6px 10px", fontFamily: "monospace", fontSize: 11, color: C.sub }}>{row[h] || ""}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ color: C.muted, fontSize: 12 }}>{rows.length} lignes → {sourceDef?.label || "—"}</span>
        <button onClick={onImport} disabled={loading || !selectedSource} style={{ background: loading ? `${C.muted}44` : C.green, border: "none", color: loading ? C.sub : "#000", padding: "12px 32px", borderRadius: 10, cursor: loading ? "wait" : "pointer", fontSize: 15, fontWeight: 700, fontFamily: "inherit" }}>
          {loading ? "Import en cours..." : `Importer ${rows.length} lignes`}
        </button>
      </div>

      {error && <div style={{ marginTop: 16, padding: "16px 20px", borderRadius: 12, background: `${C.red}11`, border: `1px solid ${C.red}33`, color: C.red, fontSize: 14 }}>{error}</div>}
    </>
  );
}
