// /pages/admin/social.js
// Dashboard Social — Meta Page + YouTube Analytics
// Style cohérent avec /pages/admin.js (dark theme)

import { useState, useEffect, useCallback } from "react";
import Head from "next/head";

const TOKEN = process.env.NEXT_PUBLIC_ADMIN_TOKEN || "";

const C = {
  bg: "#0a0e17",
  surface: "#111827",
  border: "#1e293b",
  accent: "#e8402a",
  blue: "#3b82f6",
  green: "#22c55e",
  yellow: "#f59e0b",
  purple: "#8b5cf6",
  meta: "#1877f2",
  youtube: "#ff0000",
  muted: "#64748b",
  text: "#e2e8f0",
  sub: "#94a3b8",
};

function Card({ title, value, sub, color, icon }) {
  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`,
      borderRadius: 12, padding: 20, flex: "1 1 180px", minWidth: 160,
    }}>
      <div style={{ fontSize: 12, fontWeight: 500, color: C.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
        {icon && <span style={{ marginRight: 6 }}>{icon}</span>}{title}
      </div>
      <div style={{ fontSize: 32, fontWeight: 700, letterSpacing: -1, color: color || C.text }}>{value}</div>
      {sub && <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function MiniBar({ label, value, maxValue, color }) {
  const pct = maxValue > 0 ? (value / maxValue) * 100 : 0;
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ color: C.sub, fontSize: 12 }}>{label}</span>
        <span style={{ color: C.text, fontSize: 12, fontFamily: "monospace" }}>{value.toLocaleString("fr-FR")}</span>
      </div>
      <div style={{ height: 5, background: C.border, borderRadius: 3, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 3, transition: "width 0.6s" }} />
      </div>
    </div>
  );
}

function SyncStatus({ log }) {
  if (!log) return null;
  const color = log.status === "success" ? C.green : log.status === "partial" ? C.yellow : C.accent;
  const d = new Date(log.finished_at);
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      padding: "3px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600,
      background: color + "18", color,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: color }} />
      {log.status} — {d.toLocaleDateString("fr-FR")} {d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
      {log.rows_synced > 0 && ` — ${log.rows_synced} lignes`}
    </span>
  );
}

export default function SocialDashboard() {
  const [meta, setMeta] = useState(null);
  const [youtube, setYoutube] = useState(null);
  const [ytTraffic, setYtTraffic] = useState(null);
  const [syncLogs, setSyncLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [syncing, setSyncing] = useState({});

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/social-data?token=${TOKEN}`);
      if (!res.ok) throw new Error(`Erreur ${res.status}`);
      const json = await res.json();
      setMeta(json.meta);
      setYoutube(json.youtube);
      setYtTraffic(json.youtube_traffic);
      setSyncLogs(json.sync_logs || []);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const triggerSync = async (connector) => {
    setSyncing((s) => ({ ...s, [connector]: true }));
    try {
      const endpoint = connector === "meta" ? "/api/cron/meta-insights" : "/api/cron/youtube-analytics";
      await fetch(`${endpoint}?secret=${TOKEN}`);
      await fetchData();
    } catch {}
    setSyncing((s) => ({ ...s, [connector]: false }));
  };

  const fmt = (n) => n != null ? n.toLocaleString("fr-FR") : "—";
  const fmtDec = (n) => n != null ? Number(n).toLocaleString("fr-FR", { maximumFractionDigits: 1 }) : "—";

  // Aggregate YouTube data
  const ytTotal = youtube?.reduce((acc, d) => ({
    views: acc.views + (d.views || 0),
    watchTime: acc.watchTime + Number(d.watch_time_min || 0),
    subsGained: acc.subsGained + (d.subscribers_gained || 0),
    likes: acc.likes + (d.likes || 0),
    comments: acc.comments + (d.comments || 0),
    shares: acc.shares + (d.shares || 0),
  }), { views: 0, watchTime: 0, subsGained: 0, likes: 0, comments: 0, shares: 0 });

  // Latest meta entry
  const latestMeta = meta?.[0];

  // Traffic sources aggregation
  const trafficAgg = {};
  for (const row of ytTraffic || []) {
    if (!trafficAgg[row.source_type]) trafficAgg[row.source_type] = { views: 0, watchTime: 0 };
    trafficAgg[row.source_type].views += row.views || 0;
    trafficAgg[row.source_type].watchTime += Number(row.watch_time_min || 0);
  }
  const trafficSorted = Object.entries(trafficAgg).sort((a, b) => b[1].views - a[1].views);
  const maxTrafficViews = trafficSorted[0]?.[1]?.views || 1;

  const metaLog = syncLogs.find((l) => l.connector === "meta");
  const ytLog = syncLogs.find((l) => l.connector === "youtube");

  return (
    <>
      <Head><title>Re-FAP — Social Dashboard</title></Head>
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
            <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Social Dashboard</h1>
            <span style={{ fontSize: 12, color: C.muted, background: "#1a2234", padding: "2px 8px", borderRadius: 4 }}>Meta + YouTube</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button onClick={fetchData} disabled={loading} style={{
              background: "#1a2234", border: `1px solid ${C.border}`, color: C.text,
              padding: "8px 16px", borderRadius: 8, cursor: loading ? "wait" : "pointer",
              fontFamily: "inherit", fontSize: 13,
            }}>
              {loading ? "..." : "Rafraichir"}
            </button>
          </div>
        </header>

        {loading && !meta && !youtube && (
          <div style={{ textAlign: "center", padding: 80, color: C.muted }}>Chargement...</div>
        )}

        {error && (
          <div style={{ textAlign: "center", padding: 40, color: C.accent }}>{error}</div>
        )}

        {!loading && (
          <main style={{ maxWidth: 1400, margin: "0 auto", padding: "24px 32px" }}>

            {/* ══════════════ META SECTION ══════════════ */}
            <div style={{ marginBottom: 36 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 20 }}>f</span>
                  <span style={{ color: C.meta, fontSize: 16, fontWeight: 700 }}>Meta / Facebook</span>
                  <SyncStatus log={metaLog} />
                </div>
                <button onClick={() => triggerSync("meta")} disabled={syncing.meta} style={{
                  background: C.meta + "22", border: `1px solid ${C.meta}44`, color: C.meta,
                  padding: "6px 14px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 600,
                }}>
                  {syncing.meta ? "Sync..." : "Sync Meta"}
                </button>
              </div>

              {latestMeta ? (
                <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                  <Card title="Fans" value={fmt(latestMeta.fans_count)} color={C.meta} icon="f" />
                  <Card title="Impressions" value={fmt(latestMeta.impressions)} sub={latestMeta.impressions === null ? "Permission manquante" : `${latestMeta.date}`} color={C.blue} />
                  <Card title="Reach" value={fmt(latestMeta.reach)} sub={latestMeta.reach === null ? "pages_read_engagement requis" : ""} color={C.purple} />
                  <Card title="Engagements" value={fmt(latestMeta.engagements)} color={C.green} />
                  <Card title="Vues page" value={fmt(latestMeta.page_views)} color={C.yellow} />
                </div>
              ) : (
                <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 32, textAlign: "center", color: C.muted }}>
                  Aucune donnee Meta. Lancez un sync pour tester la connexion.
                </div>
              )}

              {/* Meta daily trend */}
              {meta?.length > 1 && (
                <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20, marginTop: 16 }}>
                  <div style={{ fontSize: 13, color: C.muted, fontWeight: 600, marginBottom: 12 }}>Historique fans</div>
                  <div style={{ display: "flex", gap: 8, alignItems: "flex-end", height: 80 }}>
                    {meta.slice(0, 30).reverse().map((d, i) => {
                      const min = Math.min(...meta.map((m) => m.fans_count || 0).filter(Boolean));
                      const max = Math.max(...meta.map((m) => m.fans_count || 0));
                      const range = max - min || 1;
                      const h = ((d.fans_count || min) - min) / range * 60 + 10;
                      return (
                        <div key={i} title={`${d.date}: ${fmt(d.fans_count)}`} style={{
                          flex: 1, height: h, background: C.meta, borderRadius: 2, minWidth: 4, maxWidth: 20,
                          opacity: 0.5 + (i / meta.length) * 0.5,
                        }} />
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* ══════════════ YOUTUBE SECTION ══════════════ */}
            <div style={{ marginBottom: 36 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 18, color: C.youtube }}>&#9654;</span>
                  <span style={{ color: C.youtube, fontSize: 16, fontWeight: 700 }}>YouTube Analytics</span>
                  <SyncStatus log={ytLog} />
                </div>
                <button onClick={() => triggerSync("youtube")} disabled={syncing.youtube} style={{
                  background: C.youtube + "22", border: `1px solid ${C.youtube}44`, color: C.youtube,
                  padding: "6px 14px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 600,
                }}>
                  {syncing.youtube ? "Sync..." : "Sync YouTube"}
                </button>
              </div>

              {ytTotal && youtube?.length > 0 ? (
                <>
                  {/* KPIs */}
                  <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 16 }}>
                    <Card title="Vues" value={fmt(ytTotal.views)} sub={`${youtube.length} jours`} color={C.youtube} />
                    <Card title="Watch time" value={`${fmtDec(ytTotal.watchTime / 60)}h`} sub={`${fmt(Math.round(ytTotal.watchTime))} min`} color={C.blue} />
                    <Card title="Abonnes gagnes" value={`+${fmt(ytTotal.subsGained)}`} color={C.green} />
                    <Card title="Likes" value={fmt(ytTotal.likes)} color={C.yellow} />
                    <Card title="Commentaires" value={fmt(ytTotal.comments)} color={C.purple} />
                    <Card title="Partages" value={fmt(ytTotal.shares)} color={C.meta} />
                  </div>

                  {/* Daily views chart */}
                  <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                    <div style={{ flex: 2, minWidth: 300, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20 }}>
                      <div style={{ fontSize: 13, color: C.muted, fontWeight: 600, marginBottom: 12 }}>Vues par jour</div>
                      <div style={{ display: "flex", gap: 3, alignItems: "flex-end", height: 100 }}>
                        {youtube.slice().reverse().map((d, i) => {
                          const maxViews = Math.max(...youtube.map((r) => r.views || 0)) || 1;
                          const h = ((d.views || 0) / maxViews) * 90 + 5;
                          const dayLabel = new Date(d.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
                          return (
                            <div key={i} title={`${dayLabel}: ${fmt(d.views)} vues`} style={{
                              flex: 1, height: h, background: C.youtube, borderRadius: 2, minWidth: 3, maxWidth: 18,
                              opacity: 0.4 + (i / youtube.length) * 0.6,
                            }} />
                          );
                        })}
                      </div>
                    </div>

                    {/* Traffic sources */}
                    <div style={{ flex: 1, minWidth: 280, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20 }}>
                      <div style={{ fontSize: 13, color: C.muted, fontWeight: 600, marginBottom: 12 }}>Sources de trafic</div>
                      {trafficSorted.length > 0 ? trafficSorted.slice(0, 8).map(([source, data]) => (
                        <MiniBar
                          key={source}
                          label={formatSourceName(source)}
                          value={data.views}
                          maxValue={maxTrafficViews}
                          color={getSourceColor(source)}
                        />
                      )) : (
                        <div style={{ color: C.muted, fontSize: 13 }}>Aucune donnee</div>
                      )}
                    </div>
                  </div>

                  {/* Watch time per day */}
                  <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20, marginTop: 16 }}>
                    <div style={{ fontSize: 13, color: C.muted, fontWeight: 600, marginBottom: 12 }}>Watch time par jour (minutes)</div>
                    <div style={{ display: "flex", gap: 3, alignItems: "flex-end", height: 80 }}>
                      {youtube.slice().reverse().map((d, i) => {
                        const maxWt = Math.max(...youtube.map((r) => Number(r.watch_time_min) || 0)) || 1;
                        const h = (Number(d.watch_time_min || 0) / maxWt) * 70 + 5;
                        return (
                          <div key={i} title={`${d.date}: ${fmtDec(d.watch_time_min)} min`} style={{
                            flex: 1, height: h, background: C.blue, borderRadius: 2, minWidth: 3, maxWidth: 18,
                            opacity: 0.4 + (i / youtube.length) * 0.6,
                          }} />
                        );
                      })}
                    </div>
                  </div>
                </>
              ) : (
                <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 32, textAlign: "center", color: C.muted }}>
                  Aucune donnee YouTube. Lancez un sync pour tester la connexion.
                </div>
              )}
            </div>

            {/* Sync Logs */}
            {syncLogs.length > 0 && (
              <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20 }}>
                <div style={{ fontSize: 13, color: C.muted, fontWeight: 600, marginBottom: 12, borderBottom: `1px solid ${C.border}`, paddingBottom: 8 }}>
                  Historique des syncs
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                      <th style={{ padding: 8, textAlign: "left", color: C.muted }}>Connecteur</th>
                      <th style={{ padding: 8, textAlign: "center", color: C.muted }}>Statut</th>
                      <th style={{ padding: 8, textAlign: "center", color: C.muted }}>Lignes</th>
                      <th style={{ padding: 8, textAlign: "left", color: C.muted }}>Date</th>
                      <th style={{ padding: 8, textAlign: "left", color: C.muted }}>Erreur</th>
                    </tr>
                  </thead>
                  <tbody>
                    {syncLogs.map((log, i) => {
                      const statusColor = log.status === "success" ? C.green : log.status === "partial" ? C.yellow : C.accent;
                      return (
                        <tr key={i} style={{ borderBottom: `1px solid ${C.border}30` }}>
                          <td style={{ padding: 8, fontWeight: 600 }}>
                            <span style={{ color: log.connector === "meta" ? C.meta : C.youtube }}>
                              {log.connector === "meta" ? "f Meta" : "YouTube"}
                            </span>
                          </td>
                          <td style={{ padding: 8, textAlign: "center" }}>
                            <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600, background: statusColor + "18", color: statusColor }}>
                              {log.status}
                            </span>
                          </td>
                          <td style={{ padding: 8, textAlign: "center", fontFamily: "monospace" }}>{log.rows_synced}</td>
                          <td style={{ padding: 8, color: C.sub }}>{new Date(log.finished_at).toLocaleString("fr-FR")}</td>
                          <td style={{ padding: 8, color: C.accent, fontSize: 11, maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis" }}>
                            {log.error_msg || "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <div style={{ marginTop: 24, textAlign: "center", fontSize: 11, color: C.muted }}>
              Re-FAP — Social Dashboard v1.0
            </div>
          </main>
        )}
      </div>
    </>
  );
}

// === Helpers ===

const SOURCE_NAMES = {
  ADVERTISING: "Publicite",
  ANNOTATION: "Annotations",
  CAMPAIGN_CARD: "Cartes campagne",
  END_SCREEN: "Ecran de fin",
  EXT_URL: "Liens externes",
  HASHTAGS: "Hashtags",
  NO_LINK_EMBEDDED: "Sans lien",
  NO_LINK_OTHER: "Autre",
  NOTIFICATION: "Notifications",
  PLAYLIST: "Playlists",
  RELATED_VIDEO: "Suggestions",
  SHORTS: "Shorts",
  SUBSCRIBER: "Abonnes",
  YT_CHANNEL: "Page chaine",
  YT_OTHER_PAGE: "Autre page YT",
  YT_PLAYLIST_PAGE: "Page playlist",
  YT_SEARCH: "Recherche YT",
};

function formatSourceName(source) {
  return SOURCE_NAMES[source] || source.replace(/_/g, " ").toLowerCase();
}

function getSourceColor(source) {
  const colors = {
    YT_SEARCH: "#22c55e",
    RELATED_VIDEO: "#3b82f6",
    EXT_URL: "#f59e0b",
    ADVERTISING: "#ef4444",
    SHORTS: "#8b5cf6",
    NOTIFICATION: "#06b6d4",
    SUBSCRIBER: "#ec4899",
    PLAYLIST: "#14b8a6",
  };
  return colors[source] || C.muted;
}
