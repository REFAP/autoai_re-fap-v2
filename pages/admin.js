// /pages/admin.js
// FAPexpert Admin Dashboard — Page Next.js
// Appelle /api/admin/stats directement (même domaine)

import { useState, useEffect, useCallback } from "react";
import Head from "next/head";

const STORAGE_KEY = "fapexpert_admin_token";

export default function AdminDashboard() {
  const [token, setToken] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    if (saved) setToken(saved);
  }, []);

  const fetchData = useCallback(async (t) => {
    setLoading(true);
    setError("");
    try {
      const resp = await fetch(`/api/admin/stats?token=${encodeURIComponent(t)}`);
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || `Erreur ${resp.status}`);
      }
      const json = await resp.json();
      setData(json);
      setAuthenticated(true);
      localStorage.setItem(STORAGE_KEY, t);
    } catch (err) {
      setError(err.message);
      setAuthenticated(false);
    }
    setLoading(false);
  }, []);

  const handleLogin = () => { if (token.trim()) fetchData(token.trim()); };

  useEffect(() => {
    if (authenticated && token) {
      const interval = setInterval(() => fetchData(token), 5 * 60 * 1000);
      return () => clearInterval(interval);
    }
  }, [authenticated, token, fetchData]);

  if (!authenticated) {
    return (
      <>
        <Head><title>FAPexpert Admin</title></Head>
        <div style={{
          minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
          background: "#0a0e17", fontFamily: "'DM Sans', sans-serif", color: "#e2e8f0"
        }}>
          <div style={{
            background: "#111827", border: "1px solid #1e293b", borderRadius: 16,
            padding: 40, width: 380, textAlign: "center"
          }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🔧</div>
            <h2 style={{ marginBottom: 8, fontSize: 20 }}>FAPexpert Admin</h2>
            <p style={{ color: "#64748b", fontSize: 14, marginBottom: 24 }}>Dashboard de monitoring</p>
            <input
              type="password"
              value={token}
              onChange={e => setToken(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleLogin()}
              placeholder="Token d'accès"
              style={{
                width: "100%", padding: "12px 16px", background: "#0a0e17",
                border: "1px solid #1e293b", borderRadius: 8, color: "#e2e8f0",
                fontFamily: "monospace", fontSize: 14, marginBottom: 16, outline: "none"
              }}
            />
            <button
              onClick={handleLogin}
              disabled={loading}
              style={{
                width: "100%", padding: 12, background: "#22c55e", color: "#000",
                border: "none", borderRadius: 8, fontWeight: 600, fontSize: 14,
                cursor: loading ? "wait" : "pointer"
              }}
            >
              {loading ? "Connexion..." : "Accéder"}
            </button>
            {error && <div style={{ color: "#ef4444", fontSize: 13, marginTop: 8 }}>{error}</div>}
          </div>
        </div>
      </>
    );
  }

  // Dashboard iframe approach: load standalone HTML with data injection
  // OR simply redirect to the standalone version
  // For simplicity: render a minimal React dashboard
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
            }}>v6.1.1</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 8, height: 8, background: "#22c55e", borderRadius: "50%"
            }}></div>
            <span style={{ fontSize: 12, color: "#64748b", fontFamily: "monospace" }}>
              {new Date().toLocaleTimeString("fr-FR")}
            </span>
            <button
              onClick={() => fetchData(token)}
              disabled={loading}
              style={{
                background: "#1a2234", border: "1px solid #1e293b", color: "#e2e8f0",
                padding: "8px 16px", borderRadius: 8, cursor: "pointer", fontFamily: "inherit", fontSize: 13
              }}
            >
              {loading ? "..." : "↻ Rafraîchir"}
            </button>
          </div>
        </header>

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

            {/* Quality badges */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
              <QualityCard label="Closing prématuré Mistral" count={data.quality.mistralClosing.count} />
              <QualityCard label='Mentions "1500€"' count={data.quality.mentions1500.count} />
            </div>

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

            {/* Recent Conversations */}
            {data.recentConversations?.length > 0 && (
              <div style={{ background: "#111827", border: "1px solid #1e293b", borderRadius: 12, padding: 20, marginBottom: 24 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: "#64748b", marginBottom: 12, paddingBottom: 8, borderBottom: "1px solid #1e293b" }}>
                  💬 Dernières conversations ({data.recentConversations.length})
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid #1e293b" }}>
                        <th style={{ padding: "8px", textAlign: "left", color: "#64748b", fontWeight: 500 }}>Date</th>
                        <th style={{ padding: "8px", textAlign: "left", color: "#64748b", fontWeight: 500 }}>1er message</th>
                        <th style={{ padding: "8px", textAlign: "center", color: "#64748b", fontWeight: 500 }}>Turns</th>
                        <th style={{ padding: "8px", textAlign: "center", color: "#64748b", fontWeight: 500 }}>Flow</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.recentConversations.map((c, i) => {
                        const d = new Date(String(c.date).replace(" ", "T"));
                        const dateStr = d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
                        const timeStr = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
                        const flowSteps = [
                          c.hasVehicle && "🚗",
                          c.hasModel && "📋",
                          c.hasKm && "🔢",
                          c.hasAttempts && "🔧",
                          c.hasExpert && "🎯",
                          c.hasClosing && "📞",
                          c.hasForm && "📝",
                        ].filter(Boolean).join(" ");
                        return (
                          <tr key={i} style={{ borderBottom: "1px solid rgba(30,41,59,0.3)" }}>
                            <td style={{ padding: "8px", whiteSpace: "nowrap", color: "#94a3b8" }}>{dateStr} {timeStr}</td>
                            <td style={{ padding: "8px", maxWidth: 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.firstMsg || "-"}</td>
                            <td style={{ padding: "8px", textAlign: "center", fontFamily: "monospace", color: "#64748b" }}>{c.userTurns}</td>
                            <td style={{ padding: "8px", textAlign: "center", letterSpacing: 2 }}>{flowSteps || "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

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

function QualityCard({ label, count }) {
  const ok = count === 0;
  return (
    <div style={{ background: "#111827", border: "1px solid #1e293b", borderRadius: 12, padding: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <span style={{ fontSize: 14 }}>{label}</span>
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
