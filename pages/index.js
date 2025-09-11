import { useState, useRef, useEffect } from 'react';
import Head from 'next/head';
import ReactMarkdown from 'react-markdown';

const GARAGE_URL = 'https://re-fap.fr/trouver_garage_partenaire/';
const CC_URL = 'https://auto.re-fap.fr';

function safeParse(s){ try { return JSON.parse(s); } catch { return null; } }
function isFAP(obj){
  return Array.isArray(obj?.suspected) && obj.suspected.some(x => /fap|dpf/i.test(String(x)));
}

function StructuredBotCard({ obj }) {
  return (
    <div style={{ marginTop: 6 }}>
      {obj.title && <div style={{ fontWeight: 700, marginBottom: 4 }}>{obj.title}</div>}
      {obj.summary && <p style={{ margin: '4px 0 8px 0' }}>{obj.summary}</p>}

      {Array.isArray(obj.suspected) && obj.suspected.length > 0 && (
        <div style={{ marginBottom: 6 }}>
          <div style={{ fontWeight: 600 }}>Pistes probables</div>
          <ul>{obj.suspected.map((s, i) => <li key={i}>{s}</li>)}</ul>
        </div>
      )}
      {Array.isArray(obj.actions) && obj.actions.length > 0 && (
        <div style={{ marginBottom: 6 }}>
          <div style={{ fontWeight: 600 }}>À faire maintenant</div>
          <ul>{obj.actions.map((a, i) => <li key={i}>{a}</li>)}</ul>
        </div>
      )}
      {obj.stage === 'triage' && Array.isArray(obj.questions) && obj.questions.length > 0 && (
        <div style={{ marginBottom: 6 }}>
          <div style={{ fontWeight: 600 }}>Questions</div>
          <ul>{obj.questions.map((q, i) => <li key={q.id || i}>{q.q || String(q)}</li>)}</ul>
        </div>
      )}
      {Array.isArray(obj.follow_up) && obj.follow_up.length > 0 && (
        <div style={{ marginTop: 6 }}>
          <div style={{ fontWeight: 600 }}>Suite</div>
          <ul>{obj.follow_up.map((f, i) => <li key={i}>{f}</li>)}</ul>
        </div>
      )}
      {obj.legal && <p style={{ marginTop: 8, fontSize: '0.85rem', opacity: 0.8 }}>{obj.legal}</p>}
    </div>
  );
}

export default function Home() {
  const [messages, setMessages] = useState([
    {
      from: 'bot',
      text:
        "Bonjour 👋! Je suis **AutoAI**, mécano IA de Re-FAP. Je t’aide à comprendre un voyant, un souci de **FAP/DPF** ou autre panne, et je t’oriente vers la bonne solution. Pose ta question 😄"
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [error, setError] = useState('');
  const [nextAction, setNextAction] = useState(null);
  const [lastObj, setLastObj] = useState(null);
  const chatEndRef = useRef();

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, loading]);

  function getHistoriqueText() {
    const lastMessages = messages.slice(-5);
    return lastMessages
      .map((m) => (m.from === 'user'
        ? `Moi: ${m.text}`
        : m.json ? `AutoAI: ${JSON.stringify(m.json)}`
        : `AutoAI: ${m.text}`))
      .join('\n');
  }

  async function handleSubmit(e) {
    e.preventDefault();

    const userMessagesCount = messages.filter(m => m.from === 'user').length;
    if (userMessagesCount >= 10) {
      setBlocked(true);
      setError("🔧 Tu as déjà échangé 10 messages avec moi sur ce sujet ! La session s’arrête ici. Relance une nouvelle discussion quand tu veux 🚀.");
      return;
    }

    const trimmedInput = input.trim();
    if (!trimmedInput) return;

    setMessages((msgs) => [...msgs, { from: 'user', text: trimmedInput }]);
    setInput('');
    setLoading(true);
    setError('');

    const historiqueText = getHistoriqueText() + `\nMoi: ${trimmedInput}`;

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        body: JSON.stringify({ question: trimmedInput, historique: historiqueText }),
      });

      setLoading(false);

      if (!res.ok) {
        setMessages((msgs) => [...msgs, { from: 'bot', text: res.status === 429
          ? "⚠️ Le service est temporairement saturé, merci de réessayer plus tard."
          : `Erreur serveur ${res.status}` }]);
        return;
      }

      const payload = await res.json();
      const obj = payload.data || safeParse(payload.reply);

      if (obj) {
        setMessages((msgs) => [...msgs, { from: 'bot', json: obj }]);
        setLastObj(obj);
      } else {
        setMessages((msgs) => [...msgs, { from: 'bot', text: payload.reply || "Désolé, réponse indisponible." }]);
      }
      setNextAction(payload.nextAction || { type: 'GEN' });

    } catch {
      setLoading(false);
      setMessages((msgs) => [...msgs, { from: 'bot', text: "Désolé, erreur réseau. Actualise la page." }]);
    }
  }

  // --- CTA : 2 boutons permanents, Carter-Cash grisé hors FAP ---
  const isFapDiag = (lastObj && ((lastObj.stage === 'diagnosis' && isFAP(lastObj)) || (lastObj.stage === 'handoff' && isFAP(lastObj))));
  const carterEnabled = isFapDiag || nextAction?.type === 'FAP';
  const garageLabel = lastObj?.cta?.label || 'Prendre RDV avec un garage partenaire';
  const garageHref  = (lastObj?.cta?.url || GARAGE_URL).replace(/^http:/,'https:');
  const garageReason = lastObj?.cta?.reason || 'Partout en France : garages au choix, RDV en quelques clics.';

  return (
    <>
      <Head>
        <title>Auto AI</title>
        <link rel="stylesheet" href="/style.css?v=2" />
      </Head>

      <main className="container">
        <h1>AutoAI par Re-FAP</h1>

        <div className="chat-and-button">
          <div id="chat-window" className="chat-window">
            {messages.map((m, i) => (
              <div key={i} className={m.from === 'user' ? 'user-msg' : 'bot-msg'}>
                <strong>{m.from === 'user' ? 'Moi' : 'AutoAI'}:</strong>
                {m.json ? <StructuredBotCard obj={m.json} /> : (
                  <ReactMarkdown skipHtml>{(m.text || '').replace(/\n{2,}/g, '\n')}</ReactMarkdown>
                )}
              </div>
            ))}

            {loading && (
              <div className="bot-msg typing-indicator">
                <strong>AutoAI:</strong>
                <span className="dots"><span>.</span><span>.</span><span>.</span></span>
              </div>
            )}

            <div ref={chatEndRef} />
          </div>

          {/* Boutons permanents */}
          <div className="garage-button-container">
            <a id="btn-garage" href={garageHref} className="garage-button" target="_blank" rel="nofollow">
              <span className="label">{garageLabel} 🔧</span>
            </a>
            <small className="cta-reason" id="garage-reason">{garageReason}</small>

            <a
              id="btn-cc"
              href={CC_URL}
              className={`carter-button ${carterEnabled ? '' : 'is-disabled'}`}
              target="_blank" rel="nofollow"
              onClick={(e) => {
                if (!carterEnabled) {
                  e.preventDefault();
                  alert('Réservé aux cas FAP (FAP déjà déposé). Utilisez le bouton vert pour un diagnostic.');
                }
              }}
            >
              <span className="label">FAP démonté ? Dépose Carter-Cash 🛠️</span>
              <span className="badge">réservé aux cas FAP</span>
            </a>
            <small className="cta-reason" id="cc-reason">
              {carterEnabled
                ? 'Si vous pouvez déposer le FAP, apportez-le en Carter-Cash pour un nettoyage Re-FAP.'
                : 'Réservé aux cas FAP. Si doute : commencez par le diagnostic en garage.'}
            </small>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="chat-form">
          <input
            type="text"
            placeholder="Écris ta question ici..."
            value={input}
            onChange={(e) => {
              const val = e.target.value;
              setInput(val);
              setError(val.length > 600 ? '⚠️ Ton message ne peut pas dépasser 600 caractères.' : '');
            }}
            autoComplete="off"
            id="user-input"
            disabled={blocked}
          />
          <button type="submit" disabled={blocked || input.length > 600 || loading}>
            {loading ? 'Envoi…' : 'Envoyer'}
          </button>
        </form>

        {error && <p className="error-msg">{error}</p>}
      </main>

      <footer className="footer">
        <p>⚠️ AutoAI peut faire des erreurs, envisage de vérifier les informations importantes.</p>
      </footer>
    </>
  );
}
