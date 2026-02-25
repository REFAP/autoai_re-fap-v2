// /pages/admin/financier.js
// Dashboard Financier Re-FAP — CA mensuel, marge mensuelle, marge cumulee
// Source: Supabase tables prestations_weekly + centres

import { useState, useEffect, useCallback } from "react";
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
  orange: "#f97316",
  muted: "#64748b",
  text: "#e2e8f0",
  sub: "#94a3b8",
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

const CENTRES = {
  '801': 'Thiais (94)',
  '065': 'Lambres (59)',
  '003': "Villeneuve d'Ascq (59)",
  '006': 'Sarcelles (95)',
  'autres': 'Autres CC',
};

const fmt = (n) => n != null ? Number(n).toLocaleString("fr-FR") : "\u2014";

export default function FinancierDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const getToken = () => TOKEN || (typeof window !== "undefined" ? localStorage.getItem("fapexpert_admin_token") || "" : "");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch(`/api/admin/analytics-data?type=financier&token=${encodeURIComponent(getToken())}`);
      if (!resp.ok) throw new Error((await resp.json().catch(() => ({}))).error || `Erreur ${resp.status}`);
      setData(await resp.json());
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <>
      <Head><title>Financier — Re-FAP</title></Head>
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
            <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Financier</h1>
          </div>
          <button onClick={fetchData} disabled={loading} style={{
            background: "#1a2234", border: `1px solid ${C.border}`, color: C.text,
            padding: "8px 16px", borderRadius: 8, cursor: loading ? "wait" : "pointer",
            fontFamily: "inherit", fontSize: 13,
          }}>{loading ? "..." : "Rafraichir"}</button>
        </header>

        {/* Nav */}
        <nav style={{ background: "#0f1523", borderBottom: `1px solid ${C.border}`, padding: "0 32px", display: "flex", gap: 0 }}>
          {NAV_ITEMS.map(item => (
            <Link key={item.href} href={item.href} style={{
              padding: "10px 18px", fontSize: 13, fontWeight: 600, textDecoration: "none",
              color: item.href === "/admin/financier" ? C.text : C.muted,
              borderBottom: item.href === "/admin/financier" ? `2px solid ${C.green}` : "2px solid transparent",
            }}>{item.label}</Link>
          ))}
        </nav>

        {/* Loading */}
        {loading && !data && (
          <div style={{ textAlign: "center", padding: 80, color: C.muted }}>Chargement des donnees financieres...</div>
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

            {/* ═══════ CA MENSUEL PAR CENTRE ═══════ */}
            <SectionTitle title="CA mensuel par centre (HT)" />
            <div style={{
              background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12,
              padding: 24, marginBottom: 32, overflowX: "auto",
            }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                    <th style={{ padding: 8, textAlign: "left", color: C.muted, fontWeight: 500, position: "sticky", left: 0, background: C.surface }}>Centre</th>
                    {data.months.map(m => (
                      <th key={m} style={{ padding: 8, textAlign: "right", color: C.text, fontWeight: 600, minWidth: 90 }}>
                        {m.slice(5)}/{m.slice(2, 4)}
                      </th>
                    ))}
                    <th style={{ padding: 8, textAlign: "right", color: C.orange, fontWeight: 700 }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.centres.map(centre => {
                    let centreTotal = 0;
                    return (
                      <tr key={centre} style={{ borderBottom: `1px solid ${C.border}20` }}>
                        <td style={{ padding: "6px 8px", fontWeight: 500, fontSize: 12, position: "sticky", left: 0, background: C.surface }}>{CENTRES[centre] || centre}</td>
                        {data.caMensuel.map(row => {
                          const val = row[centre] || 0;
                          centreTotal += val;
                          return (
                            <td key={row.month} style={{ padding: "6px 8px", textAlign: "right", fontFamily: "monospace", color: val > 0 ? C.text : C.muted }}>
                              {val > 0 ? `${fmt(val)}€` : "\u2014"}
                            </td>
                          );
                        })}
                        <td style={{ padding: "6px 8px", textAlign: "right", fontFamily: "monospace", color: C.orange, fontWeight: 700 }}>
                          {fmt(Math.round(centreTotal * 100) / 100)}€
                        </td>
                      </tr>
                    );
                  })}
                  <tr style={{ borderTop: `2px solid ${C.border}` }}>
                    <td style={{ padding: 8, fontWeight: 700, color: C.text, position: "sticky", left: 0, background: C.surface }}>Total</td>
                    {data.caMensuel.map(row => (
                      <td key={row.month} style={{ padding: 8, textAlign: "right", fontFamily: "monospace", color: C.text, fontWeight: 700 }}>
                        {fmt(row._total)}€
                      </td>
                    ))}
                    <td style={{ padding: 8, textAlign: "right", fontFamily: "monospace", color: C.orange, fontWeight: 700 }}>
                      {fmt(Math.round(data.caMensuel.reduce((s, r) => s + r._total, 0) * 100) / 100)}€
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* ═══════ MARGE MENSUELLE PAR CENTRE ═══════ */}
            <SectionTitle title="Marge mensuelle par centre" />
            <div style={{
              background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12,
              padding: 24, marginBottom: 32, overflowX: "auto",
            }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                    <th style={{ padding: 8, textAlign: "left", color: C.muted, fontWeight: 500, position: "sticky", left: 0, background: C.surface }}>Centre</th>
                    {data.months.map(m => (
                      <th key={m} style={{ padding: 8, textAlign: "right", color: C.text, fontWeight: 600, minWidth: 90 }}>
                        {m.slice(5)}/{m.slice(2, 4)}
                      </th>
                    ))}
                    <th style={{ padding: 8, textAlign: "right", color: C.green, fontWeight: 700 }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.centres.map(centre => {
                    let centreTotal = 0;
                    return (
                      <tr key={centre} style={{ borderBottom: `1px solid ${C.border}20` }}>
                        <td style={{ padding: "6px 8px", fontWeight: 500, fontSize: 12, position: "sticky", left: 0, background: C.surface }}>{CENTRES[centre] || centre}</td>
                        {data.margeMensuelle.map(row => {
                          const val = row[centre] || 0;
                          centreTotal += val;
                          return (
                            <td key={row.month} style={{ padding: "6px 8px", textAlign: "right", fontFamily: "monospace", color: val > 0 ? C.green : C.muted }}>
                              {val > 0 ? `${fmt(val)}€` : "\u2014"}
                            </td>
                          );
                        })}
                        <td style={{ padding: "6px 8px", textAlign: "right", fontFamily: "monospace", color: C.green, fontWeight: 700 }}>
                          {fmt(Math.round(centreTotal * 100) / 100)}€
                        </td>
                      </tr>
                    );
                  })}
                  <tr style={{ borderTop: `2px solid ${C.border}` }}>
                    <td style={{ padding: 8, fontWeight: 700, color: C.text, position: "sticky", left: 0, background: C.surface }}>Total</td>
                    {data.margeMensuelle.map(row => (
                      <td key={row.month} style={{ padding: 8, textAlign: "right", fontFamily: "monospace", color: C.green, fontWeight: 700 }}>
                        {fmt(row._total)}€
                      </td>
                    ))}
                    <td style={{ padding: 8, textAlign: "right", fontFamily: "monospace", color: C.green, fontWeight: 700 }}>
                      {fmt(Math.round(data.margeMensuelle.reduce((s, r) => s + r._total, 0) * 100) / 100)}€
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* ═══════ MARGE CUMULEE ═══════ */}
            <SectionTitle title="Marge cumulee" />
            <div style={{
              background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12,
              padding: 24, marginBottom: 32,
            }}>
              {/* Cards */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12, marginBottom: 24 }}>
                {data.margeCumulee.map(row => (
                  <div key={row.month} style={{
                    background: "#1a2234", borderRadius: 10, padding: "14px 18px",
                    borderLeft: `3px solid ${C.yellow}`,
                  }}>
                    <div style={{ fontSize: 12, color: C.sub, marginBottom: 4 }}>
                      {row.month.slice(5)}/{row.month.slice(0, 4)}
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: C.yellow, fontFamily: "monospace" }}>
                      {fmt(row.marge_cum)}€
                    </div>
                    <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>
                      +{fmt(row.marge)}€ ce mois
                    </div>
                  </div>
                ))}
              </div>

              {/* Bar chart */}
              {data.margeCumulee.length > 1 && (() => {
                const W = 900, H = 250, PAD = { top: 20, right: 20, bottom: 40, left: 70 };
                const plotW = W - PAD.left - PAD.right;
                const plotH = H - PAD.top - PAD.bottom;
                const maxVal = Math.max(1, ...data.margeCumulee.map(r => r.marge_cum));
                const barW = Math.min(60, plotW / data.margeCumulee.length - 8);

                return (
                  <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }}>
                    {[0, 0.25, 0.5, 0.75, 1].map(pct => {
                      const y = PAD.top + plotH * (1 - pct);
                      return (
                        <g key={pct}>
                          <line x1={PAD.left} y1={y} x2={W - PAD.right} y2={y} stroke={C.border} strokeWidth={0.5} />
                          <text x={PAD.left - 6} y={y + 4} textAnchor="end" fill={C.muted} fontSize={10} fontFamily="monospace">
                            {fmt(Math.round(maxVal * pct))}
                          </text>
                        </g>
                      );
                    })}
                    {data.margeCumulee.map((row, i) => {
                      const x = PAD.left + (i + 0.5) * (plotW / data.margeCumulee.length) - barW / 2;
                      const barH = (row.marge_cum / maxVal) * plotH;
                      const y = PAD.top + plotH - barH;
                      return (
                        <g key={row.month}>
                          <rect x={x} y={y} width={barW} height={barH} fill={C.yellow} opacity={0.85} rx={3} />
                          <text x={x + barW / 2} y={H - 8} textAnchor="middle" fill={C.muted} fontSize={10} fontFamily="monospace">
                            {row.month.slice(5)}/{row.month.slice(2, 4)}
                          </text>
                          <text x={x + barW / 2} y={y - 6} textAnchor="middle" fill={C.yellow} fontSize={10} fontWeight={600} fontFamily="monospace">
                            {fmt(row.marge_cum)}
                          </text>
                        </g>
                      );
                    })}
                  </svg>
                );
              })()}
            </div>

            <div style={{ textAlign: "center", fontSize: 11, color: C.muted, marginTop: 24 }}>
              Re-FAP — Financier v1.0
            </div>
          </main>
        )}
      </div>
    </>
  );
}

function SectionTitle({ title }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 700, color: C.sub, textTransform: "uppercase",
      letterSpacing: 2, marginBottom: 16, paddingBottom: 8,
      borderBottom: `1px solid ${C.border}`,
    }}>{title}</div>
  );
}
