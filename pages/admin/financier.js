// /pages/admin/financier.js
import { useState, useEffect, useCallback } from "react";
import Head from "next/head";
import Link from "next/link";

const TOKEN = process.env.NEXT_PUBLIC_ADMIN_TOKEN || "";

const C = {
  bg: "#0a0e17", surface: "#111827", border: "#1e293b",
  green: "#22c55e", blue: "#3b82f6", yellow: "#f59e0b",
  red: "#ef4444", orange: "#f97316", muted: "#64748b",
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

const CENTRES = {
  "801": { label: "Thiais (94)", color: "#f97316" },
  "065": { label: "Lambres (59)", color: "#ef4444" },
  "003": { label: "Villeneuve d'Ascq (59)", color: "#3b82f6" },
  "006": { label: "Sarcelles (95)", color: "#8b5cf6" },
  "autres": { label: "Autres CC", color: "#6b7280" },
};

const MOIS_ORDER = ["2025-10","2025-11","2025-12","2026-01","2026-02"];
const MOIS_LABEL = {
  "2025-10":"10/25","2025-11":"11/25","2025-12":"12/25",
  "2026-01":"01/26","2026-02":"02/26",
};

const fmt = (v) => {
  if (!v && v !== 0) return "–";
  if (v === 0) return "–";
  return Number(v).toLocaleString("fr-FR") + "€";
};

const fmtSign = (v) => {
  if (v === null || v === undefined) return "–";
  return (v >= 0 ? "+" : "") + Number(v).toLocaleString("fr-FR") + "€";
};

const thStyle = { padding: "8px 12px", textAlign: "right", color: "#64748b", fontWeight: 500, fontSize: 11, textTransform: "uppercase", borderBottom: "1px solid #1e293b" };
const thL = { ...thStyle, textAlign: "left" };
const td = { padding: "8px 12px", textAlign: "right", borderBottom: "1px solid #0a162833", fontFamily: "monospace", fontSize: 12 };
const tdL = { ...td, textAlign: "left", fontFamily: "system-ui", fontWeight: 600 };
const tdTot = { ...td, borderTop: "2px solid #1e293b", borderBottom: "none", fontWeight: 700 };
const tdTotL = { ...tdTot, textAlign: "left", fontFamily: "system-ui" };

export default function Financier() {
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

  // Maps
  const fapMap = {};
  const caMap = {};
  const mbMap = {};

  if (data) {
    data.ventes.forEach((r) => {
      if (r.code_centre === "total") { caMap[r.mois] = Number(r.ca_ht) || 0; return; }
      if (!fapMap[r.code_centre]) fapMap[r.code_centre] = {};
      fapMap[r.code_centre][r.mois] = r.nb_fap;
    });
    data.marges.forEach((r) => {
      if (!mbMap[r.code_centre]) mbMap[r.code_centre] = {};
      mbMap[r.code_centre][r.mois] = Number(r.marge_brute) || 0;
    });
  }

  const mbTotaux = {};
  MOIS_ORDER.forEach((m) => {
    mbTotaux[m] = Object.keys(CENTRES).reduce((a, c) => a + (mbMap[c]?.[m] || 0), 0);
  });

  const caTotalExercice = MOIS_ORDER.reduce((a, m) => a + (caMap[m] || 0), 0);
  const mbTotalExercice = MOIS_ORDER.reduce((a, m) => a + mbTotaux[m], 0);
  const totalMNExercice = data ? data.exercice.reduce((s, e) => s + (e.marge_brute_exercice - e.loyer_cumule), 0) : 0;

  let cumul = 0;
  const margeCumulee = MOIS_ORDER.map((m) => {
    cumul += mbTotaux[m];
    return { mois: m, cumul, mensuel: mbTotaux[m] };
  });

  const dot = (color) => (
    <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: color, marginRight: 8 }} />
  );

  return (
    <>
      <Head><title>Financier — Re-FAP Dashboard</title></Head>
      <div style={{ background: C.bg, minHeight: "100vh", color: C.text, fontFamily: "system-ui, sans-serif" }}>

        {/* NAV */}
        <nav style={{ display: "flex", gap: 4, padding: "12px 24px", background: C.surface, borderBottom: `1px solid ${C.border}`, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontWeight: 700, fontSize: 14, marginRight: 8 }}>RE</span>
          <span style={{ fontSize: 14, fontWeight: 700, marginRight: 24 }}>Financier</span>
          {NAV_ITEMS.map((n) => (
            <Link key={n.href} href={n.href} style={{
              padding: "6px 14px", borderRadius: 6, fontSize: 13,
              fontWeight: n.href === "/admin/financier" ? 600 : 400,
              color: n.href === "/admin/financier" ? C.text : C.muted,
              background: n.href === "/admin/financier" ? C.border : "transparent",
              textDecoration: "none",
            }}>{n.label}</Link>
          ))}
          <button onClick={fetchData} disabled={loading} style={{ marginLeft: "auto", background: C.border, border: "none", color: C.text, borderRadius: 6, padding: "6px 14px", cursor: "pointer", fontSize: 12 }}>
            {loading ? "..." : "Rafraîchir"}
          </button>
        </nav>

        <div style={{ padding: 24, maxWidth: 1400, margin: "0 auto" }}>

          {loading && <div style={{ color: C.muted, padding: 60, textAlign: "center" }}>Chargement...</div>}
          {error && <div style={{ color: C.red, padding: 20, background: C.surface, borderRadius: 8, marginTop: 24 }}>Erreur : {error}</div>}

          {!loading && !error && data && (
            <>
              {/* KPIs */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 28 }}>
                {[
                  { label: "CA Cumulé HT", value: fmt(caTotalExercice), color: C.green, sub: "Oct 2025 – Fév 2026" },
                  { label: "Marge Brute Exercice", value: fmt(mbTotalExercice), color: C.orange, sub: "Tous centres" },
                  { label: "MN Exercice Parc", value: fmtSign(totalMNExercice), color: totalMNExercice >= 0 ? C.green : C.red, sub: "MB – Loyers PDF officiel" },
                ].map((k) => (
                  <div key={k.label} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: 20, borderLeft: `3px solid ${k.color}` }}>
                    <div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>{k.label}</div>
                    <div style={{ fontSize: 26, fontWeight: 700, fontFamily: "monospace", color: k.color }}>{k.value}</div>
                    <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>{k.sub}</div>
                  </div>
                ))}
              </div>

              {/* CA MENSUEL */}
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", color: C.muted, textTransform: "uppercase", marginBottom: 12 }}>CA Mensuel par Centre (HT)</div>
              <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: 20, marginBottom: 28, overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th style={thL}>Centre</th>
                      {MOIS_ORDER.map((m) => <th key={m} style={thStyle}>{MOIS_LABEL[m]}</th>)}
                      <th style={{ ...thStyle, color: C.orange }}>Total FAP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.keys(CENTRES).map((code) => {
                      const total = MOIS_ORDER.reduce((a, m) => a + (fapMap[code]?.[m] || 0), 0);
                      return (
                        <tr key={code}>
                          <td style={tdL}>{dot(CENTRES[code].color)}{CENTRES[code].label}</td>
                          {MOIS_ORDER.map((m) => (
                            <td key={m} style={{ ...td, color: fapMap[code]?.[m] > 0 ? C.text : C.muted }}>
                              {fapMap[code]?.[m] > 0 ? `${fapMap[code][m]} FAP` : "–"}
                            </td>
                          ))}
                          <td style={{ ...td, fontWeight: 700 }}>{total > 0 ? `${total} FAP` : "–"}</td>
                        </tr>
                      );
                    })}
                    <tr>
                      <td style={tdTotL}>CA HT Global</td>
                      {MOIS_ORDER.map((m) => <td key={m} style={{ ...tdTot, color: C.green }}>{fmt(caMap[m])}</td>)}
                      <td style={{ ...tdTot, color: C.orange }}>{fmt(caTotalExercice)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* MARGE MENSUELLE */}
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", color: C.muted, textTransform: "uppercase", marginBottom: 12 }}>Marge Mensuelle par Centre</div>
              <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: 20, marginBottom: 28, overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th style={thL}>Centre</th>
                      {MOIS_ORDER.map((m) => <th key={m} style={thStyle}>{MOIS_LABEL[m]}</th>)}
                      <th style={{ ...thStyle, color: C.green }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.keys(CENTRES).map((code) => {
                      const total = MOIS_ORDER.reduce((a, m) => a + (mbMap[code]?.[m] || 0), 0);
                      return (
                        <tr key={code}>
                          <td style={tdL}>{dot(CENTRES[code].color)}{CENTRES[code].label}</td>
                          {MOIS_ORDER.map((m) => (
                            <td key={m} style={{ ...td, color: mbMap[code]?.[m] > 0 ? C.green : C.muted }}>
                              {fmt(mbMap[code]?.[m])}
                            </td>
                          ))}
                          <td style={{ ...td, fontWeight: 700, color: total > 0 ? C.green : C.muted }}>{fmt(total)}</td>
                        </tr>
                      );
                    })}
                    <tr>
                      <td style={tdTotL}>Total</td>
                      {MOIS_ORDER.map((m) => <td key={m} style={{ ...tdTot, color: C.green }}>{fmt(mbTotaux[m])}</td>)}
                      <td style={{ ...tdTot, color: C.orange }}>{fmt(mbTotalExercice)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* MARGE CUMULÉE */}
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", color: C.muted, textTransform: "uppercase", marginBottom: 12 }}>Marge Cumulée</div>
              <div style={{ display: "flex", gap: 12, marginBottom: 28 }}>
                {margeCumulee.map((mc) => (
                  <div key={mc.mois} style={{ flex: 1, background: C.surface, border: `1px solid ${mc.cumul >= 0 ? "#22c55e33" : "#ef444433"}`, borderRadius: 10, padding: "16px 20px" }}>
                    <div style={{ fontSize: 11, color: C.muted, marginBottom: 8 }}>{MOIS_LABEL[mc.mois]}</div>
                    <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "monospace", color: mc.cumul >= 0 ? C.green : C.red }}>{fmtSign(mc.cumul)}</div>
                    <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>{fmtSign(mc.mensuel)} ce mois</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
