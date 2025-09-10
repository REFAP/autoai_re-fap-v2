// services/mistral.js
export async function chatCompletion(messages, { max_tokens = 340, temperature = 0.2, top_p = 0.6 } = {}) {
  const apiKey = process.env.MISTRAL_API_KEY;
  const model  = process.env.MISTRAL_MODEL || 'mistral-large-latest';
  if (!apiKey) throw new Error('NO_API_KEY');

  const r = await fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages, temperature, top_p, max_tokens }),
  });
  if (!r.ok) throw new Error(`Mistral HTTP ${r.status}`);
  const data = await r.json();
  return (data?.choices?.[0]?.message?.content || '').trim();
}
