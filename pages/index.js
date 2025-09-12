import { useState, useRef, useEffect } from 'react';
import Head from 'next/head';
import ReactMarkdown from 'react-markdown';

export default function Home() {
  const [messages, setMessages] = useState([
    {
      from: 'bot',
      text: "Bonjour 👋! Je suis **AutoAI**, mécano IA de Re-FAP. Je t’aide à comprendre un voyant, un souci de **FAP/DPF** ou autre panne, et je t’oriente vers la bonne solution. Pose ta question 😄"
    },
  ]);
  const [botJson, setBotJson] = useState(null); // ← JSON structuré renvoyé par l’API
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [error, setError] = useState('');
  const [nextAction, setNextAction] = useState(null); // fallback
  const chatEndRef = useRef();

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  function getHistoriqueText() {
    const last = messages.slice(-5);
    return last.map(m => (m.from === 'user' ? `Moi: ${m.text}` : `AutoAI: ${m.text}`)).join('\n');
  }

  async function handleSubmit(e) {
    e.preventDefault();

    const userCount = messages.filter(m => m.from === 'user').length;
    if (userCount >= 10) {
      setBlocked(true);
      setError("🔧 10 messages atteints. Relance une nouvelle discussion si besoin 🚀.");
      return;
    }

    const trimmed = input.trim();
    if (!trimmed) return;

    setMessages(msgs => [...msgs, { from: 'user', text: trimmed }]);
    setInput('');
    setLoading(true);
    setError('');

    const historiqueText = getHistoriqueText() + `\nMoi: ${trimmed}`;

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: trimmed, historique: historiqueText }),
      });

      setLoading(false);

      if (!res.ok) {
        const txt = res.status === 429
          ? "⚠️ Service temporairement saturé, réessaie plus tard."
          : `Erreur serveur ${res.status}`;
        setMessages(msgs => [...msgs, { from: 'bot', text: txt }]);
        return;
      }

      const data = await res.json();
      const botMsg = { from: 'bot', text: (data.reply || '').trim() || "Réponse indisponible." };
      setMessages(msgs => [...msgs, botMsg]);

      setBotJson(data.data || null);         // ← on stocke l'objet JSON nettoyé
      setNextAction(data.nextAction || {type:'GEN'});

    } catch {
      setLoading(false);
      setMessages(msgs => [...msgs, { from: 'bot', text: "Désolé, erreur réseau. Actualise la page." }]);
    }
  }

  // Décide l'état FAP à partir du JSON structuré (source de vérité)
  const isFap = !!botJson && Array.isArray(botJson.suspected)
    && /fap|dpf|filtre.*particule/i.test(botJson.suspected.join(' '));

  return (
    <>
      <Head>
        <title>Auto AI</title>
        <link rel="stylesheet" href="/style.css" />
      </Head>

      <main className="container">
        <h1>AutoAI par Re-FAP</h1>

        <div className="chat-and-button">
          <div id="chat-window" className="chat-window">
            {messages.map((m, i) => (
              <div key={i} className={m.from === 'user' ? 'user-msg' : 'bot-msg'}>
                <strong>{m.from === 'user' ? 'Moi' : 'AutoAI'}:</strong>
                <ReactMarkdown skipHtml>{m.text.replace(/\n{2,}/g, '\n')}</ReactMarkdown>
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

          {/* CTA permanents mais pilotés par le JSON pour le libellé du 2ᵉ */}
          <div className="garage-button-container">
            <a href="https://re-fap.fr/trouver_garage_partenaire/" className="garage-button">
              {isFap ? "FAP monté ? Prendre RDV 🔧" : "Trouver un garage partenaire 🔧"}
            </a>

            {isFap ? (
              <a href="https://auto.re-fap.fr" className="carter-button">
                FAP démonté ? Dépose Carter-Cash 🛠️
              </a>
            ) : (
              <a
                href="https://www.idgarages.com/fr-fr/prestations/diagnostic-electronique?utm_source=re-fap&utm_medium=partenariat&utm_campaign=diagnostic-electronique&ept-publisher=re-fap&ept-name=re-fap-diagnostic-electronique"
                className="carter-button"
              >
                Diagnostic électronique proche 🔎
              </a>
            )}
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
