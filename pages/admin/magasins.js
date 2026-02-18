// /pages/admin/magasins.js
// Dashboard Magasins Re-FAP — Interne + Version filtrée CC
// Usage: /admin/magasins (interne) ou /admin/magasins?mode=cc (Carter-Cash)

import { useState, useEffect } from "react";
import Head from "next/head";

const ADMIN_KEY = "refap2026admin";

function formatNum(n) {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("fr-FR");
}

function Badge({ type }) {
  const isEquipe = type === "EQUIPE";
  return (
    <span style={{
      display: "inline-block",
      padding: "2px 8px",
      borderRadius: "4px",
      fontSize: "11px",
      fontWeight: 700,
      letterSpacing: "0.5px",
      textTransform: "uppercase",
      backgroundColor: isEquipe ? "#22c55e20" : "#94a3b820",
      color: isEquipe ? "#16a34a" : "#64748b",
      border: isEquipe ? "1px solid #22c55e40" : "1px solid #94a3b840",
    }}>
      {isEquipe ? "⚡ Équipé" : "📦 Dépôt"}
    </span>
  );
}

function KPICard({ label, value, sub, accent }) {
  return (
    <div style={{
      background: "#fff",
      borderRadius: "12px",
      padding: "20px 24px",
      boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
      border: "1px solid #e2e8f0",
      flex: "1 1 180px",
      minWidth: "160px",
    }}>
      <div style={{ fontSize: "12px", color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px" }}>
        {label}
      </div>
      <div style={{ fontSize: "32px", fontWeight: 800, color: accent || "#0f172a", lineHeight: 1 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: "12px", color: "#94a3b8", marginTop: "6px" }}>{sub}</div>}
    </div>
  );
}

export default function MagasinsDashboard() {
  const [auth, setAuth] = useState(false);
  const [keyInput, setKeyInput] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [period, setPeriod] = useState("30");
  const [mode, setMode] = useState("internal");
  const [error, setError] = useState(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("mode") === "cc") setMode("cc");
      if (sessionStorage.getItem("refap_admin") === ADMIN_KEY) setAuth(true);
    }
  }, []);

  useEffect(() => {
    if (auth) fetchData();
  }, [auth, period, mode]);

  async function fetchData() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/magasins?period=${period}&mode=${mode}`);
      if (!res.ok) throw new Error(`Erreur ${res.status}`);
      const json = await res.json();
      setData(json);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function handleLogin(e) {
    e.preventDefault();
    if (keyInput === ADMIN_KEY) {
      sessionStorage.setItem("refap_admin", ADMIN_KEY);
      setAuth(true);
    }
  }

  if (!auth) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "#f8fafc", fontFamily: "'Segoe UI', sans-serif" }}>
        <form onSubmit={handleLogin} style={{ background: "#fff", padding: "40px", borderRadius: "16px", boxShadow: "0 4px 24px rgba(0,0,0,0.08)", textAlign: "center" }}>
          <h2 style={{ margin: "0 0 20px", color: "#0f172a" }}>🔒 Dashboard Magasins</h2>
          <input
            type="password"
            value={keyInput}
            onChange={e => setKeyInput(e.target.value)}
            placeholder="Clé admin"
            style={{ padding: "10px 16px", border: "1px solid #e2e8f0", borderRadius: "8px", fontSize: "14px", width: "220px" }}
          />
          <button type="submit" style={{ marginLeft: "8px", padding: "10px 20px", background: "#6bbd45", color: "#fff", border: "none", borderRadius: "8px", fontSize: "14px", fontWeight: 600, cursor: "pointer" }}>
            Entrer
          </button>
        </form>
      </div>
    );
  }

  const isCC = mode === "cc";
  const kpis = data?.kpis || {};
  const magasins = data?.magasins || [];

  return (
    <>
      <Head>
        <title>{isCC ? "Re-FAP × Carter-Cash" : "Re-FAP Dashboard Magasins"}</title>
        <style>{`
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { background: #f1f5f9; font-family: 'Segoe UI', -apple-system, sans-serif; color: #0f172a; }
          @media (max-width: 768px) {
            .kpi-row { flex-direction: column !important; }
            .table-wrap { overflow-x: auto; }
            .table-wrap table { min-width: 600px; }
          }
        `}</style>
      </Head>

      <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "24px 16px" }}>
        {/* HEADER */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "28px", flexWrap: "wrap", gap: "12px" }}>
          <div>
            <h1 style={{ fontSize: "22px", fontWeight: 800, color: "#0f172a" }}>
              {isCC ? "📊 Activité Magasins Re-FAP" : "📊 Dashboard Magasins — Interne"}
            </h1>
            <p style={{ fontSize: "13px", color: "#94a3b8", marginTop: "4px" }}>
              {isCC ? "Orientations chatbot par magasin Carter-Cash" : "Attribution centre · Orientations · Prestations"}
            </p>
          </div>
          <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
            {["1", "7", "30"].map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                style={{
                  padding: "6px 14px",
                  borderRadius: "6px",
                  border: "1px solid " + (period === p ? "#6bbd45" : "#e2e8f0"),
                  background: period === p ? "#6bbd45" : "#fff",
                  color: period === p ? "#fff" : "#64748b",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {p === "1" ? "24h" : p + "j"}
              </button>
            ))}
            {!isCC && (
              <button
                onClick={() => setMode(mode === "internal" ? "cc" : "internal")}
                style={{
                  marginLeft: "12px",
                  padding: "6px 14px",
                  borderRadius: "6px",
                  border: "1px solid #e2e8f0",
                  background: "#fff",
                  color: "#64748b",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {mode === "internal" ? "Vue CC →" : "← Vue interne"}
              </button>
            )}
          </div>
        </div>

        {loading && <p style={{ textAlign: "center", padding: "40px", color: "#94a3b8" }}>Chargement…</p>}
        {error && <p style={{ textAlign: "center", padding: "40px", color: "#ef4444" }}>Erreur : {error}</p>}

        {data && !loading && (
          <>
            {/* KPIs */}
            <div className="kpi-row" style={{ display: "flex", gap: "14px", marginBottom: "28px", flexWrap: "wrap" }}>
              <KPICard label="Orientations" value={formatNum(kpis.total_assignments)} accent="#6bbd45" />
              <KPICard label="Équipés" value={formatNum(kpis.equipe)} sub={kpis.total_assignments > 0 ? Math.round(100 * kpis.equipe / kpis.total_assignments) + "%" : "—"} accent="#22c55e" />
              <KPICard label="Dépôts" value={formatNum(kpis.depot)} sub={kpis.total_assignments > 0 ? Math.round(100 * kpis.depot / kpis.total_assignments) + "%" : "—"} accent="#64748b" />
              {!isCC && <KPICard label="Conversations" value={formatNum(kpis.total_conversations)} sub={`Taux orient. ${kpis.taux_orientation || 0}%`} />}
            </div>

            {/* TABLE MAGASINS */}
            <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", overflow: "hidden" }}>
              <div style={{ padding: "16px 20px", borderBottom: "1px solid #f1f5f9" }}>
                <h2 style={{ fontSize: "15px", fontWeight: 700 }}>
                  Top magasins ({magasins.length})
                </h2>
              </div>
              <div className="table-wrap">
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                  <thead>
                    <tr style={{ borderBottom: "2px solid #f1f5f9" }}>
                      <th style={thStyle}>#</th>
                      <th style={{ ...thStyle, textAlign: "left" }}>Magasin</th>
                      <th style={thStyle}>Type</th>
                      <th style={thStyle}>Orientations</th>
                      {!isCC && <th style={thStyle}>Dist. moy.</th>}
                      {!isCC && <th style={thStyle}>Raison princ.</th>}
                      <th style={thStyle}>Prestas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {magasins.length === 0 && (
                      <tr>
                        <td colSpan={isCC ? 5 : 7} style={{ padding: "32px", textAlign: "center", color: "#94a3b8" }}>
                          Aucune orientation sur cette période. Les données apparaîtront quand le chatbot orientera des clients.
                        </td>
                      </tr>
                    )}
                    {magasins.map((m, i) => {
                      const topReason = m.reasons
                        ? Object.entries(m.reasons).sort((a, b) => b[1] - a[1])[0]?.[0] || "—"
                        : "—";
                      return (
                        <tr key={i} style={{ borderBottom: "1px solid #f8fafc" }}>
                          <td style={tdStyle}>{i + 1}</td>
                          <td style={{ ...tdStyle, textAlign: "left", fontWeight: 600 }}>
                            {m.name || m.city}
                            {!isCC && m.department && (
                              <span style={{ color: "#94a3b8", fontWeight: 400, marginLeft: "6px" }}>({m.department})</span>
                            )}
                          </td>
                          <td style={tdStyle}><Badge type={m.type} /></td>
                          <td style={{ ...tdStyle, fontWeight: 700, fontSize: "15px", color: m.assignments > 0 ? "#0f172a" : "#cbd5e1" }}>
                            {m.assignments}
                          </td>
                          {!isCC && <td style={tdStyle}>{m.avg_distance_km ? m.avg_distance_km + " km" : "—"}</td>}
                          {!isCC && <td style={{ ...tdStyle, fontSize: "11px", color: "#64748b", maxWidth: "140px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{topReason}</td>}
                          <td style={tdStyle}>
                            {m.prestations ? (
                              <span style={{ color: "#16a34a", fontWeight: 600 }}>
                                {m.prestations.qty} FAP · {formatNum(Math.round(m.prestations.ca_ht))}€
                              </span>
                            ) : (
                              <span style={{ color: "#cbd5e1" }}>—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* FOOTER */}
            <div style={{ marginTop: "20px", textAlign: "center", fontSize: "11px", color: "#94a3b8" }}>
              {isCC ? "Re-FAP × Carter-Cash — Données agrégées" : "Re-FAP — Dashboard interne"} · Période : {period === "1" ? "24h" : period + " jours"} · {new Date().toLocaleDateString("fr-FR")}
            </div>
          </>
        )}
      </div>
    </>
  );
}

const thStyle = {
  padding: "10px 12px",
  textAlign: "center",
  fontSize: "11px",
  fontWeight: 700,
  color: "#94a3b8",
  textTransform: "uppercase",
  letterSpacing: "0.3px",
};

const tdStyle = {
  padding: "10px 12px",
  textAlign: "center",
};
