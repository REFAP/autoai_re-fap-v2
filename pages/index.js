import { useState, useRef, useEffect } from 'react';
import Head from 'next/head';
import ReactMarkdown from 'react-markdown';

export default function Home() {
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
        <link rel="stylesheet" href="/style.css" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </Head>

      <div className="app-container">
        <main className="chat-container">
          {/* Header */}
          <div className="chat-header">
            <div className="header-content">
              <div className="logo-section">
                <div className="logo-circle">
                  <span className="logo-text">AI</span>
                </div>
                <div className="header-text">
                  <h1>AutoAI par Re-FAP</h1>
                  <p className="subtitle">Expert en diagnostic FAP • Service disponible partout en France</p>
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
                        <span className="message-author bot-author">AutoAI</span>
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
                      <span className="message-author bot-author">AutoAI</span>
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
                    placeholder="Décrivez votre problème de FAP..."
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
                        <path d="M22 2L11 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
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
                <h3>Actions rapides</h3>
                <p>Choisissez selon votre situation</p>
              </div>

              {nextAction?.type === 'FAP' && (
                <>
                  <a href="https://re-fap.fr/trouver_garage_partenaire/" className="cta-button primary">
                    <div className="cta-icon">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                        <path d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z" fill="currentColor"/>
                      </svg>
                    </div>
                    <div className="cta-content">
                      <span className="cta-title">FAP monté ?</span>
                      <span className="cta-subtitle">Prendre RDV en garage</span>
                    </div>
                    <svg className="cta-arrow" width="20" height="20" viewBox="0 0 24 24" fill="none">
                      <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                  </a>

                  <a href="https://auto.re-fap.fr" className="cta-button secondary">
                    <div className="cta-icon">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" fill="currentColor"/>
                        <path d="M14 2v6h6" stroke="white" strokeWidth="2"/>
                      </svg>
                    </div>
                    <div className="cta-content">
                      <span className="cta-title">FAP démonté ?</span>
                      <span className="cta-subtitle">Dépôt Carter-Cash</span>
                    </div>
                    <svg className="cta-arrow" width="20" height="20" viewBox="0 0 24 24" fill="none">
                      <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                  </a>
                </>
              )}

              {nextAction?.type === 'DIAG' && (
                <a href="https://re-fap.fr/trouver_garage_partenaire/" className="cta-button primary">
                  <div className="cta-icon">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                      <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2"/>
                      <path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                  </div>
                  <div className="cta-content">
                    <span className="cta-title">Diagnostic complet</span>
                    <span className="cta-subtitle">Garage proche de vous</span>
                  </div>
                  <svg className="cta-arrow" width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                </a>
              )}

              {(!nextAction || nextAction.type === 'GEN') && (
                <>
                  <a href="https://re-fap.fr/trouver_garage_partenaire/" className="cta-button primary">
                    <div className="cta-icon">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                        <path d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z" fill="currentColor"/>
                      </svg>
                    </div>
                    <div className="cta-content">
                      <span className="cta-title">Garage partenaire</span>
                      <span className="cta-subtitle">Service complet</span>
                    </div>
                    <svg className="cta-arrow" width="20" height="20" viewBox="0 0 24 24" fill="none">
                      <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                  </a>

                  <a href="https://auto.re-fap.fr" className="cta-button secondary">
                    <div className="cta-icon">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" fill="currentColor"/>
                        <path d="M14 2v6h6" stroke="white" strokeWidth="2"/>
                      </svg>
                    </div>
                    <div className="cta-content">
                      <span className="cta-title">Carter-Cash</span>
                      <span className="cta-subtitle">Dépôt FAP démonté</span>
                    </div>
                    <svg className="cta-arrow" width="20" height="20" viewBox="0 0 24 24" fill="none">
                      <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                  </a>
                </>
              )}

              <div className="info-card">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
                  <path d="M12 16v-4M12 8h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
                <span>Service garanti 1 an • Partout en France</span>
              </div>
            </div>
          </div>
        </main>

        <footer className="footer">
          <p>AutoAI peut faire des erreurs. Vérifiez les informations importantes auprès d'un professionnel.</p>
        </footer>
      </div>
    </>
  );
}
