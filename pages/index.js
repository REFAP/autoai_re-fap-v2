// /pages/index.js
import { useState, useRef, useEffect } from 'react';
import Head from 'next/head';
import ReactMarkdown from 'react-markdown';

function stripDataLine(text = '') {
  if (!text) return '';
  return String(text)
    .replace(/\n?DATA:\s*\{[\s\S]*?\}\s*$/i, '')
    .trim();
}

export default function Home() {
  const RECOMMENDATION_URLS = {
    garage: '/landing/garage',
    carter: '/landing/carter',
    quiz: 'https://refap.github.io/re-fap-landing/#quiz'
  };

  // --- Session ID (persistant = 1 conversation par visiteur) ---
  const [sessionId, setSessionId] = useState(null);

  useEffect(() => {
    try {
      const key = 'refap_session_id';
      let sid = localStorage.getItem(key);

      if (!sid) {
        sid = (crypto?.randomUUID?.() || `sid_${Date.now()}_${Math.random().toString(16).slice(2)}`);
        localStorage.setItem(key, sid);
      }

      setSessionId(sid);
    } catch {
      setSessionId(null);
    }
  }, []);
  // --- fin session ---

  const [messages, setMessages] = useState([
    {
      from: 'bot',
      text:
        "Bonjour ! Je suis FAPexpert, spécialiste Re-FAP.\n\nDécrivez votre souci **FAP (filtre à particules)** : voyant allumé, perte de puissance, mode dégradé, code OBD (P2002, P2463…), type de trajets (ville/autoroute)."
    }
  ]);

  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [error, setError] = useState('');
  const chatEndRef = useRef();

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  async function handleSubmit(e) {
    e.preventDefault();

    const userMessagesCount = messages.filter((m) => m.from === 'user').length;
    if (userMessagesCount >= 10) {
      setBlocked(true);
      setError('Session limitée à 10 messages. Veuillez rafraîchir la page pour une nouvelle conversation.');
      return;
    }

    const trimmedInput = input.trim();
    if (!trimmedInput) return;

    if (sessionId === null) {
      setError("Initialisation en cours… réessayez dans 1 seconde.");
      return;
    }

    const userMsg = { from: 'user', text: trimmedInput };
    setMessages((msgs) => [...msgs, userMsg]);
    setInput('');
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          message: trimmedInput,
          meta: {
            page_url: window.location.href,
            page_slug: 'home',
            page_type: 'chat',
            referrer: document.referrer || null,
            user_agent: navigator.userAgent || null
          }
        })
      });

      let data = null;
      try {
        data = await res.json();
      } catch {
        data = null;
      }

      setLoading(false);

      if (!res.ok) {
        const details = data ? JSON.stringify(data) : 'No JSON';
        setMessages((msgs) => [...msgs, { from: 'bot', text: `Erreur serveur ${res.status} — ${details}` }]);
        return;
      }

      const reply = stripDataLine(data?.reply || '');
      setMessages((msgs) => [
        ...msgs,
        { from: 'bot', text: reply || `Réponse API inattendue: ${JSON.stringify(data)}` }
      ]);
    } catch {
      setLoading(false);
      setMessages((msgs) => [...msgs, { from: 'bot', text: 'Erreur de connexion. Veuillez actualiser la page.' }]);
    }
  }

  return (
    <>
      <Head>
        <title>FAPexpert - Diagnostic FAP par Re-FAP</title>
        <link rel="stylesheet" href="/style.css" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </Head>

      <div className="app-container">
        <main className="chat-container">
          {/* Header */}
          <div className="chat-header">
            <div className="header-content">
              <div className="logo-section">
                <div className="logo-circle">
                  <span className="logo-text">FE</span>
                </div>
                <div className="header-text">
                  <h1>FAPexpert par Re-FAP</h1>
                  <p className="subtitle">Expert FAP • Partout en France</p>
                </div>
              </div>
              <div className="status-indicator">
                <span className="status-dot"></span>
                <span>En ligne</span>
              </div>
            </div>
          </div>

          <div className="chat-main">
            {/* Zone de chat */}
            <div className="chat-area">
              <div className="messages-container">
                {messages.map((m, i) => (
                  <div key={i} className={`message ${m.from}`}>
                    <div className="message-header">
                      {m.from === 'user' ? (
                        <span className="message-author user-author">Vous</span>
                      ) : (
                        <span className="message-author bot-author">FAPexpert</span>
                      )}
                    </div>
                    <div className="message-bubble">
                      <ReactMarkdown>{m.text.replace(/\n{2,}/g, '\n')}</ReactMarkdown>
                    </div>
                  </div>
                ))}

                {loading && (
                  <div className="message bot">
                    <div className="message-header">
                      <span className="message-author bot-author">FAPexpert</span>
                    </div>
                    <div className="message-bubble">
                      <div className="typing-indicator">
                        <span></span>
                        <span></span>
                        <span></span>
                      </div>
                    </div>
                  </div>
                )}

                <div ref={chatEndRef} />
              </div>

              {/* Zone de saisie */}
              <form onSubmit={handleSubmit} className="input-form">
                <div className="input-wrapper">
                  <input
                    type="text"
                    placeholder="Décrivez votre souci FAP : voyant, perte de puissance, code OBD…"
                    value={input}
                    onChange={(e) => {
                      const val = e.target.value;
                      setInput(val);
                      setError(val.length > 600 ? 'Message limité à 600 caractères' : '');
                    }}
                    autoComplete="off"
                    className="message-input"
                    disabled={blocked}
                    maxLength={600}
                  />
                  <button
                    type="submit"
                    className="send-button"
                    disabled={blocked || input.length > 600 || loading || !input.trim()}
                  >
                    {loading ? (
                      <span className="button-loading">...</span>
                    ) : (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                        <path
                          d="M22 2L11 13"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <path
                          d="M22 2L15 22L11 13L2 9L22 2Z"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                  </button>
                </div>
                {error && <div className="error-message">{error}</div>}
              </form>
            </div>

            {/* Zone CTA */}
            <div className="cta-zone">
              <div className="cta-header">
                <h3>Solutions rapides</h3>
                <p>Choisissez votre situation</p>
              </div>

              <a
                href={RECOMMENDATION_URLS.garage}
                target="_blank"
                rel="noopener noreferrer"
                className="cta-button primary"
              >
                <div className="cta-content">
                  <span className="cta-title">Garage partenaire</span>
                  <span className="cta-subtitle">RDV diagnostic</span>
                </div>
              </a>

              <a
                href={RECOMMENDATION_URLS.carter}
                target="_blank"
                rel="noopener noreferrer"
                className="cta-button secondary"
              >
                <div className="cta-content">
                  <span className="cta-title">Carter-Cash</span>
                  <span className="cta-subtitle">FAP démonté • 99-149€</span>
                </div>
              </a>

              <div className="info-card">
                <span>Garantie 1 an • Toute la France</span>
              </div>

              <div className="disclaimer-text">FAPexpert peut faire des erreurs. Vérifiez auprès d'un professionnel.</div>
            </div>
          </div>
        </main>
      </div>
    </>
  );
}
