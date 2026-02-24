// /pages/admin/analytics/index.js
// Dashboard Analytics Multi-Sources — Vue synthese + Correlations + Attribution + Export brief
// Dark theme coherent avec le reste de l'admin

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
  purple: "#8b5cf6",
  cyan: "#06b6d4",
  orange: "#f97316",
  pink: "#ec4899",
  meta: "#1877f2",
  youtube: "#ff0000",
  muted: "#64748b",
  text: "#e2e8f0",
  sub: "#94a3b8",
};

const CHANNEL_CONFIG = {
  gsc: { label: "SEO (GSC)", color: C.blue, icon: "G" },
  youtube: { label: "YouTube", color: C.youtube, icon: "\u25B6" },
  tiktok: { label: "TikTok", color: C.cyan, icon: "\u266A" },
  meta: { label: "Meta/IG", color: C.meta, icon: "f" },
  email: { label: "Email/SMS", color: C.green, icon: "\u2709" },
  leads: { label: "Leads CRM", color: C.purple, icon: "L" },
  chatbot: { label: "Chatbot", color: C.pink, icon: "B" },
};

const NAV_ITEMS = [
  { href: "/admin", label: "Terrain" },
  { href: "/admin/social", label: "Social" },
  { href: "/admin/seo", label: "SEO" },
  { href: "/admin/performance", label: "Performance" },
  { href: "/admin/magasins", label: "Magasins" },
  { href: "/admin/analytics", label: "Analytics" },
];

const fmt = (n) => n != null ? Number(n).toLocaleString("fr-FR") : "\u2014";
const fmtPct = (n) => n != null ? `${Number(n).toFixed(1)}%` : "\u2014";

export default function AnalyticsDashboard() {
  const [data, setData] = useState(null);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const getToken = () => TOKEN || (typeof window !== "undefined" ? localStorage.getItem("fapexpert_admin_token") || "" : "");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch(`/api/admin/analytics-data?days=${days}&token=${encodeURIComponent(getToken())}`);
      if (!resp.ok) throw new Error((await resp.json().catch(() => ({}))).error || `Erreur ${resp.status}`);
      setData(await resp.json());
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }, [days]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const exportBrief = () => {
    if (!data) return;
    const t = data.totals;
    const lags = { gsc: "3j", youtube: "5j", tiktok: "5j", meta: "5j", email: "3j", leads: "1j", chatbot: "1j" };
    const now = new Date().toISOString().slice(0, 16).replace("T", " ");
    const lines = [
      "════════════════════════════════════════════════════════════",
      "  BRIEF ANALYTIQUE RE-FAP — Export automatique",
      "════════════════════════════════════════════════════════════",
      "",
      `Date d'export : ${now}`,
      `Periode analysee : ${data.days} jours`,
      "",
      "────────────────────────────────────────────────────────────",
      "  CONTEXTE RE-FAP",
      "────────────────────────────────────────────────────────────",
      "",
      "Activite : Nettoyage de filtre a particules (FAP) diesel",
      "Reseau : Carter-Cash (CC) — centres auto en France",
      "Objectif strategique : 10 centres actifs d'ici juillet 2026",
      "Positionnement : Alternative au remplacement FAP (1500-3000EUR)",
      "  via nettoyage professionnel (250-400EUR)",
      "",
      "════════════════════════════════════════════════════════════",
      "  1. KPIS PAR SOURCE",
      "════════════════════════════════════════════════════════════",
      "",
      "--- SEO (Google Search Console) ---",
      `  Clicks       : ${fmt(t.gsc.clicks)}`,
      `  Impressions  : ${fmt(t.gsc.impressions)}`,
      `  CTR moyen    : ${t.gsc.ctr}%`,
      `  Position moy.: ${t.gsc.avgPosition}`,
      "",
      "--- YouTube ---",
      `  Vues            : ${fmt(t.youtube.views)}`,
      `  Watch time      : ${Number(t.youtube.watchTimeH).toFixed(0)}h`,
      `  Abonnes gagnes  : ${fmt(t.youtube.subscribers)}`,
      "",
      "--- TikTok ---",
      `  Vues   : ${fmt(t.tiktok.views)}`,
      `  Reach  : ${fmt(t.tiktok.reach)}`,
      "",
      "--- Meta / Instagram ---",
      `  Reach organique : ${fmt(t.meta.reachOrganic)}`,
      `  Reach payant    : ${fmt(t.meta.reachPaid)}`,
      `  Engagement      : ${fmt(t.meta.engagement)}`,
      `  Depense ads     : ${fmt(t.meta.spend)} EUR`,
      "",
      "--- Email / SMS ---",
      `  Envois          : ${fmt(t.email.sends)}`,
      `  Taux ouverture  : ${fmtPct(t.email.avgOpenRate)}`,
      `  Taux clic       : ${fmtPct(t.email.avgClickRate)}`,
      "",
      "--- Ventes Terrain Carter-Cash ---",
      `  Ventes FAP : ${fmt(t.cc.ventesFap)}`,
      `  CA FAP     : ${fmt(t.cc.caFap)} EUR`,
      "",
      "--- Leads CRM ---",
      `  Total leads : ${fmt(t.leads.total)}`,
      "",
      "--- Chatbot ---",
      `  Conversations : ${fmt(t.chatbot.conversations)}`,
      "",
      "════════════════════════════════════════════════════════════",
      "  2. CORRELATIONS AVEC VENTES TERRAIN",
      "════════════════════════════════════════════════════════════",
      "",
      "Methode : Coefficient de Pearson avec lag temporel",
      "(lag = decalage en jours entre signal digital et vente)",
      "",
    ];

    for (const [k, v] of Object.entries(data.correlations)) {
      const cfg = CHANNEL_CONFIG[k];
      const corr = v.correlation;
      const strength = corr > 0.5 ? "FORT" : corr > 0.2 ? "Modere" : corr > 0 ? "Faible" : "Negatif";
      lines.push(`  ${cfg.label.padEnd(16)} | lag ${(lags[k] || "?").padEnd(3)} | r = ${corr > 0 ? "+" : ""}${corr.toFixed(3)} | ${v.dataPoints} pts | ${strength}`);
    }

    lines.push(
      "",
      "════════════════════════════════════════════════════════════",
      "  3. SCORE D'ATTRIBUTION PAR CANAL",
      "════════════════════════════════════════════════════════════",
      "",
      "Methode : correlation x volume, normalise a 100%",
      "",
    );

    const sortedAttr = Object.entries(data.attribution).sort((a, b) => b[1] - a[1]);
    for (const [k, pct] of sortedAttr) {
      const cfg = CHANNEL_CONFIG[k];
      const bar = "\u2588".repeat(Math.round(pct / 2));
      lines.push(`  ${cfg.label.padEnd(16)} ${pct.toFixed(1).padStart(5)}%  ${bar}`);
    }

    if (data.ccMagasins?.length > 0) {
      lines.push(
        "",
        "════════════════════════════════════════════════════════════",
        "  4. TOP MAGASINS CARTER-CASH",
        "════════════════════════════════════════════════════════════",
        "",
      );
      for (const [i, m] of data.ccMagasins.slice(0, 15).entries()) {
        lines.push(`  ${String(i + 1).padStart(2)}. ${m.magasin.padEnd(30)} ${String(m.ventes_fap).padStart(4)} ventes  ${fmt(m.ca_fap).padStart(8)} EUR`);
      }
    }

    lines.push(
      "",
      "════════════════════════════════════════════════════════════",
      "  CONTEXTE STRATEGIQUE POUR ANALYSE",
      "════════════════════════════════════════════════════════════",
      "",
      "- Re-FAP cible les proprietaires de vehicules diesel avec",
      "  voyant FAP allume ou perte de puissance",
      "- Le reseau Carter-Cash (CC) est le canal de vente principal",
      "- Objectif : passer de la phase pilote a 10 centres actifs",
      "  d'ici juillet 2026",
      "- Canaux digitaux : SEO (blog fap-expert.fr), YouTube (tutos),",
      "  TikTok (awareness), Meta/IG (retargeting), Email (nurturing)",
      "- Les correlations avec lag indiquent le delai moyen entre",
      "  l'exposition digitale et la visite en centre",
      "",
      "════════════════════════════════════════════════════════════",
      `  Genere le ${now} — Re-FAP Analytics v1.0`,
      "════════════════════════════════════════════════════════════",
    );

    const content = lines.join("\n");
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `brief-analytique-refap-${data.days}j-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <Head><title>Analytics Dashboard \u2014 Re-FAP</title></Head>
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
            <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Analytics Multi-Sources</h1>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {[30, 90].map(d => (
              <button key={d} onClick={() => setDays(d)} style={{
                background: days === d ? C.blue : "#1a2234",
                border: `1px solid ${days === d ? C.blue : C.border}`,
                color: days === d ? "#fff" : C.sub,
                padding: "6px 14px", borderRadius: 8, cursor: "pointer",
                fontFamily: "inherit", fontSize: 13, fontWeight: days === d ? 600 : 400,
              }}>{d}j</button>
            ))}
            <Link href="/admin/analytics/import" style={{
              background: "#1a2234", border: `1px solid ${C.border}`, color: C.text,
              padding: "8px 16px", borderRadius: 8, textDecoration: "none", fontSize: 13,
            }}>Import</Link>
            <button onClick={fetchData} disabled={loading} style={{
              background: "#1a2234", border: `1px solid ${C.border}`, color: C.text,
              padding: "8px 16px", borderRadius: 8, cursor: loading ? "wait" : "pointer",
              fontFamily: "inherit", fontSize: 13,
            }}>{loading ? "..." : "Rafraichir"}</button>
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

        {/* Loading */}
        {loading && !data && (
          <div style={{ textAlign: "center", padding: 80, color: C.muted }}>Chargement des donnees analytics...</div>
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

            {/* ═══════ SECTION 1: VUE SYNTHESE ═══════ */}
            <SectionTitle title={`Vue synthese \u2014 ${days} jours`} />

            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
              <KpiCard label="SEO Clicks" value={fmt(data.totals.gsc.clicks)} sub={`${fmt(data.totals.gsc.impressions)} impr.`} color={C.blue} icon="G" />
              <KpiCard label="YouTube Vues" value={fmt(data.totals.youtube.views)} sub={`${Number(data.totals.youtube.watchTimeH).toFixed(0)}h watch`} color={C.youtube} icon={"\u25B6"} />
              <KpiCard label="TikTok Vues" value={fmt(data.totals.tiktok.views)} sub={`${fmt(data.totals.tiktok.reach)} reach`} color={C.cyan} icon={"\u266A"} />
              <KpiCard label="Meta Reach" value={fmt(data.totals.meta.reachOrganic + data.totals.meta.reachPaid)} sub={`${fmt(data.totals.meta.spend)}\u20AC depense`} color={C.meta} icon="f" />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 32 }}>
              <KpiCard label="Email Envois" value={fmt(data.totals.email.sends)} sub={`${fmtPct(data.totals.email.avgOpenRate)} ouverture`} color={C.green} icon={"\u2709"} />
              <KpiCard label="Ventes FAP" value={fmt(data.totals.cc.ventesFap)} sub={`${fmt(data.totals.cc.caFap)}\u20AC CA`} color={C.orange} icon="CC" />
              <KpiCard label="Leads CRM" value={fmt(data.totals.leads.total)} sub="depuis Supabase" color={C.purple} icon="L" />
              <KpiCard label="Conversations Bot" value={fmt(data.totals.chatbot.conversations)} sub="depuis Supabase" color={C.pink} icon="B" />
            </div>

            {/* ═══════ SECTION 2: GRAPHE SUPERPOSE ═══════ */}
            <SectionTitle title="Ventes vs Signaux digitaux" />

            <div style={{
              background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12,
              padding: 24, marginBottom: 32,
            }}>
              <OverlayChart data={data.overlay} />
            </div>

            {/* ═══════ SECTION 3: CORRELATIONS ═══════ */}
            <SectionTitle title="Correlations avec ventes terrain" />

            <div style={{
              background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12,
              padding: 24, marginBottom: 32,
            }}>
              <div style={{ color: C.sub, fontSize: 12, marginBottom: 16 }}>
                Coefficient de Pearson entre signaux digitaux (avec lag temporel) et ventes FAP terrain
              </div>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                {Object.entries(data.correlations).map(([key, val]) => {
                  const cfg = CHANNEL_CONFIG[key];
                  const lags = { gsc: "-3j", youtube: "-5j", tiktok: "-5j", meta: "-5j", email: "-3j", leads: "-1j", chatbot: "-1j" };
                  const corr = val.correlation;
                  const corrColor = corr > 0.5 ? C.green : corr > 0.2 ? C.yellow : corr > 0 ? C.orange : C.red;
                  return (
                    <div key={key} style={{
                      flex: "1 1 160px", minWidth: 140, background: "#1a2234",
                      borderRadius: 10, padding: "14px 18px", borderLeft: `3px solid ${cfg.color}`,
                    }}>
                      <div style={{ fontSize: 12, color: C.sub, marginBottom: 4 }}>
                        {cfg.label} <span style={{ color: C.muted, fontSize: 11 }}>lag {lags[key]}</span>
                      </div>
                      <div style={{ fontSize: 24, fontWeight: 700, color: corrColor, fontFamily: "monospace" }}>
                        {corr > 0 ? "+" : ""}{corr.toFixed(3)}
                      </div>
                      <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>
                        {val.dataPoints} points
                        {corr > 0.5 ? " \u2022 Fort" : corr > 0.2 ? " \u2022 Modere" : corr > 0 ? " \u2022 Faible" : " \u2022 Negatif"}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ═══════ SECTION 4: ATTRIBUTION ═══════ */}
            <SectionTitle title="Score d'attribution par canal" />

            <div style={{
              background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12,
              padding: 24, marginBottom: 32,
            }}>
              <div style={{ color: C.sub, fontSize: 12, marginBottom: 16 }}>
                Contribution estimee de chaque canal aux ventes (correlation x volume, normalise a 100%)
              </div>
              <div style={{ display: "flex", gap: 16 }}>
                {/* Bars */}
                <div style={{ flex: 2 }}>
                  {Object.entries(data.attribution)
                    .sort((a, b) => b[1] - a[1])
                    .map(([key, pct]) => {
                      const cfg = CHANNEL_CONFIG[key];
                      return (
                        <div key={key} style={{ marginBottom: 14 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                            <span style={{ color: C.text, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={{ color: cfg.color, fontWeight: 700 }}>{cfg.icon}</span>
                              {cfg.label}
                            </span>
                            <span style={{ color: cfg.color, fontSize: 14, fontWeight: 700, fontFamily: "monospace" }}>
                              {pct.toFixed(1)}%
                            </span>
                          </div>
                          <div style={{ height: 8, background: C.border, borderRadius: 4, overflow: "hidden" }}>
                            <div style={{
                              height: "100%", width: `${pct}%`, background: cfg.color,
                              borderRadius: 4, transition: "width 0.8s ease",
                            }} />
                          </div>
                        </div>
                      );
                    })}
                </div>

                {/* Donut-like visualization */}
                <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                  <AttributionDonut attribution={data.attribution} />
                </div>
              </div>
            </div>

            {/* ═══════ SECTION 5: VENTES PAR MAGASIN ═══════ */}
            {data.ccMagasins && data.ccMagasins.length > 0 && (
              <>
                <SectionTitle title="Ventes FAP par magasin" />
                <div style={{
                  background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12,
                  padding: 24, marginBottom: 32,
                }}>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                      <thead>
                        <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                          <th style={{ padding: 8, textAlign: "left", color: C.muted, fontWeight: 500 }}>#</th>
                          <th style={{ padding: 8, textAlign: "left", color: C.muted, fontWeight: 500 }}>Magasin</th>
                          <th style={{ padding: 8, textAlign: "right", color: C.muted, fontWeight: 500 }}>Ventes FAP</th>
                          <th style={{ padding: 8, textAlign: "right", color: C.muted, fontWeight: 500 }}>CA FAP</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.ccMagasins.slice(0, 15).map((m, i) => (
                          <tr key={i} style={{ borderBottom: `1px solid ${C.border}30` }}>
                            <td style={{ padding: 8, color: C.muted, fontFamily: "monospace" }}>{i + 1}</td>
                            <td style={{ padding: 8, fontWeight: 500 }}>{m.magasin}</td>
                            <td style={{ padding: 8, textAlign: "right", fontFamily: "monospace", color: C.orange, fontWeight: 600 }}>{m.ventes_fap}</td>
                            <td style={{ padding: 8, textAlign: "right", fontFamily: "monospace", color: C.sub }}>{fmt(m.ca_fap)}\u20AC</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}

            {/* ═══════ SECTION 6: EXPORT BRIEF ═══════ */}
            <SectionTitle title="Export brief analytique" />

            <div style={{
              background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12,
              padding: 24, marginBottom: 32,
            }}>
              <div style={{ textAlign: "center", padding: "24px 0" }}>
                <div style={{ color: C.sub, fontSize: 13, marginBottom: 16 }}>
                  Telecharger un brief .txt structuree avec toutes les KPIs, correlations, attribution et contexte Re-FAP
                </div>
                <button onClick={exportBrief} style={{
                  background: `${C.green}22`, border: `1px solid ${C.green}44`, color: C.green,
                  padding: "12px 28px", borderRadius: 10, cursor: "pointer",
                  fontSize: 14, fontWeight: 700, fontFamily: "inherit",
                }}>
                  Exporter le brief analytique
                </button>
              </div>
            </div>

            <div style={{ textAlign: "center", fontSize: 11, color: C.muted, marginTop: 24 }}>
              Re-FAP \u2014 Analytics Multi-Sources v1.0
            </div>
          </main>
        )}

      </div>
    </>
  );
}

// ═══════ COMPONENTS ═══════

function SectionTitle({ title }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 700, color: C.sub, textTransform: "uppercase",
      letterSpacing: 2, marginBottom: 16, paddingBottom: 8,
      borderBottom: `1px solid ${C.border}`,
    }}>{title}</div>
  );
}

function KpiCard({ label, value, sub, color, icon }) {
  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{
          width: 24, height: 24, borderRadius: 6, background: `${color}22`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 12, fontWeight: 700, color,
        }}>{icon}</span>
        <span style={{ fontSize: 12, fontWeight: 500, color: C.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</span>
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: -1, color: color || C.text }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

// ═══════ OVERLAY CHART (SVG) ═══════

function OverlayChart({ data }) {
  if (!data || data.length === 0) {
    return <div style={{ color: C.muted, textAlign: "center", padding: 40 }}>Aucune donnee pour le graphe superpose</div>;
  }

  const W = 900, H = 280, PAD = { top: 20, right: 20, bottom: 40, left: 50 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  // Series definitions
  const series = [
    { key: "ventes_fap", label: "Ventes FAP", color: C.orange, yAxis: "left" },
    { key: "gsc_clicks", label: "SEO Clicks", color: C.blue, yAxis: "right" },
    { key: "leads", label: "Leads", color: C.purple, yAxis: "left" },
    { key: "chatbot", label: "Chatbot", color: C.pink, yAxis: "left" },
  ];

  // Compute scales
  const leftKeys = series.filter(s => s.yAxis === "left").map(s => s.key);
  const rightKeys = series.filter(s => s.yAxis === "right").map(s => s.key);

  const maxLeft = Math.max(1, ...data.flatMap(d => leftKeys.map(k => d[k] || 0)));
  const maxRight = Math.max(1, ...data.flatMap(d => rightKeys.map(k => d[k] || 0)));

  const xScale = (i) => PAD.left + (i / Math.max(1, data.length - 1)) * plotW;
  const yScaleLeft = (v) => PAD.top + plotH - (v / maxLeft) * plotH;
  const yScaleRight = (v) => PAD.top + plotH - (v / maxRight) * plotH;

  const makePath = (key, yFn) => {
    return data.map((d, i) => {
      const x = xScale(i);
      const y = yFn(d[key] || 0);
      return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    }).join(" ");
  };

  // X-axis labels (show every nth)
  const labelStep = Math.max(1, Math.floor(data.length / 10));

  return (
    <div>
      <div style={{ display: "flex", gap: 16, marginBottom: 12, flexWrap: "wrap" }}>
        {series.map(s => (
          <span key={s.key} style={{ fontSize: 12, color: s.color, display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 12, height: 3, background: s.color, borderRadius: 1 }} />
            {s.label}
          </span>
        ))}
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }}>
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map(pct => {
          const y = PAD.top + plotH * (1 - pct);
          return (
            <g key={pct}>
              <line x1={PAD.left} y1={y} x2={W - PAD.right} y2={y}
                stroke={C.border} strokeWidth={0.5} />
              <text x={PAD.left - 6} y={y + 4} textAnchor="end"
                fill={C.muted} fontSize={10} fontFamily="monospace">
                {Math.round(maxLeft * pct)}
              </text>
            </g>
          );
        })}

        {/* X-axis labels */}
        {data.map((d, i) => {
          if (i % labelStep !== 0 && i !== data.length - 1) return null;
          const x = xScale(i);
          const label = d.date.slice(5); // MM-DD
          return (
            <text key={i} x={x} y={H - 8} textAnchor="middle"
              fill={C.muted} fontSize={10} fontFamily="monospace">
              {label}
            </text>
          );
        })}

        {/* Lines */}
        {series.map(s => (
          <path key={s.key}
            d={makePath(s.key, s.yAxis === "left" ? yScaleLeft : yScaleRight)}
            fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round"
            opacity={0.8}
          />
        ))}

        {/* Dots for ventes */}
        {data.map((d, i) => {
          if (d.ventes_fap <= 0) return null;
          return (
            <circle key={i} cx={xScale(i)} cy={yScaleLeft(d.ventes_fap)}
              r={3} fill={C.orange} />
          );
        })}
      </svg>
    </div>
  );
}

// ═══════ ATTRIBUTION DONUT (SVG) ═══════

function AttributionDonut({ attribution }) {
  const entries = Object.entries(attribution).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) {
    return <div style={{ color: C.muted, fontSize: 13 }}>Pas assez de donnees</div>;
  }

  const size = 180;
  const cx = size / 2, cy = size / 2;
  const outerR = 80, innerR = 50;

  let cumAngle = -Math.PI / 2;
  const arcs = entries.map(([key, pct]) => {
    const cfg = CHANNEL_CONFIG[key];
    const angle = (pct / 100) * 2 * Math.PI;
    const startAngle = cumAngle;
    cumAngle += angle;
    const endAngle = cumAngle;

    const x1 = cx + outerR * Math.cos(startAngle);
    const y1 = cy + outerR * Math.sin(startAngle);
    const x2 = cx + outerR * Math.cos(endAngle);
    const y2 = cy + outerR * Math.sin(endAngle);
    const x3 = cx + innerR * Math.cos(endAngle);
    const y3 = cy + innerR * Math.sin(endAngle);
    const x4 = cx + innerR * Math.cos(startAngle);
    const y4 = cy + innerR * Math.sin(startAngle);

    const largeArc = angle > Math.PI ? 1 : 0;

    const d = [
      `M ${x1} ${y1}`,
      `A ${outerR} ${outerR} 0 ${largeArc} 1 ${x2} ${y2}`,
      `L ${x3} ${y3}`,
      `A ${innerR} ${innerR} 0 ${largeArc} 0 ${x4} ${y4}`,
      "Z",
    ].join(" ");

    return { key, pct, color: cfg.color, d };
  });

  // Top channel
  const topKey = entries[0][0];
  const topCfg = CHANNEL_CONFIG[topKey];

  return (
    <svg viewBox={`0 0 ${size} ${size}`} style={{ width: size, height: size }}>
      {arcs.map(arc => (
        <path key={arc.key} d={arc.d} fill={arc.color} opacity={0.85} stroke={C.surface} strokeWidth={1} />
      ))}
      <text x={cx} y={cy - 6} textAnchor="middle" fill={topCfg.color} fontSize={16} fontWeight={700} fontFamily="monospace">
        {entries[0][1].toFixed(0)}%
      </text>
      <text x={cx} y={cy + 12} textAnchor="middle" fill={C.sub} fontSize={10}>
        {topCfg.label}
      </text>
    </svg>
  );
}

