// /pages/admin/financier.js
import { useState, useEffect } from "react";
import Head from "next/head";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

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
  "2026-01":"01/26","2026-02":"02/26"
};

const fmt = (v) => {
  if (v === null || v === undefined || v === 0) return "–";
  return Number(v).toLocaleString("fr-FR") + "€";
};

const fmtSign = (v) => {
  if (!v && v !== 0) return "–";
  const s = Number(v).toLocaleString("fr-FR");
  return (v >= 0 ? "+" : "") + s + "€";
};

export default function Financier() {
  const [ventes, setVentes] = useState([]);
  const [marges, setMarges] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [v, m] = await Promise.all([
        supabase.from("cc_ventes_mensuelles").select("*").order("mois"),
        supabase.from("cc_marges_mensuelles").select("*").order("mois"),
      ]);
      setVentes(v.data || []);
      setMarges(m.data || []);
      setLoading(false);
    }
    load();
  }, []);

  // CA par centre par mois
  const caMap = {};
  ventes.forEach((r) => {
    if (!caMap[r.code_centre]) caMap[r.code_centre] = {};
    // CA global sur ligne 'total', nb_fap sur lignes centres
    if (r.code_centre === "total") {
      caMap["total"] = caMap["total"] || {};
      caMap["total"][r.mois] = r.ca_ht;
    }
  });

  // Marge brute par centre par mois
  const mbMap = {};
  let mbCumul = {};
  marges.forEach((r) => {
    if (!mbMap[r.code_centre]) mbMap[r.code_centre] = {};
    mbMap[r.code_centre][r.mois] = r.marge_brute;
  });

  // FAP par centre par mois
  const fapMap = {};
  ventes.forEach((r) => {
    if (r.code_centre === "total") return;
    if (!fapMap[r.code_centre]) fapMap[r.code_centre] = {};
    fapMap[r.code_centre][r.mois] = r.nb_fap;
  });

  // Totaux CA par mois
  const caTotaux = {};
  MOIS_ORDER.forEach((m) => {
    caTotaux[m] = caMap["total"]?.[m] || 0;
  });

  // Totaux marge par mois (tous centres)
  const mbTotaux = {};
  MOIS_ORDER.forEach((m) => {
    mbTotaux[m] = Object.keys(CENTRES).reduce((acc, c) => acc + (mbMap[c]?.[m] || 0), 0);
  });

  // Marge cumulée
  let cumul = 0;
  const margeCumulee = MOIS_ORDER.map((m) => {
    cumul += mbTotaux[m];
    return { mois: m, cumul, mensuel: mbTotaux[m] };
  });

  const s = {
    page: { background: C.bg, minHeight: "100vh", color: C.text, fontFamily: "system-ui, sans-serif" },
    nav: { display: "flex", gap: 4, padding: "12px 24px", background: C.surface, borderBottom: `1px solid ${C.border}`, alignItems: "center" },
    logo: { fontWeight: 700, fontSize: 14, color: C.text, marginRight: 16, textDecoration: "none" },
    navLink: (active) => ({ padding: "6px 14px", borderRadius: 6, fontSize: 13, fontWeight: active ? 600 : 400, color: active ? C.text : C.muted, background: active ? C.border : "transparent", textDecoration: "none" }),
    main: { padding: 24, maxWidth: 1400, margin: "0 auto" },
    section: { marginBottom: 32 },
    sectionTitle: { fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", color: C.muted, textTransform: "uppercase", marginBottom: 16 },
    card: { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: 20 },
    table: { width: "100%", borderCollapse: "collapse", fontSize: 12 },
    th: { padding: "8px 12px", textAlign: "right", color: C.muted, fontWeight: 500, fontSize: 11, textTransform: "uppercase", borderBottom: `1px solid ${C.border}` },
    thL: { padding: "8px 12px", textAlign: "left", color: C.muted, fontWeight: 500, fontSize: 11, textTransform: "uppercase", borderBottom: `1px solid ${C.border}` },
    td: { padding: "8px 12px", textAlign: "right", borderBottom: `1px solid #0a162833`, fontFamily: "monospace", fontSize: 12 },
    tdL: { padding: "8px 12px", textAlign: "left", borderBottom: `1px solid #0a162833`, fontSize: 12, fontWeight: 600 },
    tdTot: { padding: "8px 12px", textAlign: "right", borderTop: `2px solid ${C.border}`, fontWeight: 700, fontFamily: "monospace", fontSize: 12 },
    tdTotL: { padding: "8px 12px", textAlign: "left", borderTop: `2px solid ${C.border}`, fontWeight: 700, fontSize: 12 },
  };

  return (
    <>
      <Head><title>Financier — Re-FAP Dashboard</title></Head>
      <div style={s.page}>
        {/* NAV */}
        <nav style={s.nav}>
          <span style={s.logo}>RE</span>
          <span style={{ fontSize: 14, fontWeight: 700, marginRight: 24 }}>Financier</span>
          {NAV_ITEMS.map((n) => (
            <Link key={n.href} href={n.href} style={s.navLink(n.href === "/admin/financier")}>{n.label}</Link>
          ))}
          <button onClick={() => window.location.reload()} style={{ marginLeft: "auto", background: C.border, border: "none", color: C.text, borderRadius: 6, padding: "6px 14px", cursor: "pointer", fontSize: 12 }}>Rafraîchir</button>
        </nav>

        <div style={s.main}>
          {loading ? (
            <div style={{ color: C.muted, padding: 40, textAlign: "center" }}>Chargement...</div>
          ) : (
            <>
              {/* CA MENSUEL PAR CENTRE */}
              <div style={s.section}>
                <div style={s.sectionTitle}>CA Mensuel par Centre (HT)</div>
                <div style={s.card}>
                  <table style={s.table}>
                    <thead>
                      <tr>
                        <th style={s.thL}>Centre</th>
                        {MOIS_ORDER.map((m) => <th key={m} style={s.th}>{MOIS_LABEL[m]}</th>)}
                        <th style={{ ...s.th, color: C.orange }}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* CA global non ventilé par centre — on affiche le CA total sur la ligne Total uniquement */}
                      {Object.keys(CENTRES).map((code) => {
                        const fapTotal = MOIS_ORDER.reduce((a, m) => a + (fapMap[code]?.[m] || 0), 0);
                        return (
                          <tr key={code}>
                            <td style={s.tdL}>
                              <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: CENTRES[code].color, marginRight: 8 }} />
                              {CENTRES[code].label}
                            </td>
                            {MOIS_ORDER.map((m) => (
                              <td key={m} style={s.td} title={`${fapMap[code]?.[m] || 0} FAP`}>
                                {fapMap[code]?.[m] ? `${fapMap[code][m]} FAP` : "–"}
                              </td>
                            ))}
                            <td style={{ ...s.td, fontWeight: 700 }}>{fapTotal > 0 ? `${fapTotal} FAP` : "–"}</td>
                          </tr>
                        );
                      })}
                      <tr>
                        <td style={s.tdTotL}>CA HT Global</td>
                        {MOIS_ORDER.map((m) => (
                          <td key={m} style={{ ...s.tdTot, color: C.green }}>{fmt(caTotaux[m])}</td>
                        ))}
                        <td style={{ ...s.tdTot, color: C.orange }}>
                          {fmt(MOIS_ORDER.reduce((a, m) => a + (caTotaux[m] || 0), 0))}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* MARGE MENSUELLE PAR CENTRE */}
              <div style={s.section}>
                <div style={s.sectionTitle}>Marge Mensuelle par Centre</div>
                <div style={s.card}>
                  <table style={s.table}>
                    <thead>
                      <tr>
                        <th style={s.thL}>Centre</th>
                        {MOIS_ORDER.map((m) => <th key={m} style={s.th}>{MOIS_LABEL[m]}</th>)}
                        <th style={{ ...s.th, color: C.green }}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.keys(CENTRES).map((code) => {
                        const total = MOIS_ORDER.reduce((a, m) => a + (mbMap[code]?.[m] || 0), 0);
                        return (
                          <tr key={code}>
                            <td style={s.tdL}>
                              <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: CENTRES[code].color, marginRight: 8 }} />
                              {CENTRES[code].label}
                            </td>
                            {MOIS_ORDER.map((m) => (
                              <td key={m} style={{ ...s.td, color: mbMap[code]?.[m] > 0 ? C.green : C.muted }}>
                                {fmt(mbMap[code]?.[m])}
                              </td>
                            ))}
                            <td style={{ ...s.td, fontWeight: 700, color: total > 0 ? C.green : C.muted }}>{fmt(total)}</td>
                          </tr>
                        );
                      })}
                      <tr>
                        <td style={s.tdTotL}>Total</td>
                        {MOIS_ORDER.map((m) => (
                          <td key={m} style={{ ...s.tdTot, color: C.green }}>{fmt(mbTotaux[m])}</td>
                        ))}
                        <td style={{ ...s.tdTot, color: C.orange }}>
                          {fmt(MOIS_ORDER.reduce((a, m) => a + mbTotaux[m], 0))}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* MARGE CUMULÉE */}
              <div style={s.section}>
                <div style={s.sectionTitle}>Marge Cumulée</div>
                <div style={{ display: "flex", gap: 12 }}>
                  {margeCumulee.map((mc) => (
                    <div key={mc.mois} style={{ flex: 1, background: C.surface, border: `1px solid ${mc.cumul >= 0 ? "#22c55e33" : "#ef444433"}`, borderRadius: 10, padding: "16px 20px" }}>
                      <div style={{ fontSize: 11, color: C.muted, marginBottom: 8 }}>{MOIS_LABEL[mc.mois]}</div>
                      <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "monospace", color: mc.cumul >= 0 ? C.green : C.red }}>
                        {fmtSign(mc.cumul)}
                      </div>
                      <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>
                        {fmtSign(mc.mensuel)} ce mois
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
