// /pages/admin/magasins.js
// Dashboard Magasins Re-FAP — v3.0
// Onglets: Carter-Cash | Garages partenaires
// Sources: 🤖 Bot / 👤 Opérateur / 📞 Téléphone

import { useState, useEffect } from "react";
import Head from "next/head";
import dynamic from "next/dynamic";

const ADMIN_KEY = "refap2026admin";

function formatNum(n) {
  if (n === null || n === undefined) return "\u2014";
  return n.toLocaleString("fr-FR");
}

function Badge({ type }) {
  const isEquipe = type === "EQUIPE";
  return (
    <span style={{
      display: "inline-block", padding: "2px 8px", borderRadius: "4px",
      fontSize: "11px", fontWeight: 700, letterSpacing: "0.5px", textTransform: "uppercase",
      backgroundColor: isEquipe ? "#22c55e20" : "#94a3b820",
      color: isEquipe ? "#16a34a" : "#64748b",
      border: isEquipe ? "1px solid #22c55e40" : "1px solid #94a3b840",
    }}>
      {isEquipe ? "\u26a1 \u00c9quip\u00e9" : "\ud83d\udce6 D\u00e9p\u00f4t"}
    </span>
  );
}

const SOURCE_CONFIG = {
  CHATBOT: { emoji: "\ud83e\udd16", label: "Bot", color: "#8b5cf6", bg: "#8b5cf620" },
  HUMAN:   { emoji: "\ud83d\udc64", label: "Op\u00e9rateur", color: "#f59e0b", bg: "#f59e0b20" },
  PHONE:   { emoji: "\ud83d\udcde", label: "T\u00e9l\u00e9phone", color: "#3b82f6", bg: "#3b82f620" },
  FORM:    { emoji: "\ud83d\udcdd", label: "Formulaire", color: "#6b7280", bg: "#6b728020" },
};

const RESEAU_CONFIG = {
  MIDAS:        { emoji: "\ud83d\udfe1", color: "#eab308" },
  DELKO:        { emoji: "\ud83d\udfe2", color: "#22c55e" },
  NORAUTO:      { emoji: "\ud83d\udd35", color: "#3b82f6" },
  "FEU VERT":   { emoji: "\ud83d\udfe2", color: "#16a34a" },
  SPEEDY:       { emoji: "\ud83d\udfe0", color: "#f97316" },
  "POINT S":    { emoji: "\ud83d\udd34", color: "#ef4444" },
  INDEPENDANT:  { emoji: "\ud83d\udd27", color: "#64748b" },
};

function SourceBadges({ bySource }) {
  if (!bySource || Object.keys(bySource).length === 0) return <span style={{ color: "#cbd5e1" }}>{"\u2014"}</span>;
  return (
    <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", justifyContent: "center" }}>
      {Object.entries(bySource).filter(([k]) => k !== "UNKNOWN").sort((a, b) => b[1] - a[1]).map(([source, count]) => {
        const cfg = SOURCE_CONFIG[source] || { emoji: "\u2753", label: source, color: "#94a3b8", bg: "#94a3b820" };
        return (
          <span key={source} title={`${cfg.label} : ${count}`} style={{
            display: "inline-flex", alignItems: "center", gap: "3px",
            padding: "2px 6px", borderRadius: "4px", fontSize: "11px", fontWeight: 600,
            backgroundColor: cfg.bg, color: cfg.color, border: `1px solid ${cfg.color}30`,
          }}>
            {cfg.emoji} {count}
          </span>
        );
      })}
    </div>
  );
}

function OperatorList({ operators }) {
  if (!operators || Object.keys(operators).length === 0) return <span style={{ color: "#cbd5e1" }}>{"\u2014"}</span>;
  return (
    <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", justifyContent: "center" }}>
      {Object.entries(operators).sort((a, b) => b[1] - a[1]).map(([name, count]) => (
        <span key={name} style={{
          padding: "2px 6px", borderRadius: "4px", fontSize: "11px", fontWeight: 500,
          backgroundColor: "#fef3c720", color: "#92400e", border: "1px solid #f59e0b30",
        }}>
          {name} ({count})
        </span>
      ))}
    </div>
  );
}

function ReseauBadge({ reseau }) {
  const cfg = RESEAU_CONFIG[reseau] || RESEAU_CONFIG.INDEPENDANT;
  return (
    <span style={{
      display: "inline-block", padding: "2px 8px", borderRadius: "4px",
      fontSize: "11px", fontWeight: 700, letterSpacing: "0.3px",
      backgroundColor: cfg.color + "15", color: cfg.color,
      border: `1px solid ${cfg.color}30`,
    }}>
      {cfg.emoji} {reseau}
    </span>
  );
}

function KPICard({ label, value, sub, accent }) {
  return (
    <div style={{
      background: "#fff", borderRadius: "12px", padding: "20px 24px",
      boxShadow: "0 1px 3px rgba(0,0,0,0.06)", border: "1px solid #e2e8f0",
      flex: "1 1 180px", minWidth: "160px",
    }}>
      <div style={{ fontSize: "12px", color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px" }}>{label}</div>
      <div style={{ fontSize: "32px", fontWeight: 800, color: accent || "#0f172a", lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: "12px", color: "#94a3b8", marginTop: "6px" }}>{sub}</div>}
    </div>
  );
}

function KPICardSources({ label, value, bySource, accent }) {
  const sorted = bySource ? Object.entries(bySource).filter(([k]) => k !== "UNKNOWN").sort((a, b) => b[1] - a[1]) : [];
  const subText = sorted.map(([s, c]) => { const cfg = SOURCE_CONFIG[s]; return cfg ? `${cfg.emoji}${c}` : `${s}:${c}`; }).join("  ");
  return (
    <div style={{
      background: "#fff", borderRadius: "12px", padding: "20px 24px",
      boxShadow: "0 1px 3px rgba(0,0,0,0.06)", border: "1px solid #e2e8f0",
      flex: "1 1 180px", minWidth: "160px",
    }}>
      <div style={{ fontSize: "12px", color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px" }}>{label}</div>
      <div style={{ fontSize: "32px", fontWeight: 800, color: accent || "#0f172a", lineHeight: 1 }}>{value}</div>
      {subText && <div style={{ fontSize: "12px", color: "#94a3b8", marginTop: "6px" }}>{subText}</div>}
    </div>
  );
}

function MagasinsDashboard() {
  const [auth, setAuth] = useState(false);
  const [keyInput, setKeyInput] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [period, setPeriod] = useState("30");
  const [mode, setMode] = useState("internal");
  const [tab, setTab] = useState("cc"); // "cc" or "garages"
  const [error, setError] = useState(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("mode") === "cc") setMode("cc");
      if (sessionStorage.getItem("refap_admin") === ADMIN_KEY) setAuth(true);
    }
  }, []);

  useEffect(() => { if (auth) fetchData(); }, [auth, period, mode]);

  async function fetchData() {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/admin/magasins?period=${period}&mode=${mode}`);
      if (!res.ok) throw new Error(`Erreur ${res.status}`);
      setData(await res.json());
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  function handleLogin(e) {
    e.preventDefault();
    if (keyInput === ADMIN_KEY) { sessionStorage.setItem("refap_admin", ADMIN_KEY); setAuth(true); }
  }

  if (!auth) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "#f8fafc", fontFamily: "'Segoe UI', sans-serif" }}>
        <form onSubmit={handleLogin} style={{ background: "#fff", padding: "40px", borderRadius: "16px", boxShadow: "0 4px 24px rgba(0,0,0,0.08)", textAlign: "center" }}>
          <h2 style={{ margin: "0 0 20px", color: "#0f172a" }}>{"\ud83d\udd12"} Dashboard Magasins</h2>
          <input type="password" value={keyInput} onChange={e => setKeyInput(e.target.value)} placeholder="Cl\u00e9 admin"
            style={{ padding: "10px 16px", border: "1px solid #e2e8f0", borderRadius: "8px", fontSize: "14px", width: "220px" }} />
          <button type="submit" style={{ marginLeft: "8px", padding: "10px 20px", background: "#6bbd45", color: "#fff", border: "none", borderRadius: "8px", fontSize: "14px", fontWeight: 600, cursor: "pointer" }}>Entrer</button>
        </form>
      </div>
    );
  }

  const isCC = mode === "cc";
  const kpis = data?.kpis || {};
  const magasins = data?.magasins || [];
  const garagesList = data?.garages || [];

  return (
    <>
      <Head>
        <title>{isCC ? "Re-FAP \u00d7 Carter-Cash" : "Re-FAP Dashboard Magasins"}</title>
        <style>{`
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { background: #f1f5f9; font-family: 'Segoe UI', -apple-system, sans-serif; color: #0f172a; }
          @media (max-width: 768px) { .kpi-row { flex-direction: column !important; } .table-wrap { overflow-x: auto; } .table-wrap table { min-width: 700px; } }
        `}</style>
      </Head>

      <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "24px 16px" }}>
        {/* HEADER */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "28px", flexWrap: "wrap", gap: "12px" }}>
          <div>
            <h1 style={{ fontSize: "22px", fontWeight: 800 }}>
              {isCC ? "\ud83d\udcca Activit\u00e9 Magasins Re-FAP" : "\ud83d\udcca Dashboard Orientations"}
            </h1>
            <p style={{ fontSize: "13px", color: "#94a3b8", marginTop: "4px" }}>
              Carter-Cash \u00b7 Garages partenaires \u00b7 Sources \u00b7 Prestations
            </p>
          </div>
          <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
            {["7", "30", "90", "365"].map(p => (
              <button key={p} onClick={() => setPeriod(p)} style={{
                padding: "6px 14px", borderRadius: "6px",
                border: "1px solid " + (period === p ? "#6bbd45" : "#e2e8f0"),
                background: period === p ? "#6bbd45" : "#fff",
                color: period === p ? "#fff" : "#64748b",
                fontSize: "12px", fontWeight: 600, cursor: "pointer",
              }}>
                {p === "1" ? "24h" : p === "365" ? "1 an" : p + "j"}
              </button>
            ))}
            {!isCC && (
              <button onClick={() => setMode(mode === "internal" ? "cc" : "internal")} style={{
                marginLeft: "12px", padding: "6px 14px", borderRadius: "6px",
                border: "1px solid #e2e8f0", background: "#fff", color: "#64748b",
                fontSize: "12px", fontWeight: 600, cursor: "pointer",
              }}>
                {mode === "internal" ? "Vue CC \u2192" : "\u2190 Vue interne"}
              </button>
            )}
          </div>
        </div>

        {loading && <p style={{ textAlign: "center", padding: "40px", color: "#94a3b8" }}>Chargement\u2026</p>}
        {error && <p style={{ textAlign: "center", padding: "40px", color: "#ef4444" }}>Erreur : {error}</p>}

        {data && !loading && (
          <>
            {/* KPIs */}
            <div className="kpi-row" style={{ display: "flex", gap: "14px", marginBottom: "14px", flexWrap: "wrap" }}>
              <KPICardSources label="Orientations CC" value={formatNum(kpis.total_assignments)} bySource={kpis.by_source} accent="#6bbd45" />
              <KPICard label={"\ud83d\udd27 Garages"} value={formatNum(kpis.total_garage_orientations)} sub={kpis.total_garages_db ? `${kpis.total_garages_db} partenaires` : ""} accent="#8b5cf6" />
              <KPICard label="Total orient." value={formatNum(kpis.total_all)} accent="#0f172a" />
              <KPICard label="\u26a1 \u00c9quip\u00e9s" value={formatNum(kpis.equipe)} sub={kpis.total_assignments > 0 ? Math.round(100 * kpis.equipe / kpis.total_assignments) + "%" : "\u2014"} accent="#22c55e" />
            </div>
            {!isCC && (
              <div className="kpi-row" style={{ display: "flex", gap: "14px", marginBottom: "28px", flexWrap: "wrap" }}>
                <KPICard label="Leads CRM" value={formatNum(kpis.total_leads)} sub={kpis.leads_chatbot ? `${kpis.leads_chatbot} via chatbot` : "\u2014"} accent="#3b82f6" />
                <KPICard label="Conversations" value={formatNum(kpis.total_conversations)} sub={`Taux orient. ${kpis.taux_orientation || 0}%`} />
                {kpis.leads_meta > 0 && <KPICard label="Leads Meta" value={formatNum(kpis.leads_meta)} accent="#1877f2" />}
              </div>
            )}

            {/* TABS */}
            {!isCC && (
              <div style={{ display: "flex", gap: "0", marginBottom: "0", borderBottom: "2px solid #e2e8f0" }}>
                {[
                  { id: "cc", label: "\ud83c\udfea Carter-Cash", count: magasins.length },
                  { id: "garages", label: "\ud83d\udd27 Garages partenaires", count: garagesList.length },
                ].map(t => (
                  <button key={t.id} onClick={() => setTab(t.id)} style={{
                    padding: "12px 20px", fontSize: "13px", fontWeight: 700,
                    background: "transparent", border: "none", cursor: "pointer",
                    borderBottom: tab === t.id ? "3px solid #6bbd45" : "3px solid transparent",
                    color: tab === t.id ? "#0f172a" : "#94a3b8",
                    marginBottom: "-2px",
                  }}>
                    {t.label} ({t.count})
                  </button>
                ))}
              </div>
            )}

            {/* TABLE CC */}
            {(tab === "cc" || isCC) && (
              <div style={{ background: "#fff", borderRadius: "0 0 12px 12px", border: "1px solid #e2e8f0", borderTop: "none", overflow: "hidden" }}>
                <div className="table-wrap">
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                    <thead>
                      <tr style={{ borderBottom: "2px solid #f1f5f9" }}>
                        <th style={thStyle}>#</th>
                        <th style={{ ...thStyle, textAlign: "left" }}>Magasin</th>
                        <th style={thStyle}>Type</th>
                        <th style={thStyle}>Orient.</th>
                        <th style={thStyle}>Source</th>
                        {!isCC && <th style={thStyle}>Orient\u00e9 par</th>}
                        <th style={thStyle}>Leads</th>
                        {!isCC && <th style={thStyle}>Raison</th>}
                        <th style={thStyle}>Prestas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {magasins.length === 0 && (
                        <tr><td colSpan={isCC ? 7 : 9} style={{ padding: "32px", textAlign: "center", color: "#94a3b8" }}>Aucune orientation sur cette p\u00e9riode.</td></tr>
                      )}
                      {magasins.map((m, i) => {
                        const topReason = m.reasons ? Object.entries(m.reasons).sort((a, b) => b[1] - a[1])[0]?.[0] || "\u2014" : "\u2014";
                        return (
                          <tr key={i} style={{ borderBottom: "1px solid #f8fafc" }}>
                            <td style={tdStyle}>{i + 1}</td>
                            <td style={{ ...tdStyle, textAlign: "left", fontWeight: 600 }}>
                              {m.name || m.city}
                              {!isCC && m.department && <span style={{ color: "#94a3b8", fontWeight: 400, marginLeft: "6px" }}>({m.department})</span>}
                            </td>
                            <td style={tdStyle}><Badge type={m.type} /></td>
                            <td style={{ ...tdStyle, fontWeight: 700, fontSize: "15px", color: m.assignments > 0 ? "#0f172a" : "#cbd5e1" }}>{m.assignments}</td>
                            <td style={tdStyle}><SourceBadges bySource={m.by_source} /></td>
                            {!isCC && <td style={tdStyle}><OperatorList operators={m.operators} /></td>}
                            <td style={tdStyle}>
                              {(m.leads || 0) > 0 ? (
                                <span style={{ fontWeight: 700, color: "#3b82f6" }}>
                                  {m.leads}
                                  {m.leads_chatbot > 0 && <span style={{ fontSize: "10px", color: "#94a3b8", marginLeft: "4px" }}>({m.leads_chatbot}{"\ud83e\udd16"})</span>}
                                </span>
                              ) : <span style={{ color: "#cbd5e1" }}>{"\u2014"}</span>}
                            </td>
                            {!isCC && <td style={{ ...tdStyle, fontSize: "11px", color: "#64748b", maxWidth: "140px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{topReason}</td>}
                            <td style={tdStyle}>
                              {m.prestations ? (
                                <span style={{ color: "#16a34a", fontWeight: 600 }}>{m.prestations.qty} FAP \u00b7 {formatNum(Math.round(m.prestations.ca_ht))}\u20ac</span>
                              ) : <span style={{ color: "#cbd5e1" }}>{"\u2014"}</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TABLE GARAGES */}
            {tab === "garages" && !isCC && (
              <div style={{ background: "#fff", borderRadius: "0 0 12px 12px", border: "1px solid #e2e8f0", borderTop: "none", overflow: "hidden" }}>
                {/* Réseau breakdown */}
                {kpis.garage_by_reseau && Object.keys(kpis.garage_by_reseau).length > 0 && (
                  <div style={{ padding: "14px 20px", borderBottom: "1px solid #f1f5f9", display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
                    <span style={{ fontSize: "12px", color: "#94a3b8", fontWeight: 600, textTransform: "uppercase" }}>Par r\u00e9seau :</span>
                    {Object.entries(kpis.garage_by_reseau).sort((a, b) => b[1] - a[1]).map(([reseau, count]) => {
                      const cfg = RESEAU_CONFIG[reseau] || RESEAU_CONFIG.INDEPENDANT;
                      return (
                        <span key={reseau} style={{
                          display: "inline-flex", alignItems: "center", gap: "4px",
                          padding: "4px 10px", borderRadius: "6px", fontSize: "12px", fontWeight: 700,
                          backgroundColor: cfg.color + "15", color: cfg.color,
                          border: `1px solid ${cfg.color}25`,
                        }}>
                          {cfg.emoji} {reseau} : {count}
                        </span>
                      );
                    })}
                  </div>
                )}
                <div className="table-wrap">
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                    <thead>
                      <tr style={{ borderBottom: "2px solid #f1f5f9" }}>
                        <th style={thStyle}>#</th>
                        <th style={{ ...thStyle, textAlign: "left" }}>Garage</th>
                        <th style={thStyle}>R\u00e9seau</th>
                        <th style={thStyle}>Ville</th>
                        <th style={thStyle}>Orientations</th>
                        <th style={thStyle}>Orient\u00e9 par</th>
                      </tr>
                    </thead>
                    <tbody>
                      {garagesList.length === 0 && (
                        <tr><td colSpan={6} style={{ padding: "32px", textAlign: "center", color: "#94a3b8" }}>Aucune orientation garage sur cette p\u00e9riode.</td></tr>
                      )}
                      {garagesList.map((g, i) => (
                        <tr key={i} style={{ borderBottom: "1px solid #f8fafc" }}>
                          <td style={tdStyle}>{i + 1}</td>
                          <td style={{ ...tdStyle, textAlign: "left", fontWeight: 600 }}>{g.nom}</td>
                          <td style={tdStyle}><ReseauBadge reseau={g.reseau} /></td>
                          <td style={tdStyle}>{g.ville || "\u2014"}</td>
                          <td style={{ ...tdStyle, fontWeight: 700, fontSize: "15px" }}>{g.orientations}</td>
                          <td style={tdStyle}><OperatorList operators={g.operators} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* LÉGENDE */}
            <div style={{ marginTop: "16px", padding: "12px 16px", background: "#fff", borderRadius: "8px", border: "1px solid #e2e8f0", display: "flex", gap: "16px", flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontSize: "11px", color: "#94a3b8", fontWeight: 600, textTransform: "uppercase" }}>Sources :</span>
              {Object.entries(SOURCE_CONFIG).map(([key, cfg]) => (
                <span key={key} style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "11px", color: cfg.color }}>
                  {cfg.emoji} {cfg.label}
                </span>
              ))}
            </div>

            <div style={{ marginTop: "20px", textAlign: "center", fontSize: "11px", color: "#94a3b8" }}>
              Re-FAP \u2014 Dashboard v3.0 \u00b7 P\u00e9riode : {period === "1" ? "24h" : period === "365" ? "1 an" : period + " jours"} \u00b7 {new Date().toLocaleDateString("fr-FR")}
            </div>
          </>
        )}
      </div>
    </>
  );
}

const thStyle = { padding: "10px 12px", textAlign: "center", fontSize: "11px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.3px" };
const tdStyle = { padding: "10px 12px", textAlign: "center" };

export default dynamic(() => Promise.resolve(MagasinsDashboard), { ssr: false });
