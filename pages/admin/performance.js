/**
 * /pages/admin/performance.js
 * Tableau de bord — Performance chatbot Re-FAP
 * Mistral vs Déterministe v7.0
 */

import { useState, useEffect } from "react";
import Link from "next/link";

const TOKEN = process.env.NEXT_PUBLIC_ADMIN_TOKEN || "";

// ─── Palette ───────────────────────────────────────────────
const C = {
  bg:      "#0f1117",
  surface: "#161b27",
  border:  "#1e2535",
  accent:  "#e8402a",
  blue:    "#3b82f6",
  green:   "#22c55e",
  yellow:  "#f59e0b",
  muted:   "#4b5563",
  text:    "#e2e8f0",
  sub:     "#94a3b8",
};

const FUNNEL_LABELS = {
  symptome:   "Symptôme",
  marque:     "Marque",
  modele:     "Modèle",
  km:         "Kilométrage",
  tentatives: "Tentatives",
  ville:      "Ville",
  cta:        "CTA / Prix",
};

const SYMPTOME_LABELS = {
  voyant_moteur_seul:    "🔴 Voyant moteur seul",
  voyant_fap:            "🔶 Voyant FAP",
  voyant_fap_puissance:  "🔴🔶 Voyant + perte puissance",
  perte_puissance:       "💨 Perte de puissance",
  fumee_noire:           "🌫️ Fumée noire",
  fumee:                 "🌫️ Fumée",
  fumee_blanche:         "⬜ Fumée blanche",
  ct_refuse:             "🔧 CT refusé",
  fap_bouche_declare:    "🔩 FAP bouché",
  code_obd:              "📟 Code OBD",
  inconnu:               "❓ Inconnu",
};

// ─── Composants ─────────────────────────────────────────────

function Stat({ label, value, sub, delta, color }) {
  const deltaColor = delta > 0 ? C.green : delta < 0 ? C.accent : C.muted;
  const deltaSign = delta > 0 ? "▲" : "▼";
  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`,
      borderRadius: 12, padding: "20px 24px", minWidth: 140,
    }}>
      <div style={{ color: C.sub, fontSize: 11, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>{label}</div>
      <div style={{ color: color || C.text, fontSize: 28, fontWeight: 700, fontFamily: "monospace", lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ color: C.sub, fontSize: 12, marginTop: 4 }}>{sub}</div>}
      {delta !== undefined && delta !== null && (
        <div style={{ color: deltaColor, fontSize: 12, marginTop: 6, fontWeight: 600 }}>
          {deltaSign} {Math.abs(delta).toFixed(1)} pts vs Mistral
        </div>
      )}
    </div>
  );
}

function FunnelBar({ label, pct, pctRef, n }) {
  const delta = pctRef !== undefined ? pct - pctRef : null;
  const barColor = delta === null ? C.blue : delta >= 0 ? C.green : C.accent;
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
        <span style={{ color: C.sub, fontSize: 13 }}>{label}</span>
        <span style={{ color: C.text, fontSize: 13, fontFamily: "monospace" }}>
          {pct}%
          {delta !== null && (
            <span style={{ color: delta >= 0 ? C.green : C.accent, marginLeft: 8, fontSize: 11 }}>
              {delta >= 0 ? "▲+" : "▼"}{Math.abs(delta).toFixed(1)}
            </span>
          )}
          <span style={{ color: C.muted, marginLeft: 8, fontSize: 11 }}>({n})</span>
        </span>
      </div>
      <div style={{ height: 6, background: C.border, borderRadius: 3, overflow: "hidden" }}>
        <div style={{
          height: "100%", width: `${pct}%`, background: barColor,
          borderRadius: 3, transition: "width 0.6s ease",
        }} />
      </div>
      {pctRef !== undefined && (
        <div style={{ position: "relative", height: 0 }}>
          <div style={{
            position: "absolute", top: -6, left: `${pctRef}%`,
            width: 2, height: 18, background: C.muted, borderRadius: 1,
            transform: "translateX(-50%)",
          }} />
        </div>
      )}
    </div>
  );
}

function DropoffBar({ label, n, total }) {
  const pct = total ? (n / total * 100) : 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
      <span style={{ color: C.sub, fontSize: 12, width: 90, flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, height: 8, background: C.border, borderRadius: 4, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: C.accent, borderRadius: 4 }} />
      </div>
      <span style={{ color: C.text, fontSize: 12, fontFamily: "monospace", width: 40, textAlign: "right" }}>{n}</span>
      <span style={{ color: C.muted, fontSize: 11, width: 38 }}>{pct.toFixed(0)}%</span>
    </div>
  );
}

function PillList({ items, labelMap }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {items?.map((item, i) => (
        <div key={i} style={{
          background: C.border, borderRadius: 20, padding: "5px 12px",
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <span style={{ color: C.text, fontSize: 13 }}>{labelMap?.[item.label] || item.label}</span>
          <span style={{
            background: C.accent, color: "#fff", borderRadius: 10,
            padding: "1px 7px", fontSize: 11, fontWeight: 700,
          }}>{item.pct}%</span>
          <span style={{ color: C.muted, fontSize: 11 }}>({item.n})</span>
        </div>
      ))}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{ color: C.sub, fontSize: 11, textTransform: "uppercase", letterSpacing: 2, marginBottom: 16 }}>{title}</div>
      {children}
    </div>
  );
}

function Panel({ title, badge, children }) {
  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`,
      borderRadius: 12, padding: 24, flex: 1, minWidth: 0,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <span style={{ color: C.text, fontSize: 15, fontWeight: 600 }}>{title}</span>
        {badge && (
          <span style={{
            background: C.accent + "22", color: C.accent,
            borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 600,
          }}>{badge}</span>
        )}
      </div>
      {children}
    </div>
  );
}

// ─── Page principale ─────────────────────────────────────────

export default function PerformanceDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [token, setToken] = useState("");
  const [authed, setAuthed] = useState(false);

  const load = async (tok = "") => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/baseline?token=${tok}`);
      if (res.status === 401) { setError("Accès refusé"); setLoading(false); return; }
      const json = await res.json();
      setData(json);
      setAuthed(true);
    } catch (e) {
      setError("Erreur de connexion");
    }
    setLoading(false);
  };

  useEffect(() => { load(TOKEN); }, []);

  if (!authed && error) {
    return (
      <div style={{ background: C.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui" }}>
        <div style={{ color: C.accent, fontSize: 16 }}>{error}</div>
      </div>
    );
  }

  const b = data?.baseline?.metrics;
  const c = data?.current?.metrics;
  const hasCurrentData = c && c.total >= 10;

  const delta = (key) => {
    if (!hasCurrentData || !b || !c) return null;
    const bv = b.funnel?.[key]?.pct;
    const cv = c.funnel?.[key]?.pct;
    return bv !== undefined && cv !== undefined ? cv - bv : null;
  };

  return (
    <div style={{ background: C.bg, minHeight: "100vh", fontFamily: "system-ui", color: C.text }}>

      {/* Admin Nav */}
      <nav style={{ background: "#0f1523", borderBottom: `1px solid ${C.border}`, padding: "0 32px", display: "flex", gap: 0 }}>
        {[
          { href: "/admin", label: "Terrain" },
          { href: "/admin/social", label: "Social" },
          { href: "/admin/seo", label: "SEO" },
          { href: "/admin/performance", label: "Performance" },
          { href: "/admin/magasins", label: "Magasins" },
          { href: "/admin/analytics", label: "Analytics" },
        ].map((item) => (
          <Link key={item.href} href={item.href} style={{
            padding: "10px 18px", fontSize: 13, fontWeight: 600, textDecoration: "none",
            color: item.href === "/admin/performance" ? C.text : C.sub,
            borderBottom: item.href === "/admin/performance" ? `2px solid ${C.green}` : "2px solid transparent",
          }}>{item.label}</Link>
        ))}
      </nav>

      <div style={{ padding: "32px 40px", maxWidth: 1200, margin: "0 auto" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 36 }}>
        <div>
          <div style={{ color: C.accent, fontSize: 13, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", marginBottom: 4 }}>Re-FAP</div>
          <div style={{ color: C.text, fontSize: 24, fontWeight: 800 }}>Performance chatbot</div>
          <div style={{ color: C.sub, fontSize: 13, marginTop: 4 }}>
            Migration Mistral → Déterministe v7.0 · {data?.cutover}
          </div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{
            background: C.muted + "22", border: `1px solid ${C.muted}`,
            borderRadius: 8, padding: "6px 14px", fontSize: 12, color: C.sub,
          }}>Mistral · 30j</div>
          <div style={{
            background: C.green + "22", border: `1px solid ${C.green}`,
            borderRadius: 8, padding: "6px 14px", fontSize: 12, color: C.green,
          }}>Déterministe · {hasCurrentData ? c.total + " conv." : "< 10 conv."}</div>
        </div>
      </div>

      {loading ? (
        <div style={{ color: C.sub, textAlign: "center", padding: 80 }}>Chargement…</div>
      ) : (
        <>
          {/* KPIs baseline */}
          <Section title="Baseline Mistral — 30 jours">
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              <Stat label="Conversations" value={b?.total || "—"} />
              <Stat label="Turns moyens" value={b?.turns_avg || "—"} sub="messages/conv." />
              <Stat label="Flow complet" value={`${b?.flow_complet_pct || 0}%`} sub={`${b?.flow_complet || 0} conv.`} color={C.blue} />
              <Stat label="CTA déclenché" value={`${b?.funnel?.cta?.pct || 0}%`} sub={`${b?.funnel?.cta?.n || 0} conv.`} color={C.yellow} />
              <Stat label="Ville collectée" value={`${b?.funnel?.ville?.pct || 0}%`} color={C.green} />
              <Stat label="Km collecté" value={`${b?.funnel?.km?.pct || 0}%`} />
            </div>
          </Section>

          {/* Funnel */}
          <Section title="Funnel collecte de données">
            <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
              <Panel title="Mistral" badge="baseline">
                {Object.entries(b?.funnel || {}).map(([k, v]) => (
                  <FunnelBar key={k} label={FUNNEL_LABELS[k] || k} pct={v.pct} n={v.n} />
                ))}
              </Panel>
              {hasCurrentData ? (
                <Panel title="Déterministe v7.0" badge="live">
                  {Object.entries(c?.funnel || {}).map(([k, v]) => (
                    <FunnelBar key={k} label={FUNNEL_LABELS[k] || k}
                      pct={v.pct} n={v.n}
                      pctRef={b?.funnel?.[k]?.pct}
                    />
                  ))}
                </Panel>
              ) : (
                <Panel title="Déterministe v7.0" badge="en attente">
                  <div style={{ color: C.sub, fontSize: 13, textAlign: "center", padding: "40px 0" }}>
                    {c?.total || 0} conversations — données insuffisantes<br />
                    <span style={{ fontSize: 11 }}>Revenir dans 7-10 jours</span>
                  </div>
                </Panel>
              )}
            </div>
          </Section>

          {/* Drop-off */}
          <Section title="Drop-off par étape (Mistral)">
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24 }}>
              <div style={{ color: C.sub, fontSize: 12, marginBottom: 16 }}>
                Étape où la conversation s'arrête — {b?.total} conversations totales
              </div>
              {Object.entries(b?.dropoff || {}).map(([k, v]) => (
                <DropoffBar key={k} label={FUNNEL_LABELS[k] || k} n={v} total={b?.total} />
              ))}
              <div style={{ marginTop: 16, padding: "12px 16px", background: C.accent + "11", borderRadius: 8, borderLeft: `3px solid ${C.accent}` }}>
                <span style={{ color: C.accent, fontSize: 12, fontWeight: 600 }}>
                  ⚠️ Point critique : {b?.dropoff ? Object.entries(b.dropoff).sort((a,b)=>b[1]-a[1])[0]?.[0] : "—"}
                </span>
                <span style={{ color: C.sub, fontSize: 12 }}> — étape avec le plus de drop-off</span>
              </div>
            </div>
          </Section>

          {/* Distributions */}
          <div style={{ display: "flex", gap: 20, marginBottom: 32, flexWrap: "wrap" }}>
            <Panel title="Top symptômes" badge={`${b?.total} conv.`}>
              <PillList items={b?.top_symptomes} labelMap={SYMPTOME_LABELS} />
            </Panel>
            <Panel title="Top marques" badge={`${b?.total} conv.`}>
              <PillList items={b?.top_marques} />
            </Panel>
          </div>

          {/* Comparaison si données dispo */}
          {hasCurrentData && (
            <Section title="Comparaison Mistral vs Déterministe">
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                {["flow_complet_pct", "funnel.cta.pct", "funnel.ville.pct", "funnel.km.pct", "funnel.modele.pct"].map(path => {
                  const keys = path.split(".");
                  const bv = keys.reduce((o, k) => o?.[k], b);
                  const cv = keys.reduce((o, k) => o?.[k], c);
                  const d = cv !== undefined && bv !== undefined ? cv - bv : null;
                  const labels = {
                    "flow_complet_pct": "Flow complet",
                    "funnel.cta.pct": "CTA",
                    "funnel.ville.pct": "Ville collectée",
                    "funnel.km.pct": "Km collecté",
                    "funnel.modele.pct": "Modèle collecté",
                  };
                  return (
                    <Stat key={path}
                      label={labels[path] || path}
                      value={`${cv?.toFixed(1) || "—"}%`}
                      delta={d}
                    />
                  );
                })}
              </div>
            </Section>
          )}

          <div style={{ color: C.muted, fontSize: 11, textAlign: "right", marginTop: 24 }}>
            Généré le {new Date(data?.generated_at).toLocaleString("fr-FR")} · Re-FAP chatbot dashboard
          </div>
        </>
      )}
      </div>
    </div>
  );
}
