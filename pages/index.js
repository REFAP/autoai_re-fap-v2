import { useState, useRef, useEffect } from 'react';
import Head from 'next/head';
import ReactMarkdown from 'react-markdown';

export default function Home() {
  // URLs pour les recommandations directes
  const RECOMMENDATION_URLS = {
    garage: '/landing/garage',  // Page Next.js - PRIORITAIRE
    carter: '/landing/carter',  // Page Next.js
    quiz: 'https://refap.github.io/re-fap-landing/#quiz'
  };

  const [messages, setMessages] = useState([
    {
      from: 'bot',
      text: "Bonjour ! Je suis AutoAI, votre expert Re-FAP. Je diagnostique vos problèmes de FAP et vous oriente vers la solution adaptée. Décrivez votre problème."
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [error, setError] = useState('');
  const [nextAction, setNextAction] = useState(null);
  const [showCTA, setShowCTA] = useState(false);
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

    const userMessagesCount = messages.filter(m => m.from === 'user').length;
    if (userMessagesCount >= 10) {
      setBlocked(true);
      setError("Session limitée à 10 messages. Veuillez rafraîchir la page pour une nouvelle conversation.");
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
            { from: 'bot', text: "Service temporairement saturé. Veuillez réessayer dans quelques instants." },
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
        text: data.reply || "Service temporairement indisponible. Veuillez réessayer.",
      };
      setMessages((msgs) => [...msgs, botMsg]);
      setNextAction(data.nextAction || { type: 'GEN' });
      
      // Afficher les CTAs après la première réponse du bot
      if (userMessagesCount === 0) {
        setShowCTA(true);
      }

    } catch {
      setLoading(false);
      setMessages((msgs) => [
        ...msgs,
        { from: 'bot', text: "Erreur de connexion. Veuillez actualiser la page." },
      ]);
    }
  }

  return (
    <>
      <Head>
        <title>AutoAI - Expert FAP par Re-FAP</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=0" />
        <link rel="stylesheet" href="/style-mobile.css" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </Head>

      <div className="mobile-container">
        {/* Header compact pour mobile */}
        <header className="mobile-header">
          <div className="header-content">
            <div className="logo-section">
              <div className="logo-circle">
                <span className="logo-text">AI</span>
              </div>
              <div className="header-text">
                <h1>AutoAI</h1>
                <p className="subtitle">Expert FAP • Re-FAP</p>
              </div>
            </div>
            <div className="status-indicator">
              <span className="status-dot"></span>
            </div>
          </div>
        </header>

        {/* Zone de chat principale */}
        <main className="chat-main">
          <div className="messages-container">
            {messages.map((m, i) => (
              <div key={i} className={`message ${m.from}`}>
                <div className="message-bubble">
                  <ReactMarkdown>{m.text.replace(/\n{2,}/g, '\n')}</ReactMarkdown>
                </div>
                {m.from === 'bot' && i === messages.length - 1 && showCTA && (
                  <div className="inline-cta">
                    {/* CTAs intégrés après le dernier message bot */}
                    {nextAction?.type === 'FAP' && (
                      <>
                        <a href={RECOMMENDATION_URLS.garage} 
                           className="cta-chip primary">
                          🛠️ FAP monté ? → RDV Garage
                        </a>
                        <a href={RECOMMENDATION_URLS.carter}
                           className="cta-chip secondary">
                          📦 FAP démonté ? → Carter-Cash
                        </a>
                      </>
                    )}
                    {nextAction?.type === 'DIAG' && (
                      <a href={RECOMMENDATION_URLS.garage}
                         className="cta-chip primary">
                        🔍 Diagnostic complet → Garage
                      </a>
                    )}
                    {(!nextAction || nextAction.type === 'GEN') && (
                      <>
                        <a href={RECOMMENDATION_URLS.garage}
                           className="cta-chip primary">
                          🛠️ Prendre RDV → Garage
                        </a>
                        <a href={RECOMMENDATION_URLS.carter}
                           className="cta-chip secondary">
                          📦 Dépôt FAP → Carter-Cash
                        </a>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="message bot">
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

          {/* Boutons CTA flottants toujours visibles */}
          <div className="floating-cta">
            <button 
              className="cta-toggle"
              onClick={() => setShowCTA(!showCTA)}
            >
              {showCTA ? '✕' : '🛠️'} Solutions
            </button>
            
            {showCTA && (
              <div className="cta-panel">
                <a href={RECOMMENDATION_URLS.garage} 
                   className="quick-cta primary">
                  <span className="cta-icon">🛠️</span>
                  <div className="cta-text">
                    <span className="cta-title">Garage partenaire</span>
                    <span className="cta-desc">RDV diagnostic</span>
                  </div>
                </a>
                <a href={RECOMMENDATION_URLS.carter}
                   className="quick-cta secondary">
                  <span className="cta-icon">📦</span>
                  <div className="cta-text">
                    <span className="cta-title">Carter-Cash</span>
                    <span className="cta-desc">Dépôt FAP</span>
                  </div>
                </a>
              </div>
            )}
          </div>
        </main>

        {/* Zone de saisie fixe en bas */}
        <div className="input-zone">
          {error && <div className="error-message">{error}</div>}
          <form onSubmit={handleSubmit} className="input-form">
            <input
              type="text"
              placeholder="Décrivez votre problème..."
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
                  <path d="M22 2L11 13M22 2L15 22L11 13L2 9L22 2Z" 
                        stroke="currentColor" 
                        strokeWidth="2" 
                        strokeLinecap="round" 
                        strokeLinejoin="round"/>
                </svg>
              )}
            </button>
          </form>
          <p className="disclaimer">
            Service garanti 1 an • Partout en France
          </p>
        </div>
      </div>
    </>
  );
}
