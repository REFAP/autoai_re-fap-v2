// /pages/admin/cc-ventes.js
// Dashboard Carter-Cash — Ventes, Marges, Exercice

import { useState, useEffect, useCallback, Fragment } from "react";
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
  purple: "#8b5cf6",
  muted: "#64748b",
  text: "#e2e8f0",
  sub: "#94a3b8",
};

const COLORS = {
  "801": "#f97316",
  "065": "#ef4444",
  "003": "#3b82f6",
  "006": "#8b5cf6",
  autres: "#6b7280",
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

const CENTRE_CODES = ["801", "065", "003", "006", "autres"];
const MONTH_LABELS = {
  "2025-10": "Oct 25",
  "2025-11": "Nov 25",
  "2025-12": "Dec 25",
  "2026-01": "Jan 26",
  "2026-02": "Fev 26",
};

const fmt = (n) => (n != null ? Number(n).toLocaleString("fr-FR") : "\u2014");

const thStyle = { padding: 8, textAlign: "left", color: "#64748b", fontWeight: 500 };
const tdStyle = { padding: "6px 8px", fontSize: 13 };
const tdMono = { padding: "6px 8px", textAlign: "right", fontFamily: "monospace", fontSize: 13, color: "#e2e8f0" };

export default function CCVentesDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const getToken = () =>
    TOKEN || (typeof window !== "undefined" ? localStorage.getItem("fapexpert_admin_token") || "" : "");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch(`/api/admin/cc-stats?token=${encodeURIComponent(getToken())}`);
      if (!resp.ok) throw new Error((await resp.json().catch(() => ({}))).error || `Erreur ${resp.status}`);
      setData(await resp.json());
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Derived data
  const months = data ? [...new Set(data.ventes.map((v) => v.mois))].sort() : [];
  const centresMap = {};
  if (data) for (const c of data.centres) centresMap[c.code] = c;

  // Build FAP table: { mois -> { code -> nb_fap } }
  const fapByMonth = {};
  const caByMonth = {};
  const partielByMonth = {};
  if (data) {
    for (const v of data.ventes) {
      if (!fapByMonth[v.mois]) fapByMonth[v.mois] = {};
      if (!caByMonth[v.mois]) caByMonth[v.mois] = {};
      if (v.code_centre === "total") {
        caByMonth[v.mois]._total = Number(v.ca_ht) || 0;
      } else {
        fapByMonth[v.mois][v.code_centre] = v.nb_fap;
      }
      if (v.partiel) partielByMonth[v.mois] = true;
    }
  }

  // Build marges: { mois -> { code -> { mb, loyer, mn } } }
  const margesByMonth = {};
  if (data) {
    for (const m of data.marges) {
      if (!margesByMonth[m.mois]) margesByMonth[m.mois] = {};
      margesByMonth[m.mois][m.code_centre] = {
        mb: m.marge_brute,
        loyer: m.loyer_prorate,
        mn: m.marge_brute - m.loyer_prorate,
      };
    }
  }

  // KPIs
  const totalFapExercice = data
    ? data.ventes.filter((v) => v.code_centre !== "total").reduce((s, v) => s + v.nb_fap, 0)
    : 0;
  const totalCA = data
    ? data.ventes.filter((v) => v.code_centre === "total").reduce((s, v) => s + (Number(v.ca_ht) || 0), 0)
    : 0;
  const totalMNExercice = data
    ? data.exercice.reduce((s, e) => s + (e.marge_brute_exercice - e.loyer_cumule), 0)
    : 0;
  const nbCentres = data ? data.centres.length : 0;

  // Cumulative MN parc by month
  const mnCumByMonth = [];
  if (data) {
    let cum = 0;
    for (const mois of months) {
      const md = margesByMonth[mois] || {};
      let monthMN = 0;
      for (const code of CENTRE_CODES) if (md[code]) monthMN += md[code].mn;
      cum += monthMN;
      mnCumByMonth.push({ mois, mn: monthMN, cum });
    }
  }

  const partielBadge = (
    <span style={{ marginLeft: 6, fontSize: 10, background: C.yellow, color: "#000", padding: "1px 5px", borderRadius: 3, fontWeight: 600 }}>
      partiel
    </span>
  );

  return (
    <>
      <Head><title>CC Ventes — Re-FAP</title></Head>
      <div style={{ minHeight: "100vh", background: C.bg, fontFamily: "'DM Sans', system-ui, sans-serif", color: C.text }}>

        {/* Header */}
        <header style={{
          background: C.surface, borderBottom: `1px solid ${C.border}`,
          padding: "16px 32px", display: "flex", alignItems: "center", justifyContent: "space-between",
          position: "sticky", top: 0, zIndex: 100,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 36, height: 36, background: C.orange, borderRadius: 8,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontWeight: 700, fontSize: 14, color: "#000",
            }}>CC</div>
            <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Carter-Cash Ventes</h1>
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
              color: item.href === "/admin/cc-ventes" ? C.text : C.muted,
              borderBottom: item.href === "/admin/cc-ventes" ? `2px solid ${C.orange}` : "2px solid transparent",
            }}>{item.label}</Link>
          ))}
        </nav>

        {/* Loading */}
        {loading && !data && (
          <div style={{ textAlign: "center", padding: 80, color: C.muted }}>Chargement des donnees Carter-Cash...</div>
        )}

        {/* Error */}
        {error && !data && (
          <div style={{ textAlign: "center", padding: 80 }}>
            <div style={{ color: C.red, marginBottom: 16 }}>{error}</div>
            <button onClick={fetchData} style={{
              background: C.orange, color: "#000", border: "none",
              padding: "10px 24px", borderRadius: 8, fontWeight: 600, cursor: "pointer",
            }}>Reessayer</button>
          </div>
        )}

        {/* Content */}
        {data && (
          <main style={{ maxWidth: 1400, margin: "0 auto", padding: "24px 32px" }}>

            {/* ═══════ KPIs ═══════ */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 32 }}>
              <KPICard title="FAP exercice" value={fmt(totalFapExercice)} color={C.orange} sub="Oct 25 - Fev 26" />
              <KPICard title="CA cumule HT" value={`${fmt(Math.round(totalCA))}\u20AC`} color={C.blue} sub="5 mois" />
              <KPICard title="MN exercice parc" value={`${totalMNExercice >= 0 ? "+" : ""}${fmt(totalMNExercice)}\u20AC`} color={totalMNExercice >= 0 ? C.green : C.red} sub="MB - Loyers (PDF officiel)" />
              <KPICard title="Centres equipes" value={nbCentres} color={C.purple} sub="actifs" />
            </div>

            {/* ═══════ CENTRES ═══════ */}
            <SectionTitle title="Centres equipes" />
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24, marginBottom: 32, overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                    <th style={thStyle}>Code</th>
                    <th style={thStyle}>Ville</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>Loyer/mois</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>Installation</th>
                    <th style={{ ...thStyle, textAlign: "center" }}>Contrat</th>
                  </tr>
                </thead>
                <tbody>
                  {data.centres.map(c => (
                    <tr key={c.code} style={{ borderBottom: `1px solid ${C.border}20` }}>
                      <td style={tdStyle}>
                        <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: COLORS[c.code] || C.muted, marginRight: 8 }} />
                        {c.code}
                      </td>
                      <td style={tdStyle}>{c.nom}</td>
                      <td style={{ ...tdMono }}>{fmt(c.loyer_mensuel)}&euro;</td>
                      <td style={{ ...tdMono }}>{new Date(c.date_installation).toLocaleDateString("fr-FR")}</td>
                      <td style={{ ...tdStyle, textAlign: "center" }}>
                        <span style={{ background: "#1a2234", padding: "2px 8px", borderRadius: 4, fontSize: 11 }}>{c.annee_contrat}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* ═══════ FAP MENSUELS PAR CENTRE ═══════ */}
            <SectionTitle title="FAP mensuels par centre" />
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24, marginBottom: 32, overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                    <th style={thStyle}>Mois</th>
                    {CENTRE_CODES.map(code => (
                      <th key={code} style={{ ...thStyle, textAlign: "right", color: COLORS[code] }}>{code}</th>
                    ))}
                    <th style={{ ...thStyle, textAlign: "right" }}>Total</th>
                    <th style={{ ...thStyle, textAlign: "right", color: C.blue }}>CA HT</th>
                  </tr>
                </thead>
                <tbody>
                  {months.map(mois => {
                    const fap = fapByMonth[mois] || {};
                    const rowTotal = CENTRE_CODES.reduce((s, c) => s + (fap[c] || 0), 0);
                    return (
                      <tr key={mois} style={{ borderBottom: `1px solid ${C.border}20` }}>
                        <td style={tdStyle}>
                          {MONTH_LABELS[mois] || mois}
                          {partielByMonth[mois] && partielBadge}
                        </td>
                        {CENTRE_CODES.map(code => (
                          <td key={code} style={{ ...tdMono, color: fap[code] > 0 ? COLORS[code] : C.muted }}>{fap[code] || 0}</td>
                        ))}
                        <td style={{ ...tdMono, fontWeight: 700 }}>{rowTotal}</td>
                        <td style={{ ...tdMono, color: C.blue }}>{caByMonth[mois]?._total ? `${fmt(caByMonth[mois]._total)}\u20AC` : "\u2014"}</td>
                      </tr>
                    );
                  })}
                  <tr style={{ borderTop: `2px solid ${C.border}` }}>
                    <td style={{ ...tdStyle, fontWeight: 700 }}>Total</td>
                    {CENTRE_CODES.map(code => {
                      const total = months.reduce((s, m) => s + ((fapByMonth[m] || {})[code] || 0), 0);
                      return <td key={code} style={{ ...tdMono, fontWeight: 700, color: COLORS[code] }}>{total}</td>;
                    })}
                    <td style={{ ...tdMono, fontWeight: 700 }}>
                      {months.reduce((s, m) => s + CENTRE_CODES.reduce((s2, c) => s2 + ((fapByMonth[m] || {})[c] || 0), 0), 0)}
                    </td>
                    <td style={{ ...tdMono, fontWeight: 700, color: C.blue }}>{fmt(Math.round(totalCA))}&euro;</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* ═══════ GRAPHIQUE BARRES FAP/MOIS ═══════ */}
            <SectionTitle title="FAP par mois et par centre" />
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24, marginBottom: 32 }}>
              {(() => {
                const W = 900, H = 280;
                const PAD = { top: 20, right: 20, bottom: 40, left: 50 };
                const plotW = W - PAD.left - PAD.right;
                const plotH = H - PAD.top - PAD.bottom;
                const groupW = plotW / months.length;
                const barW = Math.min(16, (groupW - 8) / CENTRE_CODES.length);
                let maxVal = 0;
                for (const mois of months)
                  for (const code of CENTRE_CODES) {
                    const v = (fapByMonth[mois] || {})[code] || 0;
                    if (v > maxVal) maxVal = v;
                  }
                maxVal = Math.max(maxVal, 10);

                return (
                  <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }}>
                    {[0, 0.25, 0.5, 0.75, 1].map(pct => {
                      const y = PAD.top + plotH * (1 - pct);
                      return (
                        <g key={pct}>
                          <line x1={PAD.left} y1={y} x2={W - PAD.right} y2={y} stroke={C.border} strokeWidth={0.5} />
                          <text x={PAD.left - 6} y={y + 4} textAnchor="end" fill={C.muted} fontSize={10} fontFamily="monospace">{Math.round(maxVal * pct)}</text>
                        </g>
                      );
                    })}
                    {months.map((mois, mi) => {
                      const gx = PAD.left + mi * groupW + groupW / 2 - (CENTRE_CODES.length * barW) / 2;
                      return (
                        <g key={mois}>
                          {CENTRE_CODES.map((code, ci) => {
                            const val = (fapByMonth[mois] || {})[code] || 0;
                            const barH = (val / maxVal) * plotH;
                            const x = gx + ci * barW;
                            const y = PAD.top + plotH - barH;
                            return (
                              <g key={code}>
                                <rect x={x} y={y} width={barW - 1} height={barH} fill={COLORS[code]} opacity={0.85} rx={2} />
                                {val > 0 && (
                                  <text x={x + (barW - 1) / 2} y={y - 3} textAnchor="middle" fill={COLORS[code]} fontSize={8} fontFamily="monospace" fontWeight={600}>{val}</text>
                                )}
                              </g>
                            );
                          })}
                          <text x={PAD.left + mi * groupW + groupW / 2} y={H - 8} textAnchor="middle" fill={C.muted} fontSize={10} fontFamily="monospace">{MONTH_LABELS[mois] || mois}</text>
                        </g>
                      );
                    })}
                  </svg>
                );
              })()}
              <div style={{ display: "flex", gap: 16, justifyContent: "center", marginTop: 12 }}>
                {CENTRE_CODES.map(code => (
                  <div key={code} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 2, background: COLORS[code], display: "inline-block" }} />
                    <span style={{ color: C.sub }}>{code === "autres" ? "Autres" : `${code} ${centresMap[code]?.nom || ""}`}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* ═══════ MARGES NETTES MENSUELLES ═══════ */}
            <SectionTitle title="Marges mensuelles par centre (MB / Loyer / MN)" />
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24, marginBottom: 32, overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                    <th style={thStyle} rowSpan={2}>Mois</th>
                    {CENTRE_CODES.map(code => (
                      <th key={code} colSpan={3} style={{ ...thStyle, textAlign: "center", color: COLORS[code], borderLeft: `1px solid ${C.border}40` }}>{code}</th>
                    ))}
                    <th style={{ ...thStyle, textAlign: "right", borderLeft: `1px solid ${C.border}` }} rowSpan={2}>MN Parc</th>
                  </tr>
                  <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                    {CENTRE_CODES.map(code => (
                      <Fragment key={code}>
                        <th style={{ ...thStyle, fontSize: 10, textAlign: "right", borderLeft: `1px solid ${C.border}40` }}>MB</th>
                        <th style={{ ...thStyle, fontSize: 10, textAlign: "right" }}>Loyer</th>
                        <th style={{ ...thStyle, fontSize: 10, textAlign: "right" }}>MN</th>
                      </Fragment>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {months.map(mois => {
                    const md = margesByMonth[mois] || {};
                    let parcMN = 0;
                    for (const code of CENTRE_CODES) if (md[code]) parcMN += md[code].mn;
                    return (
                      <tr key={mois} style={{ borderBottom: `1px solid ${C.border}20` }}>
                        <td style={tdStyle}>
                          {MONTH_LABELS[mois] || mois}
                          {partielByMonth[mois] && partielBadge}
                        </td>
                        {CENTRE_CODES.map(code => {
                          const d = md[code] || { mb: 0, loyer: 0, mn: 0 };
                          const active = d.mb > 0 || d.loyer > 0;
                          return (
                            <Fragment key={code}>
                              <td style={{ ...tdMono, fontSize: 11, borderLeft: `1px solid ${C.border}40` }}>{active ? fmt(d.mb) : "\u2014"}</td>
                              <td style={{ ...tdMono, fontSize: 11 }}>{active ? fmt(d.loyer) : "\u2014"}</td>
                              <td style={{ ...tdMono, fontSize: 11, color: d.mn > 0 ? C.green : d.mn < 0 ? C.red : C.muted, fontWeight: 600 }}>
                                {active ? `${d.mn >= 0 ? "+" : ""}${fmt(d.mn)}` : "\u2014"}
                              </td>
                            </Fragment>
                          );
                        })}
                        <td style={{ ...tdMono, fontWeight: 700, borderLeft: `1px solid ${C.border}`, color: parcMN >= 0 ? C.green : C.red }}>
                          {parcMN >= 0 ? "+" : ""}{fmt(parcMN)}&euro;
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* ═══════ EXERCICE OFFICIEL ═══════ */}
            <SectionTitle title="Bilan exercice officiel (source PDF 19/02/2026)" />
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24, marginBottom: 32, overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                    <th style={thStyle}>Centre</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>MB exercice</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>Loyers cumules</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>MN exercice</th>
                  </tr>
                </thead>
                <tbody>
                  {data.exercice.map(e => {
                    const mn = e.marge_brute_exercice - e.loyer_cumule;
                    return (
                      <tr key={e.code_centre} style={{ borderBottom: `1px solid ${C.border}20` }}>
                        <td style={tdStyle}>
                          <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: COLORS[e.code_centre] || C.muted, marginRight: 8 }} />
                          {e.code_centre === "autres" ? "Autres centres" : `${e.code_centre} ${centresMap[e.code_centre]?.nom || ""}`}
                        </td>
                        <td style={tdMono}>{fmt(e.marge_brute_exercice)}&euro;</td>
                        <td style={tdMono}>{e.loyer_cumule > 0 ? `${fmt(e.loyer_cumule)}\u20AC` : "\u2014"}</td>
                        <td style={{ ...tdMono, color: mn >= 0 ? C.green : C.red, fontWeight: 700 }}>
                          {mn >= 0 ? "+" : ""}{fmt(mn)}&euro;
                        </td>
                      </tr>
                    );
                  })}
                  <tr style={{ borderTop: `2px solid ${C.border}` }}>
                    <td style={{ ...tdStyle, fontWeight: 700 }}>Total</td>
                    <td style={{ ...tdMono, fontWeight: 700 }}>{fmt(data.exercice.reduce((s, e) => s + e.marge_brute_exercice, 0))}&euro;</td>
                    <td style={{ ...tdMono, fontWeight: 700 }}>{fmt(data.exercice.reduce((s, e) => s + e.loyer_cumule, 0))}&euro;</td>
                    <td style={{ ...tdMono, fontWeight: 700, color: totalMNExercice >= 0 ? C.green : C.red }}>
                      {totalMNExercice >= 0 ? "+" : ""}{fmt(totalMNExercice)}&euro;
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* ═══════ GRAPHIQUE MN CUMULÉE ═══════ */}
            <SectionTitle title="Marge nette cumulee parc" />
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24, marginBottom: 32 }}>
              {mnCumByMonth.length > 1 && (() => {
                const W = 900, H = 260;
                const PAD = { top: 30, right: 20, bottom: 40, left: 70 };
                const plotW = W - PAD.left - PAD.right;
                const plotH = H - PAD.top - PAD.bottom;
                const maxVal = Math.max(1, ...mnCumByMonth.map(r => r.cum));
                const minVal = Math.min(0, ...mnCumByMonth.map(r => r.cum));
                const range = maxVal - minVal || 1;
                const toY = (v) => PAD.top + plotH * (1 - (v - minVal) / range);

                const points = mnCumByMonth.map((r, i) => {
                  const x = PAD.left + (i / (mnCumByMonth.length - 1)) * plotW;
                  return `${x},${toY(r.cum)}`;
                }).join(" ");

                return (
                  <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }}>
                    {[0, 0.25, 0.5, 0.75, 1].map(pct => {
                      const val = minVal + range * pct;
                      const y = toY(val);
                      return (
                        <g key={pct}>
                          <line x1={PAD.left} y1={y} x2={W - PAD.right} y2={y} stroke={C.border} strokeWidth={0.5} />
                          <text x={PAD.left - 6} y={y + 4} textAnchor="end" fill={C.muted} fontSize={10} fontFamily="monospace">{fmt(Math.round(val))}</text>
                        </g>
                      );
                    })}
                    {minVal < 0 && (
                      <line x1={PAD.left} y1={toY(0)} x2={W - PAD.right} y2={toY(0)} stroke={C.muted} strokeWidth={1} strokeDasharray="4,4" />
                    )}
                    <polygon points={`${PAD.left},${toY(0)} ${points} ${PAD.left + plotW},${toY(0)}`} fill={C.green} opacity={0.1} />
                    <polyline points={points} fill="none" stroke={C.green} strokeWidth={2.5} strokeLinejoin="round" />
                    {mnCumByMonth.map((r, i) => {
                      const x = PAD.left + (i / (mnCumByMonth.length - 1)) * plotW;
                      const y = toY(r.cum);
                      return (
                        <g key={r.mois}>
                          <circle cx={x} cy={y} r={4} fill={C.green} />
                          <text x={x} y={y - 10} textAnchor="middle" fill={C.green} fontSize={11} fontWeight={600} fontFamily="monospace">
                            {r.cum >= 0 ? "+" : ""}{fmt(r.cum)}
                          </text>
                          <text x={x} y={H - 8} textAnchor="middle" fill={C.muted} fontSize={10} fontFamily="monospace">{MONTH_LABELS[r.mois] || r.mois}</text>
                        </g>
                      );
                    })}
                  </svg>
                );
              })()}
            </div>

            {/* ═══════ SNAPSHOTS JOURNALIERS ═══════ */}
            <SectionTitle title="Snapshots journaliers" />
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24, marginBottom: 32, overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                    <th style={thStyle}>Date</th>
                    <th style={{ ...thStyle, textAlign: "right", color: COLORS["801"] }}>801</th>
                    <th style={{ ...thStyle, textAlign: "right", color: COLORS["065"] }}>065</th>
                    <th style={{ ...thStyle, textAlign: "right", color: COLORS["003"] }}>003</th>
                    <th style={{ ...thStyle, textAlign: "right", color: COLORS["006"] }}>006</th>
                    <th style={{ ...thStyle, textAlign: "right", color: COLORS.autres }}>Autres</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>Total</th>
                    <th style={{ ...thStyle, textAlign: "right", color: C.blue }}>CA HT</th>
                  </tr>
                </thead>
                <tbody>
                  {data.snapshots.map(s => {
                    const total = (s.n801 || 0) + (s.n065 || 0) + (s.n003 || 0) + (s.n006 || 0) + (s.autres || 0);
                    return (
                      <tr key={s.date_snapshot} style={{ borderBottom: `1px solid ${C.border}20` }}>
                        <td style={tdStyle}>{new Date(s.date_snapshot).toLocaleDateString("fr-FR")}</td>
                        <td style={{ ...tdMono, color: s.n801 > 0 ? COLORS["801"] : C.muted }}>{s.n801 || 0}</td>
                        <td style={{ ...tdMono, color: s.n065 > 0 ? COLORS["065"] : C.muted }}>{s.n065 || 0}</td>
                        <td style={{ ...tdMono, color: s.n003 > 0 ? COLORS["003"] : C.muted }}>{s.n003 || 0}</td>
                        <td style={{ ...tdMono, color: s.n006 > 0 ? COLORS["006"] : C.muted }}>{s.n006 || 0}</td>
                        <td style={{ ...tdMono, color: s.autres > 0 ? COLORS.autres : C.muted }}>{s.autres || 0}</td>
                        <td style={{ ...tdMono, fontWeight: 600 }}>{total}</td>
                        <td style={{ ...tdMono, color: C.blue }}>{Number(s.ca_ht) > 0 ? `${fmt(Number(s.ca_ht))}\u20AC` : "\u2014"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div style={{ textAlign: "center", fontSize: 11, color: C.muted, marginTop: 24 }}>
              Re-FAP — Carter-Cash Ventes v1.0
            </div>
          </main>
        )}
      </div>
    </>
  );
}

function KPICard({ title, value, color, sub }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20 }}>
      <div style={{ fontSize: 12, fontWeight: 500, color: C.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 36, fontWeight: 700, letterSpacing: -1, color: color || C.text }}>{value}</div>
      {sub && <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function SectionTitle({ title }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, color: C.sub, textTransform: "uppercase", letterSpacing: 2, marginBottom: 16, paddingBottom: 8, borderBottom: `1px solid ${C.border}` }}>
      {title}
    </div>
  );
}
