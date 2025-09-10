// services/mistral.js
// Appel Mistral ; si pas de clé => throw pour activer les fallbacks.

export async function chatCompletion(messages, options = {}) {
  const apiKey = process.env.MISTRAL_API_KEY;
  const model = process.env.MISTRAL_MODEL || 'mistral-large-latest';

  if (!apiKey) {
    // pas de clé : on laisse l’engine basculer vers les fallbacks
    throw new Error('Mistral API key missing');
  }

  const r = await fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: options.temperature ?? 0.2,
      top_p: options.top_p ?? 0.6,
      max_tokens: options.max_tokens ?? 320,
    }),
  });

  if (!r.ok) throw new Error(`Mistral HTTP ${r.status}`);
  const data = await r.json();
  const text = data?.choices?.[0]?.message?.content ?? '';
  return String(text || '').trim();
}
