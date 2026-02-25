// /pages/admin/analytics/import.js
// Import multi-sources — CSV & PDF upload
// Dark theme cohérent avec le reste de l'admin

import { useState, useCallback } from "react";
import Head from "next/head";
import Link from "next/link";

const TOKEN = process.env.NEXT_PUBLIC_ADMIN_TOKEN || "";

const C = {
  bg: "#0a0e17",
  surface: "#111827",
  border: "#1e293b",
  green: "#22c55e",
  blue: "#3b82f6",
  yellow: "#f59e0b",
  red: "#ef4444",
  purple: "#8b5cf6",
  cyan: "#06b6d4",
  orange: "#f97316",
  pink: "#ec4899",
  muted: "#64748b",
  text: "#e2e8f0",
  sub: "#94a3b8",
};

const SOURCES = [
  { key: "gsc_main", label: "GSC \u2014 re-fap.fr (Site principal)", icon: "G", color: C.blue, type: "csv", desc: "Depuis le ZIP export GSC, importer uniquement Graphique.csv (colonnes : Date, Clics, Impressions, CTR, Position). Les fichiers Pages.csv, Requetes.csv, Appareils.csv ne sont pas acceptes." },
  { key: "gsc_cc", label: "GSC \u2014 auto.re-fap.fr (Carter-Cash)", icon: "G", color: "#4285f4", type: "csv", desc: "Depuis le ZIP export GSC, importer uniquement Graphique.csv (colonnes : Date, Clics, Impressions, CTR, Position). Les fichiers Pages.csv, Requetes.csv, Appareils.csv ne sont pas acceptes." },
  { key: "youtube", label: "YouTube Analytics", icon: "\u25B6", color: "#ff0000", type: "csv", desc: "CSV avec colonnes: date, video_title, views, watch_time, likes, comments, shares" },
  { key: "tiktok", label: "TikTok", icon: "\u266A", color: C.cyan, type: "csv", desc: "CSV avec colonnes: date, views, reach, engagement_rate, followers, likes, comments" },
  { key: "meta", label: "Meta / Instagram", icon: "f", color: "#1877f2", type: "csv", desc: "CSV avec colonnes: date, reach_organic, reach_paid, engagement, spend, clicks" },
  { key: "email", label: "Brevo (Email/SMS)", icon: "\u2709", color: C.green, type: "csv", desc: "CSV avec colonnes: date, channel, campaign_name, sends, opens, clicks" },
  { key: "cc_csv", label: "Carter-Cash (Ventes FAP)", icon: "CC", color: C.orange, type: "csv", desc: "Accepte 2 formats : (1) Tableau croise avec MagasinCode + colonnes mois (2025-10, 2025-11...) ou (2) Format plat avec colonnes date, store_code, ventes_fap, ca_ht, marge. UPSERT sur (store_code, date)." },
];

const NAV_ITEMS = [
  { href: "/admin", label: "Terrain" },
  { href: "/admin/social", label: "Social" },
  { href: "/admin/seo", label: "SEO" },
  { href: "/admin/performance", label: "Performance" },
  { href: "/admin/magasins", label: "Magasins" },
  { href: "/admin/analytics", label: "Analytics" },
  { href: "/admin/financier", label: "Financier" },
];

// Simple CSV parser
function parseCSV(text) {
  // Strip BOM (common in GSC exports)
  const clean = text.replace(/^\uFEFF/, "");
  const lines = clean.split("\n").map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];

  // Detect separator
  const sep = lines[0].includes("\t") ? "\t" : lines[0].includes(";") ? ";" : ",";
  const headers = lines[0].split(sep).map(h => h.replace(/^["']|["']$/g, "").trim());

  return lines.slice(1).map(line => {
    const vals = [];
    let current = "";
    let inQuotes = false;
    for (const ch of line) {
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === sep && !inQuotes) { vals.push(current.trim()); current = ""; continue; }
      current += ch;
    }
    vals.push(current.trim());

    const obj = {};
    headers.forEach((h, i) => { obj[h] = vals[i] || ""; });
    return obj;
  });
}

export default function AnalyticsImport() {
  const [results, setResults] = useState({});
  const [uploading, setUploading] = useState({});

  const getToken = () => TOKEN || (typeof window !== "undefined" ? localStorage.getItem("fapexpert_admin_token") || "" : "");

  const handleUpload = useCallback(async (source, file, purge = false) => {
    setUploading(u => ({ ...u, [source.key]: true }));
    setResults(r => ({ ...r, [source.key]: null }));

    try {
      const text = await file.text();
      const rows = parseCSV(text);
      if (rows.length === 0) throw new Error("Aucune ligne trouvee dans le fichier");

      // GSC: only accept Graphique.csv (has a Date column)
      if (source.key === "gsc_main" || source.key === "gsc_cc") {
        const h = Object.keys(rows[0]);
        const hasDate = h.some(k => k.toLowerCase() === "date");
        if (!hasDate) {
          const detected = h[0] || "inconnu";
          throw new Error(`Veuillez importer le fichier Graphique.csv pour les donnees temporelles. Ce fichier contient la colonne "${detected}" au lieu de "Date".`);
        }
      }

      // cc_csv: show detected columns if none match expected names
      if (source.key === "cc_csv" && rows.length > 0) {
        const cols = Object.keys(rows[0]);
        console.log("[cc_csv] Colonnes detectees:", cols);
      }

      const body = { source: source.key, rows, ...(purge ? { purge: true } : {}) };

      const resp = await fetch(`/api/admin/analytics-import?token=${encodeURIComponent(getToken())}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const json = await resp.json();
      if (!resp.ok) throw new Error(json.error || `Erreur ${resp.status}`);

      const prefix = json.purged ? "Donnees purgees. " : "";
      const storesInfo = json.stores ? ` (${json.stores.join(", ")})` : "";
      setResults(r => ({ ...r, [source.key]: { ok: true, msg: `${prefix}${json.inserted} lignes importees${storesInfo}` } }));
    } catch (err) {
      setResults(r => ({ ...r, [source.key]: { ok: false, msg: err.message } }));
    }

    setUploading(u => ({ ...u, [source.key]: false }));
  }, []);

  const downloadCcTemplate = useCallback(() => {
    const header = "date,store_code,ventes_fap,ca_ht,marge";
    const example = "2026-02-01,801,12,1788.00,894.00\n2026-02-01,065,8,1192.00,596.00";
    const content = header + "\n" + example + "\n";
    const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "template-carter-cash.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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
            <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Import Analytics</h1>
            <span style={{ fontSize: 12, color: C.muted, background: "#1a2234", padding: "2px 8px", borderRadius: 4 }}>Multi-sources</span>
          </div>
          <Link href="/admin/analytics" style={{
            background: C.blue, color: "#fff", border: "none",
            padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600,
            textDecoration: "none",
          }}>
            Voir le Dashboard
          </Link>
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

          {/* Info banner */}
          <div style={{
            background: `${C.blue}11`, border: `1px solid ${C.blue}33`, borderRadius: 12,
            padding: "16px 20px", marginBottom: 32, display: "flex", alignItems: "center", gap: 12,
          }}>
            <span style={{ fontSize: 20 }}>i</span>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>Upload de fichiers par source</div>
              <div style={{ color: C.sub, fontSize: 13 }}>
                Importez vos exports CSV depuis chaque plateforme. Les donnees CRM/Leads et Chatbot sont lues directement depuis Supabase.
              </div>
            </div>
          </div>

          {/* Sources grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            {SOURCES.map(source => (
              <SourceCard
                key={source.key}
                source={source}
                result={results[source.key]}
                loading={uploading[source.key]}
                onUpload={(file) => handleUpload(source, file, false)}
                onPurgeUpload={(file) => handleUpload(source, file, true)}
                onDownloadTemplate={source.key === "cc_csv" ? downloadCcTemplate : null}
              />
            ))}

            {/* CRM/Leads — auto */}
            <div style={{
              background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 8, background: `${C.purple}22`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 18, fontWeight: 700, color: C.purple,
                }}>CRM</div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>CRM / Leads</div>
                  <div style={{ color: C.sub, fontSize: 12 }}>Lecture directe Supabase</div>
                </div>
              </div>
              <div style={{
                background: `${C.green}11`, border: `1px solid ${C.green}33`, borderRadius: 8,
                padding: "12px 16px", fontSize: 13, color: C.green, fontWeight: 500,
              }}>
                Connecte automatiquement — table crm_leads
              </div>
            </div>

            {/* Chatbot — auto */}
            <div style={{
              background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 8, background: `${C.pink}22`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 18, fontWeight: 700, color: C.pink,
                }}>Bot</div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>Chatbot FAPexpert</div>
                  <div style={{ color: C.sub, fontSize: 12 }}>Lecture directe Supabase</div>
                </div>
              </div>
              <div style={{
                background: `${C.green}11`, border: `1px solid ${C.green}33`, borderRadius: 8,
                padding: "12px 16px", fontSize: 13, color: C.green, fontWeight: 500,
              }}>
                Connecte automatiquement — table messages
              </div>
            </div>
          </div>

        </main>
      </div>
    </>
  );
}

function SourceCard({ source, result, loading, onUpload, onPurgeUpload, onDownloadTemplate }) {
  const isGsc = source.key === "gsc_main" || source.key === "gsc_cc";

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (file) onUpload(file);
    e.target.value = "";
  };

  const handlePurgeFile = (e) => {
    const file = e.target.files?.[0];
    if (file) onPurgeUpload(file);
    e.target.value = "";
  };

  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24,
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 8, background: `${source.color}22`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 18, fontWeight: 700, color: source.color,
        }}>{source.icon}</div>
        <div>
          <div style={{ fontWeight: 600, fontSize: 15 }}>{source.label}</div>
          <div style={{ color: C.sub, fontSize: 12 }}>Import CSV</div>
        </div>
      </div>

      {/* Description */}
      <div style={{ color: C.sub, fontSize: 12, marginBottom: 16, lineHeight: 1.5 }}>
        {source.desc}
      </div>

      {/* Buttons */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {/* Normal upload */}
        <label style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          background: loading ? C.muted + "44" : `${source.color}22`,
          border: `1px solid ${source.color}44`,
          color: loading ? C.sub : source.color,
          padding: "10px 20px", borderRadius: 8, cursor: loading ? "wait" : "pointer",
          fontSize: 13, fontWeight: 600, transition: "all 0.2s",
        }}>
          {loading ? "Import en cours..." : "Choisir un fichier CSV"}
          <input
            type="file"
            accept=".csv,.tsv,.txt"
            onChange={handleFile}
            disabled={loading}
            style={{ display: "none" }}
          />
        </label>

        {/* Purge + re-import (GSC only) */}
        {isGsc && (
          <label style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            background: loading ? C.muted + "44" : `${C.red}15`,
            border: `1px solid ${C.red}44`,
            color: loading ? C.sub : C.red,
            padding: "10px 20px", borderRadius: 8, cursor: loading ? "wait" : "pointer",
            fontSize: 13, fontWeight: 600, transition: "all 0.2s",
          }}>
            {loading ? "..." : "Vider et reimporter"}
            <input
              type="file"
              accept=".csv,.tsv,.txt"
              onChange={handlePurgeFile}
              disabled={loading}
              style={{ display: "none" }}
            />
          </label>
        )}

        {/* Download template (Carter-Cash) */}
        {onDownloadTemplate && (
          <button
            onClick={onDownloadTemplate}
            style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              background: `${C.muted}15`, border: `1px solid ${C.muted}44`,
              color: C.sub, padding: "10px 20px", borderRadius: 8,
              cursor: "pointer", fontSize: 13, fontWeight: 600,
              fontFamily: "inherit", transition: "all 0.2s",
            }}
          >
            Telecharger le template CSV
          </button>
        )}
      </div>

      {/* Result */}
      {result && (
        <div style={{
          marginTop: 12, padding: "10px 14px", borderRadius: 8, fontSize: 13,
          background: result.ok ? `${C.green}11` : `${C.red}11`,
          border: `1px solid ${result.ok ? C.green : C.red}33`,
          color: result.ok ? C.green : C.red,
        }}>
          {result.ok ? "\u2713" : "\u2717"} {result.msg}
        </div>
      )}
    </div>
  );
}
