import { useState, useRef, useEffect } from 'react';
import Head from 'next/head';
import ReactMarkdown from 'react-markdown';

export default function Home() {
  // URLs pour les recommandations directes
  const RECOMMENDATION_URLS = {
    garage: 'https://refap.github.io/re-fap-landing/?route=garage&utm_source=bot&utm_medium=cta&utm_campaign=garage_direct#recommendation',
    carter: 'https://refap.github.io/carter-cash-refap/?utm_source=bot&utm_medium=cta&utm_campaign=carter_depot',
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

    if (!input.trim()) return;

    const userMessage = { from: 'user', text: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);
    setError('');
    setNextAction(null);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message: input,
          historique: getHistoriqueText()
        }),
      });

      if (!response.ok) {
        throw new Error('Erreur réseau');
      }

      const data = await response.json();
      
      // Analyser la réponse pour déterminer l'action recommandée
      let recommendedAction = null;
      
      // Détection de la recommandation garage
      if (data.text.includes('garage') || 
          data.text.includes('clé en main') || 
          data.text.includes('diagnostic') ||
          data.text.includes('prise en charge complète')) {
        recommendedAction = {
          type: 'garage',
          url: RECOMMENDATION_URLS.garage,
          text: 'Voir ma solution garage personnalisée →',
          color: '#00a651'
        };
      }
      // Détection de la recommandation Carter-Cash
      else if (data.text.includes('Carter-Cash') || 
               data.text.includes('dépôt') || 
               data.text.includes('démonté') ||
               data.text.includes('magasin')) {
        recommendedAction = {
          type: 'carter',
          url: RECOMMENDATION_URLS.carter,
          text: 'Trouver un magasin Carter-Cash →',
          color: '#ff6b35'
        };
      }
      // Si indécis, proposer le quiz
      else if (data.text.includes('questions') || 
               data.text.includes('évaluer') || 
               data.text.includes('diagnostic complet')) {
        recommendedAction = {
          type: 'quiz',
          url: RECOMMENDATION_URLS.quiz,
          text: 'Faire le quiz pour trouver ma solution →',
          color: '#00a651'
        };
      }

      const botMessage = { 
        from: 'bot', 
        text: data.text,
        action: recommendedAction
      };
      
      setMessages(prev => [...prev, botMessage]);
      
      if (recommendedAction) {
        setNextAction(recommendedAction);
      }

    } catch (err) {
      setError('Désolé, une erreur est survenue. Veuillez réessayer.');
      console.error('Erreur:', err);
    } finally {
      setLoading(false);
    }
  }

  // Fonction pour gérer les clics sur les CTA
  function handleCTAClick(action) {
    // Tracking optionnel
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('event', 'cta_click', {
        event_category: 'bot_interaction',
        event_label: action.type,
        value: 1
      });
    }
    console.log(`CTA clicked: ${action.type}`);
  }

  return (
    <>
      <Head>
        <title>AutoAI Re-FAP - Diagnostic FAP Gratuit</title>
        <meta name="description" content="Assistant IA pour diagnostiquer vos problèmes de FAP et vous orienter vers la solution adaptée" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main className="container">
        <div className="chat-container">
          <div className="chat-header">
            <h1>🤖 AutoAI Re-FAP</h1>
            <p>Diagnostic intelligent de votre FAP</p>
          </div>

          <div className="chat-messages">
            {messages.map((message, index) => (
              <div key={index} className={`message ${message.from}`}>
                <div className="message-content">
                  {message.from === 'bot' ? (
                    <>
                      <ReactMarkdown>{message.text}</ReactMarkdown>
                      
                      {/* Afficher le bouton CTA si présent */}
                      {message.action && (
                        <div className="cta-container">
                          <a
                            href={message.action.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => handleCTAClick(message.action)}
                            className="cta-button"
                            style={{
                              backgroundColor: message.action.color,
                              color: 'white',
                              padding: '12px 24px',
                              borderRadius: '8px',
                              textDecoration: 'none',
                              display: 'inline-block',
                              fontWeight: '600',
                              marginTop: '15px',
                              transition: 'transform 0.2s, box-shadow 0.2s',
                              boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                            }}
                            onMouseOver={(e) => {
                              e.currentTarget.style.transform = 'translateY(-2px)';
                              e.currentTarget.style.boxShadow = '0 4px 8px rgba(0,0,0,0.15)';
                            }}
                            onMouseOut={(e) => {
                              e.currentTarget.style.transform = 'translateY(0)';
                              e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                            }}
                          >
                            {message.action.type === 'garage' && '🔧 '}
                            {message.action.type === 'carter' && '📍 '}
                            {message.action.type === 'quiz' && '🎯 '}
                            {message.action.text}
                          </a>
                        </div>
                      )}
                    </>
                  ) : (
                    <p>{message.text}</p>
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="message bot">
                <div className="typing-indicator">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              </div>
            )}

            {error && (
              <div className="error-message">
                <p>{error}</p>
              </div>
            )}

            <div ref={chatEndRef} />
          </div>

          {/* Afficher l'action principale en bas si elle existe */}
          {nextAction && !blocked && (
            <div className="sticky-cta">
              <p style={{ marginBottom: '10px', color: '#666', fontSize: '14px' }}>
                💡 Solution recommandée pour vous :
              </p>
              <a
                href={nextAction.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => handleCTAClick(nextAction)}
                className="main-cta-button"
                style={{
                  backgroundColor: nextAction.color,
                  color: 'white',
                  padding: '14px 32px',
                  borderRadius: '8px',
                  textDecoration: 'none',
                  display: 'inline-block',
                  fontWeight: '600',
                  fontSize: '16px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                  transition: 'all 0.3s',
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.transform = 'scale(1.05)';
                  e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.2)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.transform = 'scale(1)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
                }}
              >
                {nextAction.type === 'garage' && '🔧 '}
                {nextAction.type === 'carter' && '📍 '}
                {nextAction.type === 'quiz' && '🎯 '}
                {nextAction.text}
              </a>
            </div>
          )}

          <form onSubmit={handleSubmit} className={`chat-input ${blocked ? 'disabled' : ''}`}>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={blocked ? "Session terminée" : "Décrivez votre problème de FAP..."}
              disabled={loading || blocked}
              maxLength={500}
            />
            <button type="submit" disabled={loading || blocked || !input.trim()}>
              {loading ? '⏳' : '➤'}
            </button>
          </form>

          {blocked && (
            <div className="session-ended">
              <p>Session terminée (10 messages max)</p>
              <button 
                onClick={() => window.location.reload()}
                className="restart-button"
              >
                Nouvelle conversation
              </button>
            </div>
          )}

          <div className="footer-info">
            <p>
              💬 {messages.filter(m => m.from === 'user').length}/10 messages
            </p>
            <p style={{ fontSize: '12px', color: '#999', marginTop: '10px' }}>
              Powered by Re-FAP • Diagnostic IA gratuit
            </p>
          </div>
        </div>
      </main>

      <style jsx>{`
        .container {
          min-height: 100vh;
          padding: 20px;
          background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
          display: flex;
          justify-content: center;
          align-items: center;
        }

        .chat-container {
          width: 100%;
          max-width: 600px;
          background: white;
          border-radius: 20px;
          box-shadow: 0 10px 40px rgba(0,0,0,0.1);
          overflow: hidden;
          display: flex;
          flex-direction: column;
          height: 85vh;
        }

        .chat-header {
          background: linear-gradient(135deg, #00a651 0%, #008844 100%);
          color: white;
          padding: 20px;
          text-align: center;
        }

        .chat-header h1 {
          margin: 0;
          font-size: 24px;
        }

        .chat-header p {
          margin: 5px 0 0;
          opacity: 0.9;
          font-size: 14px;
        }

        .chat-messages {
          flex: 1;
          overflow-y: auto;
          padding: 20px;
          background: #fafafa;
        }

        .message {
          margin-bottom: 15px;
          animation: slideIn 0.3s ease;
        }

        .message.user .message-content {
          background: #00a651;
          color: white;
          padding: 12px 16px;
          border-radius: 18px 18px 4px 18px;
          margin-left: auto;
          max-width: 80%;
          word-wrap: break-word;
        }

        .message.bot .message-content {
          background: white;
          color: #333;
          padding: 12px 16px;
          border-radius: 18px 18px 18px 4px;
          max-width: 85%;
          box-shadow: 0 2px 5px rgba(0,0,0,0.1);
        }

        .typing-indicator {
          display: flex;
          padding: 15px;
          background: white;
          border-radius: 18px;
          width: 60px;
          box-shadow: 0 2px 5px rgba(0,0,0,0.1);
        }

        .typing-indicator span {
          height: 8px;
          width: 8px;
          background: #00a651;
          border-radius: 50%;
          margin: 0 2px;
          animation: typing 1.4s infinite;
        }

        .typing-indicator span:nth-child(2) {
          animation-delay: 0.2s;
        }

        .typing-indicator span:nth-child(3) {
          animation-delay: 0.4s;
        }

        @keyframes typing {
          0%, 60%, 100% {
            transform: translateY(0);
            opacity: 0.5;
          }
          30% {
            transform: translateY(-10px);
            opacity: 1;
          }
        }

        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .chat-input {
          display: flex;
          padding: 20px;
          background: white;
          border-top: 1px solid #eee;
        }

        .chat-input input {
          flex: 1;
          padding: 12px 16px;
          border: 2px solid #e0e0e0;
          border-radius: 25px;
          font-size: 14px;
          outline: none;
          transition: border-color 0.3s;
        }

        .chat-input input:focus {
          border-color: #00a651;
        }

        .chat-input button {
          margin-left: 10px;
          padding: 12px 20px;
          background: #00a651;
          color: white;
          border: none;
          border-radius: 50%;
          width: 45px;
          height: 45px;
          cursor: pointer;
          transition: all 0.3s;
          font-size: 18px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .chat-input button:hover:not(:disabled) {
          background: #008844;
          transform: scale(1.1);
        }

        .chat-input button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .chat-input.disabled {
          opacity: 0.6;
          pointer-events: none;
        }

        .error-message {
          background: #ffebee;
          color: #c62828;
          padding: 10px;
          border-radius: 8px;
          margin: 10px 0;
        }

        .session-ended {
          text-align: center;
          padding: 20px;
          background: #fff3e0;
          border-top: 1px solid #ffcc80;
        }

        .restart-button {
          margin-top: 10px;
          padding: 10px 24px;
          background: #ff6b35;
          color: white;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-weight: 600;
          transition: background 0.3s;
        }

        .restart-button:hover {
          background: #e55a2b;
        }

        .footer-info {
          padding: 15px;
          text-align: center;
          background: #f5f5f5;
          border-top: 1px solid #eee;
          color: #666;
          font-size: 14px;
        }

        .cta-container {
          margin-top: 15px;
        }

        .sticky-cta {
          padding: 15px;
          background: #f0f9f4;
          border-top: 2px solid #00a651;
          text-align: center;
          animation: slideUp 0.4s ease;
        }

        @keyframes slideUp {
          from {
            transform: translateY(100%);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }

        @media (max-width: 640px) {
          .chat-container {
            height: 100vh;
            border-radius: 0;
          }
          
          .container {
            padding: 0;
          }

          .message.user .message-content,
          .message.bot .message-content {
            max-width: 90%;
          }
        }
      `}</style>
    </>
  );
}
