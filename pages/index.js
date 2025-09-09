import { useState, useRef, useEffect } from 'react';
import Head from 'next/head';
import ReactMarkdown from 'react-markdown';

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
  const [nextAction, setNextAction] = useState(null); // ← pilote les CTA
  const chatEndRef = useRef();

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  function getHistoriqueText() {
    const lastMessages = messages.slice(-5);
    return lastMessages
      .map((m) => (m.from === 'user' ? `Moi: ${m.text}` : `AutoAI: ${m.text}`))
      .join('\n');
  }

  async function handleSubmit(e) {
    e.preventDefault();

    // Limite d'échanges utilisateur
    const userMessagesCount = messages.filter(m => m.from === 'user').length;
    if (userMessagesCount >= 10) {
      setBlocked(true);
      setError("🔧 Tu as déjà échangé 10 messages avec moi sur ce sujet ! Pour éviter les conversations trop longues, la session s’arrête ici. Tu peux relancer une nouvelle discussion à tout moment 🚀.");
      return;
    }

    const trimmedInput = input.trim();
    if (!trimmedInput) return;

    const userMsg = { from: 'user', text: trimmedInput };
    setMessages((msgs) => [...msgs, userMsg]);
    setInput('');
    setLoading(true);
    setError('');

    const historiqueText = getHistoriqueText() + `\nMoi: ${trimmedInput}`;

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: trimmedInput,
          historique: historiqueText,
        }),
      });

      setLoading(false);

      if (!res.ok) {
        if (res.status === 429) {
          setMessages((msgs) => [
            ...msgs,
            { from: 'bot', text: "⚠️ Le service est temporairement saturé, merci de réessayer plus tard." },
          ]);
        } else {
          setMessages((msgs) => [
            ...msgs,
            { from: 'bot', text: `Erreur serveur ${res.status}` },
          ]);
        }
        return;
      }

      const data = await res.json();
      const botMsg = {
        from: 'bot',
        text: data.reply || "Désolé, le service a reçu trop de messages en même temps, merci de renvoyer votre message :).",
      };
      setMessages((msgs) => [...msgs, botMsg]);
      setNextAction(data.nextAction || { type: 'GEN' }); // ← met à jour l’action suivante (FAP/DIAG/GEN)

    } catch {
      setLoading(false);
      setMessages((msgs) => [
        ...msgs,
        { from: 'bot', text: "Désolé, il y a eu une erreur réseau, merci d'actualiser la page :)." },
      ]);
    }
  }

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

          {/* CTA dynamiques selon la classification */}
          <div className="garage-button-container">
            {nextAction?.type === 'FAP' && (
              <>
                <a href="https://re-fap.fr/trouver_garage_partenaire/" className="garage-button">
                  FAP monté ? Prendre RDV 🔧
                </a>
                <a href="https://auto.re-fap.fr" className="carter-button">
                  FAP démonté ? Dépose Carter-Cash 🛠️
                </a>
              </>
            )}

            {nextAction?.type === 'DIAG' && (
              <a href="https://re-fap.fr/trouver_garage_partenaire/" className="garage-button">
                Diagnostic électronique proche de chez toi 🔎
              </a>
            )}

            {(!nextAction || nextAction.type === 'GEN') && (
              <>
                <a href="https://re-fap.fr/trouver_garage_partenaire/" className="garage-button">
                  Trouver un garage partenaire 🔧
                </a>
                <a href="https://auto.re-fap.fr" className="carter-button">
                  Trouver un Carter-Cash 🛠️
                </a>
              </>
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
