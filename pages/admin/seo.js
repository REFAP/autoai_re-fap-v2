// /pages/admin/seo.js
// Dashboard SEO — Google Search Console
// Top 10 Pages + Top 10 Requêtes avec filtre période

import { useState, useEffect, useCallback } from "react";
import Head from "next/head";
import Link from "next/link";

const TOKEN = process.env.NEXT_PUBLIC_ADMIN_TOKEN || "";

const C = {
  bg:      "#0a0e17",
  surface: "#111827",
  border:  "#1e293b",
  accent:  "#3b82f6",
  green:   "#22c55e",
  yellow:  "#f59e0b",
  red:     "#ef4444",
  muted:   "#64748b",
  text:    "#e2e8f0",
  sub:     "#94a3b8",
};

export default function SeoDashboard() {
  const [data, setData] = useState(null);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch(`/api/seo?days=${days}&token=${encodeURIComponent(TOKEN)}`);
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || `Erreur ${resp.status}`);
      }
      setData(await resp.json());
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  }, [days]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <>
      <Head><title>SEO Dashboard — Re-FAP</title></Head>
      <div style={{
        minHeight: "100vh", background: C.bg,
        fontFamily: "'DM Sans', system-ui, sans-serif", color: C.text,
      }}>
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
            <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>SEO — Google Search Console</h1>
            <a href="/admin" style={{
              fontSize: 12, color: C.muted, background: "#1a2234",
              padding: "2px 8px", borderRadius: 4, textDecoration: "none",
            }}>Dashboard principal</a>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {[7, 14, 30, 90].map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                style={{
                  background: days === d ? C.accent : "#1a2234",
                  border: `1px solid ${days === d ? C.accent : C.border}`,
                  color: days === d ? "#fff" : C.sub,
                  padding: "6px 14px", borderRadius: 8, cursor: "pointer",
                  fontFamily: "inherit", fontSize: 13, fontWeight: days === d ? 600 : 400,
                }}
              >
                {d}j
              </button>
            ))}
            <button
              onClick={fetchData}
              disabled={loading}
              style={{
                background: "#1a2234", border: `1px solid ${C.border}`, color: C.text,
                padding: "6px 14px", borderRadius: 8, cursor: loading ? "wait" : "pointer",
                fontFamily: "inherit", fontSize: 13, marginLeft: 8,
              }}
            >
              {loading ? "..." : "Rafraichir"}
            </button>
          </div>
        </header>

        {/* Admin Nav */}
        <nav style={{ background: "#0f1523", borderBottom: `1px solid ${C.border}`, padding: "0 32px", display: "flex", gap: 0 }}>
          {[
            { href: "/admin", label: "Terrain" },
            { href: "/admin/social", label: "Social" },
            { href: "/admin/seo", label: "SEO" },
            { href: "/admin/performance", label: "Performance" },
            { href: "/admin/magasins", label: "Magasins" },
          ].map((item) => (
            <Link key={item.href} href={item.href} style={{
              padding: "10px 18px", fontSize: 13, fontWeight: 600, textDecoration: "none",
              color: item.href === "/admin/seo" ? C.text : C.muted,
              borderBottom: item.href === "/admin/seo" ? `2px solid ${C.green}` : "2px solid transparent",
            }}>{item.label}</Link>
          ))}
        </nav>

        {/* Loading */}
        {loading && !data && (
          <div style={{ textAlign: "center", padding: 80, color: C.muted }}>
            Chargement des donnees SEO...
          </div>
        )}

        {/* Error */}
        {error && !data && (
          <div style={{ textAlign: "center", padding: 80 }}>
            <div style={{ color: C.red, marginBottom: 16 }}>{error}</div>
            <button onClick={fetchData} style={{
              background: C.green, color: "#000", border: "none",
              padding: "10px 24px", borderRadius: 8, fontWeight: 600, cursor: "pointer",
            }}>Reessayer</button>
          </div>
        )}

        {/* Content */}
        {data && (
          <main style={{ maxWidth: 1400, margin: "0 auto", padding: "24px 32px" }}>

            {/* KPI Cards */}
            {data.totals && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 24 }}>
                <KpiCard label={`Clicks (${data.days}j)`} value={formatNum(data.totals.clicks)} color={C.accent} />
                <KpiCard label={`Impressions (${data.days}j)`} value={formatNum(data.totals.impressions)} color={C.green} />
                <KpiCard
                  label="CTR moyen"
                  value={data.totals.impressions > 0
                    ? ((data.totals.clicks / data.totals.impressions) * 100).toFixed(2) + "%"
                    : "—"}
                  color={C.yellow}
                />
              </div>
            )}

            {/* Tables */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
              <SeoTable title="Top 10 Pages" rows={data.topPages} labelKey="page" />
              <SeoTable title="Top 10 Requetes" rows={data.topQueries} labelKey="query" />
            </div>
          </main>
        )}
      </div>
    </>
  );
}

function formatNum(n) {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("fr-FR");
}

function KpiCard({ label, value, color }) {
  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20,
    }}>
      <div style={{
        fontSize: 12, fontWeight: 500, color: C.muted,
        textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8,
      }}>{label}</div>
      <div style={{ fontSize: 32, fontWeight: 700, letterSpacing: -1, color: color || C.text }}>{value}</div>
    </div>
  );
}

function SeoTable({ title, rows, labelKey }) {
  if (!rows || rows.length === 0) {
    return (
      <div style={{
        background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24,
      }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: C.muted, marginBottom: 12 }}>{title}</div>
        <div style={{ color: C.muted, fontSize: 13, textAlign: "center", padding: "32px 0" }}>
          Aucune donnee — le cron GSC doit d'abord s'executer
        </div>
      </div>
    );
  }

  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24,
    }}>
      <div style={{
        fontSize: 15, fontWeight: 600, color: C.muted, marginBottom: 12,
        paddingBottom: 8, borderBottom: `1px solid ${C.border}`,
      }}>{title}</div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${C.border}` }}>
              <th style={{ padding: "8px", textAlign: "left", color: C.muted, fontWeight: 500 }}>#</th>
              <th style={{ padding: "8px", textAlign: "left", color: C.muted, fontWeight: 500 }}>
                {labelKey === "page" ? "Page" : "Requete"}
              </th>
              <th style={{ padding: "8px", textAlign: "right", color: C.muted, fontWeight: 500 }}>Clicks</th>
              <th style={{ padding: "8px", textAlign: "right", color: C.muted, fontWeight: 500 }}>Impressions</th>
              <th style={{ padding: "8px", textAlign: "right", color: C.muted, fontWeight: 500 }}>Position</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const label = row[labelKey] || "—";
              const displayLabel = labelKey === "page"
                ? label.replace(/^https?:\/\/[^/]+/, "")
                : label;
              return (
                <tr key={i} style={{ borderBottom: `1px solid rgba(30,41,59,0.3)` }}>
                  <td style={{ padding: "8px", color: C.muted, fontFamily: "monospace" }}>{i + 1}</td>
                  <td style={{
                    padding: "8px", maxWidth: 300, overflow: "hidden",
                    textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }} title={label}>
                    {displayLabel}
                  </td>
                  <td style={{ padding: "8px", textAlign: "right", fontFamily: "monospace", color: C.accent, fontWeight: 600 }}>
                    {formatNum(row.total_clicks)}
                  </td>
                  <td style={{ padding: "8px", textAlign: "right", fontFamily: "monospace", color: C.sub }}>
                    {formatNum(row.total_impressions)}
                  </td>
                  <td style={{ padding: "8px", textAlign: "right", fontFamily: "monospace", color: posColor(row.avg_position) }}>
                    {parseFloat(row.avg_position).toFixed(1)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function posColor(pos) {
  const p = parseFloat(pos);
  if (p <= 3) return C.green;
  if (p <= 10) return C.yellow;
  return C.red;
}
