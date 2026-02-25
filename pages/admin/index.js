// /pages/admin.js
// FAPexpert Admin Dashboard — Accès direct (sans authentification UI)

import { useState, useEffect, useCallback } from "react";
import Head from "next/head";
import Link from "next/link";

// Token via variable d'env Next.js (NEXT_PUBLIC_ADMIN_TOKEN) ou fallback localStorage
const ENV_TOKEN = process.env.NEXT_PUBLIC_ADMIN_TOKEN || "";
const STORAGE_KEY = "fapexpert_admin_token";

export default function AdminDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const getToken = () => {
    if (ENV_TOKEN) return ENV_TOKEN;
    if (typeof window !== "undefined") return localStorage.getItem(STORAGE_KEY) || "";
    return "";
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    const t = getToken();
    try {
      const resp = await fetch(`/api/admin/stats${t ? `?token=${encodeURIComponent(t)}` : ""}`);
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || `Erreur ${resp.status}`);
      }
      const json = await resp.json();
      setData(json);
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  }, []);

  // Chargement automatique au montage
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Rafraîchissement auto toutes les 5 min
  useEffect(() => {
    const interval = setInterval(fetchData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchData]);

  return (
    <>
      <Head><title>FAPexpert Dashboard</title></Head>
      <div style={{
        minHeight: "100vh", background: "#0a0e17",
        fontFamily: "'DM Sans', sans-serif", color: "#e2e8f0"
      }}>
        {/* Header */}
        <header style={{
          background: "#111827", borderBottom: "1px solid #1e293b",
          padding: "16px 32px", display: "flex", alignItems: "center", justifyContent: "space-between",
          position: "sticky", top: 0, zIndex: 100
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 36, height: 36, background: "#22c55e", borderRadius: 8,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontWeight: 700, fontSize: 14, color: "#000"
            }}>RE</div>
            <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>FAPexpert Dashboard</h1>
            <span style={{
              fontSize: 12, color: "#64748b", background: "#1a2234",
              padding: "2px 8px", borderRadius: 4
            }}>v6.2.1</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 8, height: 8, background: loading ? "#f59e0b" : error ? "#ef4444" : "#22c55e", borderRadius: "50%" }}></div>
            <span style={{ fontSize: 12, color: "#64748b", fontFamily: "monospace" }}>
              {new Date().toLocaleTimeString("fr-FR")}
            </span>
            <button
              onClick={fetchData}
              disabled={loading}
              style={{
                background: "#1a2234", border: "1px solid #1e293b", color: "#e2e8f0",
                padding: "8px 16px", borderRadius: 8, cursor: loading ? "wait" : "pointer",
                fontFamily: "inherit", fontSize: 13
              }}
            >
              {loading ? "..." : "↻ Rafraîchir"}
            </button>
          </div>
        </header>

        {/* Admin Nav */}
        <nav style={{ background: "#0f1523", borderBottom: "1px solid #1e293b", padding: "0 32px", display: "flex", gap: 0 }}>
          {[
            { href: "/admin", label: "Terrain" },
            { href: "/admin/social", label: "Social" },
            { href: "/admin/seo", label: "SEO" },
            { href: "/admin/performance", label: "Performance" },
            { href: "/admin/magasins", label: "Magasins" },
            { href: "/admin/analytics", label: "Analytics" },
            { href: "/admin/financier", label: "Financier" },
          ].map((item) => (
            <Link key={item.href} href={item.href} style={{
              padding: "10px 18px", fontSize: 13, fontWeight: 600, textDecoration: "none",
              color: item.href === "/admin" ? "#e2e8f0" : "#64748b",
              borderBottom: item.href === "/admin" ? "2px solid #22c55e" : "2px solid transparent",
            }}>{item.label}</Link>
          ))}
        </nav>

        {/* Loading */}
        {loading && !data && (
          <div style={{ textAlign: "center", padding: 80, color: "#64748b" }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
            <div>Chargement des données...</div>
          </div>
        )}

        {/* Error */}
        {error && !data && (
          <div style={{ textAlign: "center", padding: 80 }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
            <div style={{ color: "#ef4444", marginBottom: 16 }}>{error}</div>
            <button
              onClick={fetchData}
              style={{
                background: "#22c55e", color: "#000", border: "none",
                padding: "10px 24px", borderRadius: 8, fontWeight: 600,
                cursor: "pointer", fontFamily: "inherit"
              }}
            >
              Réessayer
            </button>
          </div>
        )}

        {/* Content */}
        {data && (
          <main style={{ maxWidth: 1400, margin: "0 auto", padding: "24px 32px" }}>

            {/* Overview cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
              <Card title="Conversations aujourd'hui" value={data.overview.conversations.today} color="#3b82f6"
                sub={`${data.overview.conversations.last7d} cette semaine`} />
              <Card title="Flow complet" value={`${data.flow.flowComplete.pct}%`} color="#22c55e"
                sub={`${data.flow.flowComplete.count}/${data.flow.total}`} />
              <Card title="Formulaire CTA" value={`${data.flow.formCTA.pct}%`}
                color={data.flow.formCTA.pct >= 30 ? "#22c55e" : "#f59e0b"}
                sub={`${data.flow.formCTA.count}/${data.flow.total}`} />
              <Card title="Turns moyens" value={data.overview.avgTurns}
                sub="messages user/conversation" />
            </div>

            {/* Entonnoir */}
            {data.flow && (
              <div style={{ background: "#111827", border: "1px solid #1e293b", borderRadius: 12, padding: 20, marginBottom: 24 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: "#64748b", marginBottom: 12, paddingBottom: 8, borderBottom: "1px solid #1e293b" }}>
                  📊 Entonnoir de conversion
                </div>
                <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
                  {[
                    { label: "Total conversations", value: data.flow.total, color: "#3b82f6" },
                    { label: "Flow complet", value: `${data.flow.flowComplete.pct}% (${data.flow.flowComplete.count})`, color: "#8b5cf6" },
                    { label: "Formulaire CTA", value: `${data.flow.formCTA.pct}% (${data.flow.formCTA.count})`, color: "#22c55e" },
                  ].map((item, i) => (
                    <div key={i} style={{ flex: 1, minWidth: 160, background: "#1a2234", borderRadius: 10, padding: "14px 18px" }}>
                      <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>{item.label}</div>
                      <div style={{ fontSize: 22, fontWeight: 700, color: item.color }}>{item.value}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Quality badges */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
              <QualityCard label="✅ Qualité — Closing prématuré Mistral" count={data.quality.mistralClosing.count} target="0%" />
              <QualityCard label='✅ Qualité — Mentions "1500€"' count={data.quality.mentions1500.count} target="0%" />
            </div>

            {/* Daily Trend */}
            {data.dailyTrend?.length > 0 && (
              <div style={{ background: "#111827", border: "1px solid #1e293b", borderRadius: 12, padding: 20, marginBottom: 24 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: "#64748b", marginBottom: 12, paddingBottom: 8, borderBottom: "1px solid #1e293b" }}>
                  📈 Tendance 7 jours
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8 }}>
                  {data.dailyTrend.map((d, i) => {
                    const dayLabel = new Date(d.date + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" });
                    return (
                      <div key={i} style={{ textAlign: "center", padding: 12, background: "#1a2234", borderRadius: 8 }}>
                        <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>{dayLabel}</div>
                        <div style={{ fontSize: 24, fontWeight: 700, color: d.conversations > 0 ? "#3b82f6" : "#374151" }}>{d.conversations}</div>
                        <div style={{ fontSize: 10, color: "#64748b", marginTop: 4 }}>
                          {d.formCTA > 0 && <span style={{ color: "#22c55e" }}>📝{d.formCTA} </span>}
                          {d.flowComplete > 0 && <span style={{ color: "#8b5cf6" }}>✓{d.flowComplete}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Rankings */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 24 }}>
              <RankCard title="🚗 Top Marques" items={data.topMarques} />
              <RankCard title="🔍 Top Symptômes" items={data.topSymptomes} />
              <RankCard title="📍 Top Villes" items={data.topVilles} />
            </div>

            {/* Unrecognized */}
            {data.unrecognizedMarques?.length > 0 && (
              <div style={{
                background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.3)",
                borderRadius: 12, padding: 20, marginBottom: 24
              }}>
                <div style={{ fontWeight: 600, marginBottom: 8, color: "#f59e0b" }}>
                  ⚠️ Marques non reconnues ({data.unrecognizedMarques.length})
                </div>
                {data.unrecognizedMarques.map((m, i) => (
                  <span key={i} style={{
                    display: "inline-block", background: "#1a2234", padding: "4px 10px",
                    borderRadius: 6, margin: "2px 4px", fontSize: 13, fontFamily: "monospace"
                  }}>
                    {m.name} ×{m.count}
                  </span>
                ))}
              </div>
            )}

            {/* Urgences */}
            {data.urgences?.length > 0 && (
              <div style={{
                background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)",
                borderRadius: 12, padding: 20, marginBottom: 24
              }}>
                <div style={{ fontWeight: 600, marginBottom: 8, color: "#ef4444" }}>
                  🔥 Urgences ({data.urgences.length})
                </div>
                {data.urgences.map((u, i) => (
                  <span key={i} style={{
                    display: "inline-block", background: "#1a2234", padding: "4px 10px",
                    borderRadius: 6, margin: "2px 4px", fontSize: 13, fontFamily: "monospace"
                  }}>
                    {u.name} ×{u.count}
                  </span>
                ))}
              </div>
            )}

            {/* Recent Conversations */}
            {data.recentConversations?.length > 0 && (
              <div style={{ background: "#111827", border: "1px solid #1e293b", borderRadius: 12, padding: 20, marginBottom: 24 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: "#64748b", marginBottom: 12, paddingBottom: 8, borderBottom: "1px solid #1e293b" }}>
                  💬 Conversations récentes (7 jours) — {data.recentConversations.length}
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid #1e293b" }}>
                        <th style={{ padding: "8px", textAlign: "left", color: "#64748b", fontWeight: 500 }}>Date</th>
                        <th style={{ padding: "8px", textAlign: "left", color: "#64748b", fontWeight: 500 }}>1er message</th>
                        <th style={{ padding: "8px", textAlign: "center", color: "#64748b", fontWeight: 500 }}>Turns</th>
                        <th style={{ padding: "8px", textAlign: "center", color: "#64748b", fontWeight: 500 }}>Flow</th>
                        <th style={{ padding: "8px", textAlign: "center", color: "#64748b", fontWeight: 500 }}>Formulaire</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.recentConversations.map((c, i) => {
                        const d = new Date(String(c.date).replace(" ", "T"));
                        const dateStr = d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
                        const timeStr = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
                        return (
                          <tr key={i} style={{ borderBottom: "1px solid rgba(30,41,59,0.3)" }}>
                            <td style={{ padding: "8px", whiteSpace: "nowrap", color: "#94a3b8" }}>{dateStr} {timeStr}</td>
                            <td style={{ padding: "8px", maxWidth: 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.firstMsg || "-"}</td>
                            <td style={{ padding: "8px", textAlign: "center", fontFamily: "monospace", color: "#64748b" }}>{c.userTurns}</td>
                            <td style={{ padding: "8px", textAlign: "center", color: c.flowComplete ? "#8b5cf6" : "#374151" }}>{c.flowComplete ? "✓" : "—"}</td>
                            <td style={{ padding: "8px", textAlign: "center", color: c.hasForm ? "#22c55e" : "#374151" }}>{c.hasForm ? "✅" : "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

          </main>
        )}
      </div>
    </>
  );
}

function Card({ title, value, color, sub }) {
  return (
    <div style={{ background: "#111827", border: "1px solid #1e293b", borderRadius: 12, padding: 20 }}>
      <div style={{ fontSize: 12, fontWeight: 500, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 36, fontWeight: 700, letterSpacing: -1, color: color || "#e2e8f0" }}>{value}</div>
      {sub && <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function QualityCard({ label, count, target }) {
  const ok = count === 0;
  return (
    <div style={{ background: "#111827", border: "1px solid #1e293b", borderRadius: 12, padding: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <div>
        <span style={{ fontSize: 14 }}>{label}</span>
        {target && <span style={{ fontSize: 11, color: "#64748b", marginLeft: 8 }}>cible : {target}</span>}
      </div>
      <span style={{
        padding: "4px 12px", borderRadius: 20, fontSize: 13, fontWeight: 600, fontFamily: "monospace",
        background: ok ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
        color: ok ? "#22c55e" : "#ef4444"
      }}>
        {ok ? "✓ 0" : count}
      </span>
    </div>
  );
}

function RankCard({ title, items }) {
  return (
    <div style={{ background: "#111827", border: "1px solid #1e293b", borderRadius: 12, padding: 20 }}>
      <div style={{ fontSize: 15, fontWeight: 600, color: "#64748b", marginBottom: 12, paddingBottom: 8, borderBottom: "1px solid #1e293b" }}>{title}</div>
      {(!items || items.length === 0) ? (
        <div style={{ color: "#64748b", fontSize: 13 }}>Aucune donnée</div>
      ) : items.map((item, i) => (
        <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid rgba(30,41,59,0.3)", fontSize: 14 }}>
          <span>{i + 1}. {item.name}</span>
          <span style={{ fontFamily: "monospace", color: "#64748b", fontSize: 13 }}>{item.count}</span>
        </div>
      ))}
    </div>
  );
}
