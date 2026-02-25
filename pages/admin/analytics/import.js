// /pages/admin/analytics/import.js
// Import intelligent multi-sources — Detection auto, mapping flexible, preview
// Accepte n'importe quel format de donnees brutes (CSV, TSV, copier-coller)

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
];

// ═══════ SOURCE DEFINITIONS ═══════

const SOURCE_DEFS = {
  gsc_main: {
    label: "GSC — re-fap.fr", icon: "G", color: C.blue, table: "analytics_gsc",
    fields: [
      { db: "date", aliases: ["date", "jour", "day"], type: "date", required: true },
      { db: "clicks", aliases: ["clicks", "clics", "clic", "nb clics"], type: "number" },
      { db: "impressions", aliases: ["impressions", "impr", "nb impressions"], type: "number" },
      { db: "ctr", aliases: ["ctr", "taux de clic", "click through rate", "taux clic"], type: "percentage" },
      { db: "position", aliases: ["position", "pos", "position moyenne", "avg position"], type: "number" },
      { db: "query", aliases: ["query", "requete", "requetes principales", "mot cle", "keyword", "top queries"], type: "text" },
      { db: "page", aliases: ["page", "url", "landing page", "pages les plus populaires", "page de destination"], type: "text" },
    ],
  },
  gsc_cc: {
    label: "GSC — auto.re-fap.fr", icon: "G", color: "#4285f4", table: "analytics_gsc",
    fields: [
      { db: "date", aliases: ["date", "jour", "day"], type: "date", required: true },
      { db: "clicks", aliases: ["clicks", "clics", "clic"], type: "number" },
      { db: "impressions", aliases: ["impressions", "impr"], type: "number" },
      { db: "ctr", aliases: ["ctr", "taux de clic"], type: "percentage" },
      { db: "position", aliases: ["position", "pos"], type: "number" },
      { db: "query", aliases: ["query", "requete", "requetes principales"], type: "text" },
      { db: "page", aliases: ["page", "url", "landing page"], type: "text" },
    ],
  },
  youtube: {
    label: "YouTube Analytics", icon: "\u25B6", color: "#ff0000", table: "analytics_youtube",
    fields: [
      { db: "date", aliases: ["date", "jour", "day"], type: "date", required: true },
      { db: "video_title", aliases: ["video title", "titre", "titre de la video", "title", "nom video"], type: "text" },
      { db: "views", aliases: ["views", "vues", "nb vues", "video views", "nombre de vues"], type: "number" },
      { db: "watch_time_hours", aliases: ["watch time hours", "watch time", "duree de visionnage", "duree visionnage heures", "temps de visionnage", "heures de visionnage"], type: "number" },
      { db: "likes", aliases: ["likes", "jaime", "j'aime", "nb likes"], type: "number" },
      { db: "comments", aliases: ["comments", "commentaires", "nb commentaires"], type: "number" },
      { db: "shares", aliases: ["shares", "partages", "nb partages"], type: "number" },
      { db: "subscribers_gained", aliases: ["subscribers gained", "abonnes gagnes", "nouveaux abonnes", "new subscribers"], type: "number" },
      { db: "traffic_source", aliases: ["traffic source", "source de trafic", "source trafic"], type: "text" },
    ],
  },
  tiktok: {
    label: "TikTok", icon: "\u266A", color: C.cyan, table: "analytics_tiktok",
    fields: [
      { db: "date", aliases: ["date", "jour", "day"], type: "date", required: true },
      { db: "views", aliases: ["views", "vues", "video views", "nb vues"], type: "number" },
      { db: "reach", aliases: ["reach", "portee", "couverture"], type: "number" },
      { db: "likes", aliases: ["likes", "jaime", "j'aime"], type: "number" },
      { db: "comments", aliases: ["comments", "commentaires"], type: "number" },
      { db: "shares", aliases: ["shares", "partages"], type: "number" },
      { db: "engagement_rate", aliases: ["engagement rate", "taux dengagement", "taux engagement", "engagement"], type: "percentage" },
      { db: "followers", aliases: ["followers", "abonnes", "nb abonnes"], type: "number" },
      { db: "followers_gained", aliases: ["new followers", "nouveaux abonnes", "followers gained"], type: "number" },
    ],
  },
  meta: {
    label: "Meta / Instagram", icon: "f", color: "#1877f2", table: "analytics_meta",
    fields: [
      { db: "date", aliases: ["date", "jour", "day"], type: "date", required: true },
      { db: "platform", aliases: ["platform", "plateforme", "reseau"], type: "text" },
      { db: "reach_organic", aliases: ["reach organic", "organic reach", "portee organique", "portee naturelle"], type: "number" },
      { db: "reach_paid", aliases: ["reach paid", "paid reach", "portee payante", "portee sponsorisee"], type: "number" },
      { db: "impressions", aliases: ["impressions", "impr"], type: "number" },
      { db: "engagement", aliases: ["engagement", "engagements", "interactions"], type: "number" },
      { db: "clicks", aliases: ["clicks", "clics", "clic"], type: "number" },
      { db: "spend", aliases: ["spend", "depense", "montant depense", "budget", "cout", "cost"], type: "currency" },
    ],
  },
  email: {
    label: "Brevo (Email/SMS)", icon: "\u2709", color: C.green, table: "analytics_email",
    fields: [
      { db: "date", aliases: ["date", "jour", "day", "date envoi"], type: "date", required: true },
      { db: "channel", aliases: ["channel", "canal", "type"], type: "text" },
      { db: "campaign_name", aliases: ["campaign name", "campagne", "nom campagne", "campaign"], type: "text" },
      { db: "sends", aliases: ["sends", "envois", "destinataires", "nb envois", "sent"], type: "number" },
      { db: "opens", aliases: ["opens", "ouvertures", "nb ouvertures", "opened"], type: "number" },
      { db: "clicks", aliases: ["clicks", "clics", "nb clics", "clicked"], type: "number" },
      { db: "bounces", aliases: ["bounces", "rebonds", "nb rebonds"], type: "number" },
      { db: "unsubscribes", aliases: ["unsubscribes", "desinscriptions", "desabonnements"], type: "number" },
      { db: "open_rate", aliases: ["open rate", "taux douverture", "taux ouverture"], type: "percentage" },
      { db: "click_rate", aliases: ["click rate", "taux de clic", "taux clic"], type: "percentage" },
    ],
  },
  cc_csv: {
    label: "Carter-Cash (Ventes FAP)", icon: "CC", color: C.orange, table: "prestations_weekly",
    fields: [
      { db: "date", aliases: ["date", "semaine", "semaine du", "periode", "week start", "week", "mois", "date debut"], type: "date" },
      { db: "store_code", aliases: ["store code", "store", "code", "code centre", "code magasin", "magasincode", "centre", "magasin", "n centre", "id centre", "num centre", "store id"], type: "text", required: true },
      { db: "ventes_fap", aliases: ["ventes fap", "ventes", "nb fap", "nb prestations", "prestations", "nettoyages", "qty", "quantite", "production", "nombre", "nb nettoyages", "volume"], type: "number" },
      { db: "ca_ht", aliases: ["ca ht", "ca", "chiffre affaires", "chiffre daffaires", "ca ttc", "revenue", "montant"], type: "currency" },
      { db: "marge", aliases: ["marge", "marge brute", "marge ht", "profit", "benefice", "marge nette"], type: "currency" },
    ],
  },
};

// ═══════ SMART DETECTION ENGINE ═══════

function normalize(str) {
  return String(str || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

function normalizeKeepSpaces(str) {
  return String(str || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[_\-]+/g, " ")
    .replace(/[^a-z0-9 ]/g, "")
    .trim();
}

function parseRawText(text) {
  const clean = text.replace(/^\uFEFF/, "");
  const lines = clean.split("\n").map(l => l.trim()).filter(Boolean);
  if (lines.length < 1) return { headers: [], rows: [], separator: "," };

  const firstLine = lines[0];
  const sep = firstLine.includes("\t") ? "\t" : firstLine.includes(";") ? ";" : ",";

  function splitLine(line) {
    const vals = [];
    let current = "";
    let inQuotes = false;
    for (const ch of line) {
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === sep && !inQuotes) { vals.push(current.trim()); current = ""; continue; }
      current += ch;
    }
    vals.push(current.trim());
    return vals;
  }

  const headers = splitLine(lines[0]).map(h => h.replace(/^["']|["']$/g, "").trim());
  const rows = lines.slice(1).map(line => {
    const vals = splitLine(line);
    const obj = {};
    headers.forEach((h, i) => { obj[h] = vals[i] || ""; });
    return obj;
  });

  return { headers, rows, separator: sep };
}

function detectColumnType(values) {
  const samples = values.filter(v => v !== "" && v != null).slice(0, 20);
  if (samples.length === 0) return "text";

  const datePatterns = [
    /^\d{4}-\d{2}-\d{2}/, /^\d{2}\/\d{2}\/\d{4}/, /^\d{2}-\d{2}-\d{4}/,
    /^\d{2}\.\d{2}\.\d{4}/, /^\d{4}\/\d{2}\/\d{2}/,
  ];
  const dateCount = samples.filter(v => datePatterns.some(p => p.test(String(v)))).length;
  if (dateCount >= samples.length * 0.7) return "date";

  const pctCount = samples.filter(v => /[\d,.]+ *%/.test(String(v))).length;
  if (pctCount >= samples.length * 0.5) return "percentage";

  const numCount = samples.filter(v => {
    const s = String(v).replace(/[\s\u00A0€$%]/g, "").replace(",", ".");
    return !isNaN(parseFloat(s)) && isFinite(s);
  }).length;
  if (numCount >= samples.length * 0.7) return "number";

  return "text";
}

function scoreSourceMatch(headers, rows) {
  const normalizedHeaders = headers.map(h => normalizeKeepSpaces(h));
  const scores = {};

  // Check for Carter-Cash pivot format (YYYY-MM columns)
  const dateColRegex = /^\d{4}-\d{2}/;
  const dateCols = headers.filter(c => dateColRegex.test(c));
  if (dateCols.length >= 2) {
    scores.cc_csv = { score: 100, confidence: "haute", format: "pivot", matchedFields: dateCols.length + 1 };
  }

  for (const [sourceKey, sourceDef] of Object.entries(SOURCE_DEFS)) {
    if (scores[sourceKey] && scores[sourceKey].score >= 100) continue;

    let score = 0;
    let matchedFields = 0;

    for (const field of sourceDef.fields) {
      const aliasNorms = field.aliases.map(a => normalize(a));
      const match = normalizedHeaders.some(nh => aliasNorms.includes(normalize(nh)));
      if (match) {
        matchedFields++;
        score += field.required ? 15 : 8;
      }
    }

    // Bonus for type coherence
    if (matchedFields >= 2) {
      const colTypes = headers.map(h => detectColumnType(rows.map(r => r[h])));
      const dateCol = colTypes.filter(t => t === "date").length;
      const numCol = colTypes.filter(t => t === "number" || t === "percentage").length;
      if (dateCol >= 1 && numCol >= 1) score += 5;
    }

    const totalFields = sourceDef.fields.length;
    const ratio = matchedFields / totalFields;
    const confidence = ratio >= 0.5 ? "haute" : ratio >= 0.3 ? "moyenne" : ratio >= 0.15 ? "faible" : "aucune";

    scores[sourceKey] = { score, confidence, matchedFields, format: "flat" };
  }

  // Differentiate GSC main vs CC based on context clues
  if (scores.gsc_main?.score === scores.gsc_cc?.score) {
    scores.gsc_main.score += 1; // Default to main
  }

  return scores;
}

function autoMapColumns(sourceKey, headers) {
  const sourceDef = SOURCE_DEFS[sourceKey];
  if (!sourceDef) return {};

  const mapping = {};
  const used = new Set();

  for (const field of sourceDef.fields) {
    let bestMatch = null;
    let bestScore = 0;

    for (const header of headers) {
      if (used.has(header)) continue;
      const hn = normalizeKeepSpaces(header);

      for (const alias of field.aliases) {
        const an = normalize(alias);
        const hnn = normalize(header);

        // Exact match
        if (hnn === an) {
          if (10 > bestScore) { bestScore = 10; bestMatch = header; }
        }
        // Contains match
        else if (hn.includes(normalize(alias)) || normalize(alias).includes(hnn)) {
          if (7 > bestScore) { bestScore = 7; bestMatch = header; }
        }
        // Starts with
        else if (hnn.startsWith(an.slice(0, 4)) && an.length >= 4) {
          if (4 > bestScore) { bestScore = 4; bestMatch = header; }
        }
      }
    }

    mapping[field.db] = bestMatch || null;
    if (bestMatch) used.add(bestMatch);
  }

  return mapping;
}

function detectBestSource(headers, rows) {
  const scores = scoreSourceMatch(headers, rows);
  const sorted = Object.entries(scores).sort((a, b) => b[1].score - a[1].score);
  const best = sorted[0];

  if (!best || best[1].score < 5) return null;

  return {
    sourceKey: best[0],
    ...best[1],
    alternatives: sorted.slice(1, 4).filter(s => s[1].score > 0),
  };
}

// ═══════ MAIN COMPONENT ═══════

export default function AnalyticsImport() {
  const [step, setStep] = useState("upload"); // upload | preview | importing | done
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
  const fileRef = useRef(null);

  const getToken = () => TOKEN || (typeof window !== "undefined" ? localStorage.getItem("fapexpert_admin_token") || "" : "");

  // Process raw text/file data
  const processData = useCallback((text, name) => {
    setError(null);
    setResult(null);

    const { headers: h, rows: r } = parseRawText(text);
    if (h.length === 0 || r.length === 0) {
      setError("Aucune donnee exploitable trouvee. Verifiez le format du fichier.");
      return;
    }

    setHeaders(h);
    setRows(r);
    setFileName(name || "Donnees collees");

    // Auto-detect source
    const detection = detectBestSource(h, r);
    setDetected(detection);

    if (detection) {
      setSelectedSource(detection.sourceKey);
      const mapping = autoMapColumns(detection.sourceKey, h);
      setColumnMapping(mapping);
    } else {
      setSelectedSource("");
      setColumnMapping({});
    }

    setStep("preview");
  }, []);

  // File handlers
  const handleFile = useCallback((file) => {
    if (!file) return;
    file.text().then(text => processData(text, file.name));
  }, [processData]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handlePaste = useCallback(() => {
    if (rawText.trim()) processData(rawText, "Donnees collees");
  }, [rawText, processData]);

  // Update mapping when source changes
  const handleSourceChange = useCallback((newSource) => {
    setSelectedSource(newSource);
    if (newSource && headers.length > 0) {
      setColumnMapping(autoMapColumns(newSource, headers));
    }
  }, [headers]);

  // Update single mapping
  const updateMapping = useCallback((dbField, headerValue) => {
    setColumnMapping(prev => ({ ...prev, [dbField]: headerValue || null }));
  }, []);

  // IMPORT
  const handleImport = useCallback(async () => {
    if (!selectedSource) { setError("Selectionnez une destination"); return; }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const body = {
        source: selectedSource,
        rows,
        column_mapping: columnMapping,
        ...(purge ? { purge: true } : {}),
      };

      const resp = await fetch(`/api/admin/analytics-import?token=${encodeURIComponent(getToken())}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const json = await resp.json();
      if (!resp.ok) throw new Error(json.error || `Erreur ${resp.status}`);

      const prefix = json.purged ? "Donnees purgees. " : "";
      const storesInfo = json.stores ? ` (magasins: ${json.stores.join(", ")})` : "";
      const skippedInfo = json.skipped ? ` | ${json.skipped} lignes ignorees` : "";
      setResult({
        ok: true,
        msg: `${prefix}${json.inserted} lignes importees${storesInfo}${skippedInfo}`,
        details: json,
      });
      setStep("done");
    } catch (err) {
      setError(err.message);
    }

    setLoading(false);
  }, [selectedSource, rows, columnMapping, purge]);

  // Reset
  const handleReset = useCallback(() => {
    setStep("upload");
    setRawText("");
    setFileName("");
    setHeaders([]);
    setRows([]);
    setDetected(null);
    setSelectedSource("");
    setColumnMapping({});
    setPurge(false);
    setResult(null);
    setError(null);
  }, []);

  return (
    <>
      <Head><title>Import Analytics — Re-FAP</title></Head>
      <div style={{ minHeight: "100vh", background: C.bg, fontFamily: "'DM Sans', system-ui, sans-serif", color: C.text }}>

        {/* Header */}
        <header style={{
          background: C.surface, borderBottom: `1px solid ${C.border}`,
          padding: "16px 32px", display: "flex", alignItems: "center", justifyContent: "space-between",
          position: "sticky", top: 0, zIndex: 100,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 36, height: 36, background: C.green, borderRadius: 8,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontWeight: 700, fontSize: 14, color: "#000",
            }}>RE</div>
            <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Import Intelligent</h1>
            <span style={{ fontSize: 12, color: C.muted, background: "#1a2234", padding: "2px 8px", borderRadius: 4 }}>Multi-sources · Auto-detection</span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {step !== "upload" && (
              <button onClick={handleReset} style={{
                background: "#1a2234", border: `1px solid ${C.border}`, color: C.text,
                padding: "8px 16px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "inherit",
              }}>Nouvel import</button>
            )}
            <Link href="/admin/analytics" style={{
              background: C.blue, color: "#fff", border: "none",
              padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: "none",
              display: "flex", alignItems: "center",
            }}>Dashboard</Link>
          </div>
        </header>

        {/* Nav */}
        <nav style={{ background: "#0f1523", borderBottom: `1px solid ${C.border}`, padding: "0 32px", display: "flex", gap: 0 }}>
          {NAV_ITEMS.map(item => (
            <Link key={item.href} href={item.href} style={{
              padding: "10px 18px", fontSize: 13, fontWeight: 600, textDecoration: "none",
              color: item.href === "/admin/analytics" ? C.text : C.muted,
              borderBottom: item.href === "/admin/analytics" ? `2px solid ${C.green}` : "2px solid transparent",
            }}>{item.label}</Link>
          ))}
        </nav>

        <main style={{ maxWidth: 1200, margin: "0 auto", padding: "32px" }}>

          {/* ═══════ STEP 1: UPLOAD ═══════ */}
          {step === "upload" && (
            <>
              {/* Info banner */}
              <div style={{
                background: `${C.green}11`, border: `1px solid ${C.green}33`, borderRadius: 12,
                padding: "16px 20px", marginBottom: 32, display: "flex", alignItems: "center", gap: 12,
              }}>
                <span style={{ fontSize: 20 }}>*</span>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>Import intelligent</div>
                  <div style={{ color: C.sub, fontSize: 13 }}>
                    Deposez n'importe quel fichier de donnees (CSV, TSV, Excel copie-colle). L'outil detecte automatiquement la source, les colonnes et le format. Aucun format specifique requis.
                  </div>
                </div>
              </div>

              {/* Drop zone */}
              <div
                onDrop={handleDrop}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onClick={() => fileRef.current?.click()}
                style={{
                  background: dragOver ? `${C.blue}15` : C.surface,
                  border: `2px dashed ${dragOver ? C.blue : C.border}`,
                  borderRadius: 16, padding: "60px 40px", textAlign: "center",
                  cursor: "pointer", transition: "all 0.2s", marginBottom: 24,
                }}
              >
                <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.6 }}>{dragOver ? "\u2B07" : "\u{1F4C1}"}</div>
                <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8, color: C.text }}>
                  {dragOver ? "Lachez le fichier ici" : "Glissez-deposez un fichier ici"}
                </div>
                <div style={{ color: C.sub, fontSize: 14, marginBottom: 16 }}>
                  ou cliquez pour choisir un fichier
                </div>
                <div style={{ color: C.muted, fontSize: 12 }}>
                  CSV, TSV, TXT — Tout format accepte (GSC, YouTube, TikTok, Meta, Brevo, Carter-Cash...)
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,.tsv,.txt,.xls,.xlsx"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
                  style={{ display: "none" }}
                />
              </div>

              {/* OR separator */}
              <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
                <div style={{ flex: 1, height: 1, background: C.border }} />
                <span style={{ color: C.muted, fontSize: 13, fontWeight: 600 }}>OU</span>
                <div style={{ flex: 1, height: 1, background: C.border }} />
              </div>

              {/* Paste zone */}
              <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24 }}>
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12, color: C.text }}>
                  Collez vos donnees brutes
                </div>
                <textarea
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  placeholder="Collez ici vos donnees (copiees depuis Excel, Google Sheets, ou tout autre tableur)...&#10;&#10;Exemple:&#10;Date&#9;Clicks&#9;Impressions&#10;2026-02-01&#9;150&#9;4500&#10;2026-02-02&#9;180&#9;5200"
                  style={{
                    width: "100%", minHeight: 160, background: "#0a0e17",
                    border: `1px solid ${C.border}`, borderRadius: 8,
                    padding: 16, color: C.text, fontSize: 13, fontFamily: "monospace",
                    resize: "vertical", outline: "none",
                  }}
                />
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
                  <span style={{ color: C.muted, fontSize: 12 }}>
                    Supporte les donnees separees par tabulations, virgules ou points-virgules
                  </span>
                  <button
                    onClick={handlePaste}
                    disabled={!rawText.trim()}
                    style={{
                      background: rawText.trim() ? `${C.green}22` : `${C.muted}22`,
                      border: `1px solid ${rawText.trim() ? C.green : C.muted}44`,
                      color: rawText.trim() ? C.green : C.muted,
                      padding: "10px 24px", borderRadius: 8, cursor: rawText.trim() ? "pointer" : "default",
                      fontSize: 14, fontWeight: 600, fontFamily: "inherit",
                    }}
                  >
                    Analyser les donnees
                  </button>
                </div>
              </div>

              {/* Supported sources reference */}
              <div style={{ marginTop: 32 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.sub, textTransform: "uppercase", letterSpacing: 2, marginBottom: 12 }}>
                  Sources detectees automatiquement
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {Object.entries(SOURCE_DEFS).map(([key, def]) => (
                    <div key={key} style={{
                      background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8,
                      padding: "8px 14px", display: "flex", alignItems: "center", gap: 8,
                    }}>
                      <span style={{ color: def.color, fontWeight: 700, fontSize: 14 }}>{def.icon}</span>
                      <span style={{ color: C.sub, fontSize: 12 }}>{def.label}</span>
                    </div>
                  ))}
                  <div style={{
                    background: `${C.purple}11`, border: `1px solid ${C.purple}33`, borderRadius: 8,
                    padding: "8px 14px", display: "flex", alignItems: "center", gap: 8,
                  }}>
                    <span style={{ color: C.purple, fontWeight: 700, fontSize: 14 }}>CRM</span>
                    <span style={{ color: C.sub, fontSize: 12 }}>Auto Supabase</span>
                  </div>
                  <div style={{
                    background: `${C.pink}11`, border: `1px solid ${C.pink}33`, borderRadius: 8,
                    padding: "8px 14px", display: "flex", alignItems: "center", gap: 8,
                  }}>
                    <span style={{ color: C.pink, fontWeight: 700, fontSize: 14 }}>Bot</span>
                    <span style={{ color: C.sub, fontSize: 12 }}>Auto Supabase</span>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ═══════ STEP 2: PREVIEW ═══════ */}
          {step === "preview" && (
            <PreviewStep
              fileName={fileName}
              headers={headers}
              rows={rows}
              detected={detected}
              selectedSource={selectedSource}
              columnMapping={columnMapping}
              purge={purge}
              loading={loading}
              error={error}
              onSourceChange={handleSourceChange}
              onMappingChange={updateMapping}
              onPurgeChange={setPurge}
              onImport={handleImport}
              onReset={handleReset}
            />
          )}

          {/* ═══════ STEP 3: DONE ═══════ */}
          {step === "done" && result && (
            <div style={{ textAlign: "center", padding: "60px 0" }}>
              <div style={{ fontSize: 64, marginBottom: 24 }}>{result.ok ? "\u2705" : "\u274C"}</div>
              <div style={{
                fontSize: 18, fontWeight: 600, marginBottom: 16,
                color: result.ok ? C.green : C.red,
              }}>
                {result.ok ? "Import reussi !" : "Erreur lors de l'import"}
              </div>
              <div style={{
                background: result.ok ? `${C.green}11` : `${C.red}11`,
                border: `1px solid ${result.ok ? C.green : C.red}33`,
                borderRadius: 12, padding: "16px 24px", display: "inline-block",
                fontSize: 14, color: result.ok ? C.green : C.red, maxWidth: 600,
              }}>
                {result.msg}
              </div>
              <div style={{ marginTop: 32, display: "flex", gap: 12, justifyContent: "center" }}>
                <button onClick={handleReset} style={{
                  background: `${C.blue}22`, border: `1px solid ${C.blue}44`, color: C.blue,
                  padding: "12px 28px", borderRadius: 10, cursor: "pointer",
                  fontSize: 14, fontWeight: 700, fontFamily: "inherit",
                }}>Importer d'autres donnees</button>
                <Link href="/admin/analytics" style={{
                  background: `${C.green}22`, border: `1px solid ${C.green}44`, color: C.green,
                  padding: "12px 28px", borderRadius: 10, textDecoration: "none",
                  fontSize: 14, fontWeight: 700,
                }}>Voir le dashboard</Link>
              </div>
            </div>
          )}

          {/* Global error */}
          {error && step !== "preview" && (
            <div style={{
              marginTop: 24, padding: "16px 20px", borderRadius: 12,
              background: `${C.red}11`, border: `1px solid ${C.red}33`, color: C.red, fontSize: 14,
            }}>
              {error}
            </div>
          )}

        </main>
      </div>
    </>
  );
}

// ═══════ PREVIEW STEP COMPONENT ═══════

function PreviewStep({ fileName, headers, rows, detected, selectedSource, columnMapping, purge, loading, error, onSourceChange, onMappingChange, onPurgeChange, onImport, onReset }) {
  const sourceDef = SOURCE_DEFS[selectedSource];
  const isGsc = selectedSource === "gsc_main" || selectedSource === "gsc_cc";
  const isPivot = detected?.format === "pivot";

  // Count mapped fields
  const mappedCount = Object.values(columnMapping).filter(Boolean).length;
  const requiredFields = sourceDef?.fields.filter(f => f.required) || [];
  const missingRequired = requiredFields.filter(f => !columnMapping[f.db]);

  return (
    <>
      {/* Detection result */}
      <div style={{
        background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12,
        padding: 24, marginBottom: 24,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, color: C.text, marginBottom: 4 }}>
              Fichier : {fileName}
            </div>
            <div style={{ color: C.sub, fontSize: 13 }}>
              {rows.length} lignes detectees · {headers.length} colonnes · Colonnes : {headers.join(", ")}
            </div>
          </div>
          <button onClick={onReset} style={{
            background: "transparent", border: `1px solid ${C.border}`, color: C.muted,
            padding: "6px 14px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontFamily: "inherit",
          }}>Changer de fichier</button>
        </div>

        {/* Source detection */}
        {detected && (
          <div style={{
            background: detected.confidence === "haute" ? `${C.green}11` : detected.confidence === "moyenne" ? `${C.yellow}11` : `${C.orange}11`,
            border: `1px solid ${detected.confidence === "haute" ? C.green : detected.confidence === "moyenne" ? C.yellow : C.orange}33`,
            borderRadius: 8, padding: "12px 16px", marginBottom: 16,
          }}>
            <span style={{
              fontWeight: 700, fontSize: 14,
              color: detected.confidence === "haute" ? C.green : detected.confidence === "moyenne" ? C.yellow : C.orange,
            }}>
              {detected.confidence === "haute" ? "\u2713" : detected.confidence === "moyenne" ? "~" : "?"} Source detectee : {SOURCE_DEFS[detected.sourceKey]?.label || detected.sourceKey}
            </span>
            <span style={{ color: C.sub, fontSize: 12, marginLeft: 12 }}>
              Confiance {detected.confidence} · {detected.matchedFields} champs reconnus
              {isPivot && " · Format tableau croise (pivot)"}
            </span>
          </div>
        )}

        {!detected && (
          <div style={{
            background: `${C.yellow}11`, border: `1px solid ${C.yellow}33`,
            borderRadius: 8, padding: "12px 16px", marginBottom: 16,
          }}>
            <span style={{ color: C.yellow, fontWeight: 600, fontSize: 14 }}>
              Source non detectee automatiquement. Selectionnez la destination ci-dessous.
            </span>
          </div>
        )}

        {/* Source selector */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span style={{ color: C.sub, fontSize: 13, fontWeight: 600 }}>Destination :</span>
          {Object.entries(SOURCE_DEFS).map(([key, def]) => (
            <button
              key={key}
              onClick={() => onSourceChange(key)}
              style={{
                background: selectedSource === key ? `${def.color}22` : "transparent",
                border: `1px solid ${selectedSource === key ? def.color : C.border}`,
                color: selectedSource === key ? def.color : C.muted,
                padding: "6px 14px", borderRadius: 8, cursor: "pointer",
                fontSize: 12, fontWeight: 600, fontFamily: "inherit",
                transition: "all 0.15s",
              }}
            >
              {def.icon} {def.label}
            </button>
          ))}
        </div>
      </div>

      {/* Column mapping */}
      {sourceDef && (
        <div style={{
          background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12,
          padding: 24, marginBottom: 24,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>
              Mapping des colonnes
              <span style={{ color: C.muted, fontSize: 12, fontWeight: 400, marginLeft: 8 }}>
                {mappedCount}/{sourceDef.fields.length} champs mappes
              </span>
            </div>
            {isPivot && (
              <span style={{
                background: `${C.orange}22`, color: C.orange, padding: "4px 10px",
                borderRadius: 6, fontSize: 11, fontWeight: 600,
              }}>
                Format pivot detecte — les colonnes mois seront aplaties automatiquement
              </span>
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {sourceDef.fields.map(field => (
              <div key={field.db} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 140, flexShrink: 0 }}>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{field.db}</span>
                  {field.required && <span style={{ color: C.red, marginLeft: 4 }}>*</span>}
                  <div style={{ fontSize: 10, color: C.muted }}>{field.type}</div>
                </div>
                <span style={{ color: C.muted, fontSize: 14 }}>\u2192</span>
                <select
                  value={columnMapping[field.db] || ""}
                  onChange={(e) => onMappingChange(field.db, e.target.value)}
                  style={{
                    flex: 1, background: "#0a0e17", border: `1px solid ${C.border}`,
                    borderRadius: 6, padding: "6px 10px", color: columnMapping[field.db] ? C.text : C.muted,
                    fontSize: 12, fontFamily: "inherit", cursor: "pointer", outline: "none",
                  }}
                >
                  <option value="">— Non mappe —</option>
                  {headers.map(h => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          {missingRequired.length > 0 && !isPivot && (
            <div style={{
              marginTop: 12, padding: "8px 12px", borderRadius: 6,
              background: `${C.yellow}11`, border: `1px solid ${C.yellow}33`,
              color: C.yellow, fontSize: 12,
            }}>
              Champs requis non mappes : {missingRequired.map(f => f.db).join(", ")}
              <span style={{ color: C.sub, marginLeft: 8 }}>
                (L'import tentera quand meme de trouver les valeurs dans les donnees)
              </span>
            </div>
          )}
        </div>
      )}

      {/* Data preview */}
      <div style={{
        background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12,
        padding: 24, marginBottom: 24,
      }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>
          Apercu des donnees
          <span style={{ color: C.muted, fontSize: 12, fontWeight: 400, marginLeft: 8 }}>
            {Math.min(5, rows.length)} premieres lignes sur {rows.length}
          </span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                {headers.map(h => {
                  const isMapped = Object.values(columnMapping).includes(h);
                  return (
                    <th key={h} style={{
                      padding: "8px 10px", textAlign: "left", fontWeight: 600, whiteSpace: "nowrap",
                      color: isMapped ? C.green : C.muted, fontSize: 11,
                    }}>
                      {h}
                      {isMapped && <span style={{ color: C.green, marginLeft: 4 }}>\u2713</span>}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 5).map((row, i) => (
                <tr key={i} style={{ borderBottom: `1px solid ${C.border}30` }}>
                  {headers.map(h => (
                    <td key={h} style={{
                      padding: "6px 10px", fontFamily: "monospace", fontSize: 11,
                      color: C.sub, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {row[h] || ""}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Options + Import button */}
      <div style={{
        background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12,
        padding: 24, display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          {isGsc && (
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, color: C.sub }}>
              <input
                type="checkbox"
                checked={purge}
                onChange={(e) => onPurgeChange(e.target.checked)}
                style={{ accentColor: C.red }}
              />
              <span style={{ color: purge ? C.red : C.sub }}>Vider et reimporter (purge)</span>
            </label>
          )}
          <span style={{ color: C.muted, fontSize: 12 }}>
            {rows.length} lignes a importer vers {sourceDef?.label || "—"}
          </span>
        </div>

        <button
          onClick={onImport}
          disabled={loading || !selectedSource}
          style={{
            background: loading ? `${C.muted}44` : `${C.green}`,
            border: "none", color: loading ? C.sub : "#000",
            padding: "12px 32px", borderRadius: 10, cursor: loading ? "wait" : "pointer",
            fontSize: 15, fontWeight: 700, fontFamily: "inherit",
            transition: "all 0.2s",
          }}
        >
          {loading ? "Import en cours..." : `Importer ${rows.length} lignes`}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div style={{
          marginTop: 16, padding: "16px 20px", borderRadius: 12,
          background: `${C.red}11`, border: `1px solid ${C.red}33`, color: C.red, fontSize: 14,
        }}>
          {error}
        </div>
      )}
    </>
  );
}
