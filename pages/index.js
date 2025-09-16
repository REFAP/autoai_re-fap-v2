import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import Head from 'next/head';
import ReactMarkdown from 'react-markdown';

// Configuration centralisée
const BOT_CONFIG = {
  MAX_MESSAGES: 15,
  MAX_INPUT_LENGTH: 800,
  SESSION_TIMEOUT: 1800000, // 30 minutes
  TYPING_SPEED: 30,
  AUTO_SCROLL_DELAY: 100,
  ANIMATION_DURATION: 300,
  ENABLE_QUICK_REPLIES: true,
  ENABLE_LOCAL_STORAGE: true,
  API_TIMEOUT: 10000,
  RETRY_ATTEMPTS: 3,
};

// Suggestions rapides contextuelles
const QUICK_SUGGESTIONS = [
  { icon: "🚗", text: "Voyant FAP allumé" },
  { icon: "💨", text: "Perte de puissance" },
  { icon: "⚠️", text: "Message d'erreur FAP" },
  { icon: "🔧", text: "Régénération impossible" },
  { icon: "🛑", text: "Mode dégradé actif" },
];

export default function Home() {
  // États principaux
  const [messages, setMessages] = useState([
    {
      from: 'bot',
      text: "Bonjour ! Je suis AutoAI, votre expert Re-FAP. Je diagnostique vos problèmes de FAP et vous oriente vers la solution adaptée. Décrivez votre problème ou choisissez une suggestion ci-dessous.",
      timestamp: Date.now()
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [error, setError] = useState('');
  const [nextAction, setNextAction] = useState(null);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [typingIndicator, setTypingIndicator] = useState('');
  const [messagesRemaining, setMessagesRemaining] = useState(BOT_CONFIG.MAX_MESSAGES);
  const [sessionStartTime] = useState(Date.now());
  const [showResumeDialog, setShowResumeDialog] = useState(false);
  const [savedConversation, setSavedConversation] = useState(null);
  
  // Refs
  const chatEndRef = useRef();
  const inputRef = useRef();
  const retryCountRef = useRef(0);

  // Analytics tracking
  const trackEvent = useCallback((action, label, value) => {
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('event', action, {
        event_category: 'AutoAI_Bot',
        event_label: label,
        value: value
      });
    }
  }, []);

  // Formatage du timestamp
  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('fr-FR', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  // Gestion de la sauvegarde locale
  useEffect(() => {
    if (BOT_CONFIG.ENABLE_LOCAL_STORAGE && messages.length > 1) {
      const conversationData = {
        messages: messages.slice(-20),
        timestamp: Date.now(),
        nextAction: nextAction
      };
      try {
        localStorage.setItem('autoai_conversation', JSON.stringify(conversationData));
      } catch (e) {
        console.error('Erreur sauvegarde locale:', e);
      }
    }
  }, [messages, nextAction]);

  // Restauration de la conversation
  useEffect(() => {
    if (BOT_CONFIG.ENABLE_LOCAL_STORAGE) {
      try {
        const saved = localStorage.getItem('autoai_conversation');
        if (saved) {
          const data = JSON.parse(saved);
          if (Date.now() - data.timestamp < 86400000) { // 24h
            setSavedConversation(data);
            setShowResumeDialog(true);
          }
        }
      } catch (e) {
        console.error('Erreur restauration:', e);
      }
    }
  }, []);

  // Gestion de la reprise de conversation
  const handleResumeConversation = (resume) => {
    if (resume && savedConversation) {
      setMessages(savedConversation.messages);
      setNextAction(savedConversation.nextAction);
      trackEvent('conversation_resumed', 'auto_restore', 1);
    }
    setShowResumeDialog(false);
    setSavedConversation(null);
  };

  // Auto-scroll optimisé
  useEffect(() => {
    const scrollTimer = setTimeout(() => {
      chatEndRef.current?.scrollIntoView({ 
        behavior: 'smooth',
        block: 'end'
      });
    }, BOT_CONFIG.AUTO_SCROLL_DELAY);
    
    return () => clearTimeout(scrollTimer);
  }, [messages, loading]);

  // Gestion du timeout de session
  useEffect(() => {
    const checkTimeout = setInterval(() => {
      if (Date.now() - sessionStartTime > BOT_CONFIG.SESSION_TIMEOUT) {
        setBlocked(true);
        setError("Session expirée. Veuillez rafraîchir la page.");
      }
    }, 60000); // Vérifier chaque minute

    return () => clearInterval(checkTimeout);
  }, [sessionStartTime]);

  // Mise à jour du compteur de messages
  useEffect(() => {
    const userMessages = messages.filter(m => m.from === 'user').length;
    setMessagesRemaining(BOT_CONFIG.MAX_MESSAGES - userMessages);
  }, [messages]);

  // Historique intelligent
  function getHistoriqueText() {
    const lastMessages = messages.slice(-7); // Plus de contexte
    return lastMessages
      .map((m) => {
        const role = m.from === 'user' ? 'Client' : 'AutoAI';
        return `${role}: ${m.text}`;
      })
      .join('\n');
  }

  // CTA contextuel intelligent
  const getSmartCTA = useCallback(() => {
    const lastMessages = messages.slice(-3).map(m => m.text.toLowerCase());
    const keywords = lastMessages.join(' ');
    
    if (keywords.includes('urgent') || keywords.includes('panne')) {
      return { type: 'URGENT', priority: 'high' };
    }
    if (keywords.includes('prix') || keywords.includes('coût') || keywords.includes('tarif')) {
      return { type: 'DEVIS', priority: 'medium' };
    }
    if (keywords.includes('diagnostic') || keywords.includes('vérifier')) {
      return { type: 'DIAG', priority: 'medium' };
    }
    return { type: 'FAP', priority: 'normal' };
  }, [messages]);

  // Fonction de retry avec backoff exponentiel
  const fetchWithRetry = async (url, options, attempt = 0) => {
    try {
      const response = await fetch(url, options);
      if (!response.ok && response.status === 429 && attempt < BOT_CONFIG.RETRY_ATTEMPTS) {
        const delay = Math.pow(2, attempt) * 1000; // Backoff exponentiel
        await new Promise(resolve => setTimeout(resolve, delay));
        return fetchWithRetry(url, options, attempt + 1);
      }
      return response;
    } catch (error) {
      if (attempt < BOT_CONFIG.RETRY_ATTEMPTS) {
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
        return fetchWithRetry(url, options, attempt + 1);
      }
      throw error;
    }
  };

  // Soumission optimisée
  async function handleSubmit(e) {
    e?.preventDefault();

    const userMessagesCount = messages.filter(m => m.from === 'user').length;
    if (userMessagesCount >= BOT_CONFIG.MAX_MESSAGES) {
      setBlocked(true);
      setError(`Session limitée à ${BOT_CONFIG.MAX_MESSAGES} messages. Veuillez rafraîchir la page.`);
      trackEvent('session_limit_reached', 'messages', userMessagesCount);
      return;
    }

    const trimmedInput = input.trim();
    if (!trimmedInput) return;

    // Tracking
    trackEvent('send_message', 'user_query', trimmedInput.length);

    const userMsg = { 
      from: 'user', 
      text: trimmedInput,
      timestamp: Date.now()
    };
    
    setMessages((msgs) => [...msgs, userMsg]);
    setInput('');
    setLoading(true);
    setError('');
    setShowSuggestions(false);

    const historiqueText = getHistoriqueText() + `\nClient: ${trimmedInput}`;
    
    // Déterminer le contexte pour l'action suivante
    const smartCTA = getSmartCTA();

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), BOT_CONFIG.API_TIMEOUT);

      const res = await fetchWithRetry('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: trimmedInput,
          historique: historiqueText,
          context: smartCTA,
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      setLoading(false);

      if (!res.ok) {
        if (res.status === 429) {
          setMessages((msgs) => [
            ...msgs,
            { 
              from: 'bot', 
              text: "Service temporairement saturé. Veuillez réessayer dans quelques instants.",
              timestamp: Date.now()
            },
          ]);
          trackEvent('api_error', 'rate_limit', 429);
        } else {
          setMessages((msgs) => [
            ...msgs,
            { 
              from: 'bot', 
              text: `Erreur serveur ${res.status}. Notre équipe technique a été notifiée.`,
              timestamp: Date.now()
            },
          ]);
          trackEvent('api_error', 'server_error', res.status);
        }
        return;
      }

      const data = await res.json();
      
      // Simulation d'écriture progressive (optionnel)
      const botMsg = {
        from: 'bot',
        text: data.reply || "Service temporairement indisponible. Veuillez réessayer.",
        timestamp: Date.now()
      };
      
      setMessages((msgs) => [...msgs, botMsg]);
      setNextAction(data.nextAction || smartCTA);
      
      // Tracking de succès
      trackEvent('receive_response', 'bot_reply', data.reply?.length || 0);

    } catch (error) {
      setLoading(false);
      
      if (error.name === 'AbortError') {
        setMessages((msgs) => [
          ...msgs,
          { 
            from: 'bot', 
            text: "La requête a pris trop de temps. Veuillez réessayer.",
            timestamp: Date.now()
          },
        ]);
        trackEvent('api_error', 'timeout', 1);
      } else {
        setMessages((msgs) => [
          ...msgs,
          { 
            from: 'bot', 
            text: "Erreur de connexion. Vérifiez votre connexion internet.",
            timestamp: Date.now()
          },
        ]);
        trackEvent('api_error', 'network_error', 1);
      }
    }
  }

  // Gestion des suggestions rapides
  const handleQuickSuggestion = (suggestion) => {
    setInput(suggestion.text);
    setShowSuggestions(false);
    trackEvent('quick_suggestion_used', suggestion.text, 1);
    // Auto-submit après sélection
    setTimeout(() => {
      if (inputRef.current) {
        handleSubmit();
      }
    }, 100);
  };

  // Copie du message
  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).then(() => {
      trackEvent('copy_message', 'clipboard', 1);
    });
  };

  // Raccourcis clavier
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ctrl/Cmd + Enter pour envoyer
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        handleSubmit();
      }
      // Escape pour effacer
      if (e.key === 'Escape') {
        setInput('');
        setError('');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [input]);

  return (
    <>
      <Head>
        <title>AutoAI - Expert FAP par Re-FAP | Diagnostic Gratuit</title>
        <meta name="description" content="Expert en diagnostic FAP disponible 24/7. Service garanti partout en France." />
        <link rel="stylesheet" href="/style.css" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </Head>

      <div className="app-container">
        {/* Dialog de reprise de conversation */}
        {showResumeDialog && (
          <div className="resume-dialog">
            <div className="dialog-content">
              <h3>Reprendre la conversation ?</h3>
              <p>Nous avons trouvé une conversation en cours. Voulez-vous la reprendre ?</p>
              <div className="dialog-actions">
                <button onClick={() => handleResumeConversation(true)} className="btn-primary">
                  Reprendre
                </button>
                <button onClick={() => handleResumeConversation(false)} className="btn-secondary">
                  Nouvelle conversation
                </button>
              </div>
            </div>
          </div>
        )}

        <main className="chat-container">
          {/* Header amélioré */}
          <div className="chat-header">
            <div className="header-content">
              <div className="logo-section">
                <div className="logo-circle">
                  <span className="logo-text">AI</span>
                </div>
                <div className="header-text">
                  <h1>AutoAI par Re-FAP</h1>
                  <p className="subtitle">Expert en diagnostic FAP • Service disponible 24/7</p>
                </div>
              </div>
              <div className="header-right">
                <div className="status-indicator">
                  <span className="status-dot"></span>
                  <span>En ligne</span>
                </div>
                {messagesRemaining <= 5 && (
                  <div className="messages-remaining">
                    {messagesRemaining} messages restants
                  </div>
                )}
              </div>
            </div>
            {/* Barre de progression */}
            <div 
              className="conversation-progress" 
              style={{'--progress': `${((BOT_CONFIG.MAX_MESSAGES - messagesRemaining) / BOT_CONFIG.MAX_MESSAGES) * 100}%`}}
            />
          </div>

          <div className="chat-main">
            {/* Zone de chat améliorée */}
            <div className="chat-area">
              <div className="messages-container" role="log" aria-live="polite">
                {messages.map((m, i) => (
                  <div 
                    key={i} 
                    className={`message ${m.from}`}
                    role="article"
                    aria-label={`Message de ${m.from === 'user' ? 'vous' : 'AutoAI'}`}
                  >
                    <div className="message-header">
                      <span className={`message-author ${m.from}-author`}>
                        {m.from === 'user' ? 'Vous' : 'AutoAI'}
                      </span>
                      {m.timestamp && (
                        <span className="message-timestamp">
                          {formatTimestamp(m.timestamp)}
                        </span>
                      )}
                    </div>
                    <div className="message-bubble">
                      <ReactMarkdown>{m.text.replace(/\n{2,}/g, '\n')}</ReactMarkdown>
                      {m.from === 'bot' && (
                        <button 
                          className="copy-button"
                          onClick={() => copyToClipboard(m.text)}
                          aria-label="Copier le message"
                        >
                          📋
                        </button>
                      )}
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

              {/* Suggestions rapides */}
              {showSuggestions && messagesRemaining > 0 && BOT_CONFIG.ENABLE_QUICK_REPLIES && (
                <div className="quick-suggestions">
                  <p className="suggestions-title">Problèmes fréquents :</p>
                  <div className="suggestions-grid">
                    {QUICK_SUGGESTIONS.map((suggestion, i) => (
                      <button
                        key={i}
                        className="suggestion-chip"
                        onClick={() => handleQuickSuggestion(suggestion)}
                      >
                        <span className="suggestion-icon">{suggestion.icon}</span>
                        <span className="suggestion-text">{suggestion.text}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Zone de saisie améliorée */}
              <form onSubmit={handleSubmit} className="input-form">
                <div className="input-wrapper">
                  <input
                    ref={inputRef}
                    type="text"
                    placeholder={blocked ? "Session terminée" : "Décrivez votre problème de FAP..."}
                    value={input}
                    onChange={(e) => {
                      const val = e.target.value;
                      setInput(val);
                      setError(val.length > BOT_CONFIG.MAX_INPUT_LENGTH 
                        ? `Message limité à ${BOT_CONFIG.MAX_INPUT_LENGTH} caractères` 
                        : '');
                    }}
                    autoComplete="off"
                    className="message-input"
                    disabled={blocked}
                    maxLength={BOT_CONFIG.MAX_INPUT_LENGTH}
                    aria-label="Zone de saisie du message"
                  />
                  <div className="input-actions">
                    {input.length > 0 && (
                      <span className="char-count">
                        {input.length}/{BOT_CONFIG.MAX_INPUT_LENGTH}
                      </span>
                    )}
                    <button 
                      type="submit" 
                      className="send-button"
                      disabled={blocked || input.length > BOT_CONFIG.MAX_INPUT_LENGTH || loading || !input.trim()}
                      aria-label="Envoyer le message"
                    >
                      {loading ? (
                        <span className="button-loading">⏳</span>
                      ) : (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                          <path d="M22 2L11 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          <path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
                {error && <div className="error-message" role="alert">{error}</div>}
                <div className="input-help">
                  <span>💡 Astuce : Utilisez Ctrl+Enter pour envoyer</span>
                </div>
              </form>
            </div>

            {/* Zone CTA dynamique */}
            <div className="cta-zone">
              <div className="cta-header">
                <h3>Actions recommandées</h3>
                <p>Solutions adaptées à votre situation</p>
              </div>

              {/* CTAs contextuels */}
              {nextAction?.type === 'URGENT' && (
                <a 
                  href="tel:+33123456789" 
                  className="cta-button urgent"
                  onClick={() => trackEvent('cta_click', 'urgent_call', 1)}
                >
                  <div className="cta-icon">🚨</div>
                  <div className="cta-content">
                    <span className="cta-title">Appel d'urgence</span>
                    <span className="cta-subtitle">Intervention immédiate</span>
                  </div>
                  <svg className="cta-arrow" width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                </a>
              )}

              {(nextAction?.type === 'FAP' || !nextAction) && (
                <>
                  <a 
                    href="https://re-fap.fr/trouver_garage_partenaire/" 
                    className="cta-button primary"
                    onClick={() => trackEvent('cta_click', 'garage_partner', 1)}
                  >
                    <div className="cta-icon">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                        <path d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z" fill="currentColor"/>
                      </svg>
                    </div>
                    <div className="cta-content">
                      <span className="cta-title">FAP monté ?</span>
                      <span className="cta-subtitle">RDV en garage proche</span>
                    </div>
                    <svg className="cta-arrow" width="20" height="20" viewBox="0 0 24 24" fill="none">
                      <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                  </a>

                  <a 
                    href="https://auto.re-fap.fr" 
                    className="cta-button secondary"
                    onClick={() => trackEvent('cta_click', 'carter_cash', 1)}
                  >
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
                <a 
                  href="https://re-fap.fr/trouver_garage_partenaire/" 
                  className="cta-button primary"
                  onClick={() => trackEvent('cta_click', 'diagnostic', 1)}
                >
                  <div className="cta-icon">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                      <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2"/>
                      <path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                  </div>
                  <div className="cta-content">
                    <span className="cta-title">Diagnostic complet</span>
                    <span className="cta-subtitle">Expert à proximité</span>
                  </div>
                  <svg className="cta-arrow" width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                </a>
              )}

              {nextAction?.type === 'DEVIS' && (
                <a 
                  href="https://re-fap.fr/devis" 
                  className="cta-button highlight"
                  onClick={() => trackEvent('cta_click', 'quote', 1)}
                >
                  <div className="cta-icon">💶</div>
                  <div className="cta-content">
                    <span className="cta-title">Devis gratuit</span>
                    <span className="cta-subtitle">Sans engagement</span>
                  </div>
                  <svg className="cta-arrow" width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                </a>
              )}

              {/* Informations de garantie */}
              <div className="info-card">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
                  <path d="M12 16v-4M12 8h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
                <div className="info-content">
                  <span className="info-title">Garanties Re-FAP</span>
                  <ul className="info-list">
                    <li>✓ Service garanti 1 an</li>
                    <li>✓ 500+ garages partenaires</li>
                    <li>✓ Intervention sous 48h</li>
                    <li>✓ Devis gratuit</li>
                  </ul>
                </div>
              </div>

              {/* Témoignage client */}
              <div className="testimonial-card">
                <div className="testimonial-header">
                  <div className="stars">⭐⭐⭐⭐⭐</div>
                  <span className="testimonial-source">Trustpilot</span>
                </div>
                <p className="testimonial-text">
                  "Service rapide et efficace. Mon FAP a été régénéré en 24h. Je recommande !"
                </p>
                <span className="testimonial-author">- Jean D.</span>
              </div>
            </div>
          </div>
        </main>

        <footer className="footer">
          <p>AutoAI utilise l'IA pour vous assister. Consultez toujours un professionnel pour confirmation.</p>
          <p className="footer-links">
            <a href="/privacy">Confidentialité</a> • 
            <a href="/terms">CGU</a> • 
            <a href="/contact">Contact</a>
          </p>
        </footer>
      </div>
    </>
  );
}
