// /pages/api/admin/analytics-ai.js
// Generate AI recommendations via Claude API
// POST { summary } → { recommendations }

const ADMIN_TOKEN = process.env.ADMIN_DASHBOARD_TOKEN || "re-fap-2026-dash";
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const token = (req.headers.authorization || "").replace("Bearer ", "").trim() || req.query.token;
  if (token !== ADMIN_TOKEN) return res.status(401).json({ error: "Token invalide" });

  if (!ANTHROPIC_API_KEY) return res.status(500).json({ error: "ANTHROPIC_API_KEY non configurée" });

  try {
    const { summary } = req.body;
    if (!summary) return res.status(400).json({ error: "summary requis" });

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2000,
        messages: [
          {
            role: "user",
            content: `Tu es un expert en marketing digital et analytics pour Re-FAP, un réseau de centres de nettoyage de filtre à particules (FAP) automobile en France.

Voici les données analytics multi-sources de la période récente :

${summary}

Analyse ces données et fournis :
1. **Diagnostic rapide** : Quelle est la santé globale de la stratégie digitale ? (2-3 phrases)
2. **Top 3 actions prioritaires** : Actions concrètes à mettre en place cette semaine
3. **Corrélations clés** : Quels canaux impactent le plus les ventes terrain ? Explique les lags observés.
4. **Budget** : Le ROI de chaque canal payant, et où réallouer si nécessaire
5. **Alertes** : Points d'attention ou anomalies détectées

Réponds en français, de manière concise et actionnable. Utilise des données chiffrées.`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`Claude API ${response.status}: ${errBody}`);
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || "Aucune recommandation générée.";

    return res.status(200).json({ recommendations: text });
  } catch (err) {
    console.error("Analytics AI error:", err);
    return res.status(500).json({ error: err.message });
  }
}
