import { useState, useRef, useEffect } from 'react';
import Head from 'next/head';
import ReactMarkdown from 'react-markdown';

export default function Home() {
  const [messages, setMessages] = useState([
    { from: 'bot', text: "Bonjour 👋! Je suis **AutoAI**, mécano IA de Re-FAP. Dis-moi ce que tu vois (voyant FAP/moteur, fumée, perte de puissance…)."}
  ]);
  const [botJson, setBotJson] = useState(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [error, setError] = useState('');
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

      // Blindage texte : si non-FAP, on remplace les mentions Carter-Cash par « garage partenaire »
      const isFapReply = !!data?.data && Array.isArray(data.data.suspected)
        && /fap|dpf|filtre.*particule/i.test(data.data.suspected.join(' '));

      const safeText = !isFapReply
        ? String(data.reply || '').replace(/carter.?cash/ig, 'garage partenaire')
        : String(data.reply || '');

      setMessages(msgs => [...msgs, { from: 'bot', text: (safeText || "Réponse indisponible.").trim() }]);
      setBotJson(data.data || null);

    } catch {
      setLoading(false);
      setMessages(msgs => [...msgs, { from: 'bot', text: "Désolé, erreur réseau. Actualise la page." }]);
    }
  }

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
                {/* rendu Markdown propre (ne pas aplatir les sauts de ligne) */}
                <ReactMarkdown skipHtml>{m.text}</ReactMarkdown>
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

          {/* Deux boutons permanents ; le 2e varie selon FAP vs non-FAP */}
          <div className="garage-button-container">
            <a
              href="https://re-fap.fr/trouver_garage_partenaire/"
              className="garage-button"
              aria-label="Besoin qu’un garage s’occupe de tout ? Prendre RDV"
            >
              Besoin qu’un garage s’occupe de tout ? <span className="nowrap">Prendre RDV</span> 🔧
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
