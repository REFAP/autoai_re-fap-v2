// /pages/index.js
// FAPexpert Re-FAP - Interface Chat
// VERSION 4.5 - Transition douce vers formulaire (carte CTA intégrée)

import { useState, useEffect, useRef } from "react";
import Head from "next/head";

// ============================================================
// HELPERS
// ============================================================
function cleanMessageForDisplay(content) {
  if (!content || typeof content !== "string") return "";
  
  let text = content;
  const dataIndex = text.indexOf("DATA:");
  if (dataIndex !== -1) {
    text = text.substring(0, dataIndex);
  }
  return text.trim();
}

function generateSessionId() {
  return "session_" + Date.now() + "_" + Math.random().toString(36).substring(2, 11);
}

// ============================================================
// QUICK REPLIES CONFIG
// ============================================================
const QUICK_REPLIES_CONFIG = {
  initial: [
    { label: "Voyant allumé", value: "J'ai un voyant allumé sur le tableau de bord" },
    { label: "Perte de puissance", value: "Ma voiture a perdu de la puissance" },
    { label: "Fumée anormale", value: "Ma voiture fume anormalement" },
  ],
  vehicule: [
    { label: "Peugeot", value: "C'est une Peugeot" },
    { label: "Renault", value: "C'est une Renault" },
    { label: "Citroën", value: "C'est une Citroën" },
    { label: "Autre marque", value: "Autre marque" },
  ],
  closing: [
    { label: "Oui, je veux être rappelé", value: "Oui" },
    { label: "Plus tard", value: "Non merci, plus tard" },
  ],
};

function getQuickRepliesForContext(messages, showFormCTA) {
  // Pas de quick replies si on affiche la carte CTA
  if (showFormCTA) return null;
  
  if (messages.length === 0) {
    return QUICK_REPLIES_CONFIG.initial;
  }
  
  const lastAssistant = [...messages].reverse().find(m => m.role === "assistant");
  if (!lastAssistant) return null;
  
  const content = (lastAssistant.raw || lastAssistant.content || "").toLowerCase();
  
  if (content.includes("expert re-fap analyse") || content.includes("gratuit et sans engagement")) {
    return QUICK_REPLIES_CONFIG.closing;
  }
  
  if (content.includes("quelle voiture") || content.includes("quel véhicule") || content.includes("marque") || content.includes("modèle")) {
    return QUICK_REPLIES_CONFIG.vehicule;
  }
  
  return null;
}

// ============================================================
// COMPOSANT CARTE CTA FORMULAIRE
// ============================================================
function FormCTACard({ onContinue, formUrl }) {
  return (
    <div className="form-cta-card">
      <div className="form-cta-icon">👨‍🔧</div>
      <h3 className="form-cta-title">Passez à l'étape suivante</h3>
      <p className="form-cta-text">
        Un expert Re-FAP va analyser votre situation et vous rappeler pour vous orienter vers la meilleure solution. 
        <strong> Pas de vente, juste des conseils.</strong>
      </p>
      
      <div className="form-cta-options">
        <div className="form-cta-option">
          <span className="option-icon">📞</span>
          <span>Être rappelé rapidement</span>
        </div>
        <div className="form-cta-option">
          <span className="option-icon">📝</span>
          <span>Demander un devis gratuit</span>
        </div>
        <div className="form-cta-option">
          <span className="option-icon">❓</span>
          <span>Poser une question</span>
        </div>
      </div>

      <a 
        href={formUrl} 
        target="_blank" 
        rel="noopener noreferrer"
        className="form-cta-button"
        onClick={onContinue}
      >
        Continuer vers le formulaire
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M5 12h14M12 5l7 7-7 7"/>
        </svg>
      </a>
      
      <p className="form-cta-reassurance">
        <span className="check-icon">✓</span> Gratuit et sans engagement
      </p>

      <style jsx>{`
        .form-cta-card {
          background: linear-gradient(135deg, #ffffff 0%, #f8fafe 100%);
          border: 2px solid #e8f0fe;
          border-radius: 16px;
          padding: 24px 20px;
          margin: 8px 0;
          max-width: 320px;
          box-shadow: 0 4px 20px rgba(30, 58, 95, 0.08);
        }

        .form-cta-icon {
          font-size: 36px;
          margin-bottom: 12px;
        }

        .form-cta-title {
          margin: 0 0 10px 0;
          font-size: 18px;
          font-weight: 700;
          color: #1e3a5f;
        }

        .form-cta-text {
          margin: 0 0 16px 0;
          font-size: 14px;
          color: #555;
          line-height: 1.5;
        }

        .form-cta-text strong {
          color: #1e3a5f;
        }

        .form-cta-options {
          background: #f5f8fc;
          border-radius: 10px;
          padding: 12px;
          margin-bottom: 16px;
        }

        .form-cta-option {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 0;
          font-size: 13px;
          color: #444;
        }

        .form-cta-option:not(:last-child) {
          border-bottom: 1px solid #e8ecf2;
        }

        .option-icon {
          font-size: 16px;
        }

        .form-cta-button {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          width: 100%;
          background: linear-gradient(135deg, #e85a2c 0%, #d4461a 100%);
          color: white;
          border: none;
          padding: 14px 20px;
          border-radius: 25px;
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          text-decoration: none;
          transition: all 0.2s;
          box-shadow: 0 4px 12px rgba(232, 90, 44, 0.3);
        }

        .form-cta-button:hover {
          transform: translateY(-1px);
          box-shadow: 0 6px 16px rgba(232, 90, 44, 0.4);
        }

        .form-cta-button:active {
          transform: translateY(0);
        }

        .form-cta-reassurance {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          margin: 14px 0 0 0;
          font-size: 12px;
          color: #22863a;
          font-weight: 500;
        }

        .check-icon {
          font-size: 14px;
        }
      `}</style>
    </div>
  );
}

// ============================================================
// COMPOSANT PRINCIPAL
// ============================================================
export default function Home() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [error, setError] = useState(null);
  const [showFormCTA, setShowFormCTA] = useState(false);
  const [formUrl, setFormUrl] = useState("");
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Init session + bootstrap cookie
  useEffect(() => {
    let storedSessionId = localStorage.getItem("fapexpert_session_id");
    if (!storedSessionId) {
      storedSessionId = generateSessionId();
      localStorage.setItem("fapexpert_session_id", storedSessionId);
    }
    setSessionId(storedSessionId);
    fetch("/api/bootstrap", { method: "POST", credentials: "include" }).catch(() => {});
  }, []);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, showFormCTA]);

  // --------------------------------------------------------
  // ENVOI MESSAGE
  // --------------------------------------------------------
  const sendMessage = async (messageText) => {
    const userMessage = typeof messageText === "string" ? messageText : input.trim();
    if (!userMessage || isLoading || !sessionId) return;

    setInput("");
    setError(null);
    setShowFormCTA(false); // Reset CTA si on envoie un nouveau message

    const newUserMessage = { role: "user", content: userMessage };
    setMessages((prev) => [...prev, newUserMessage]);
    setIsLoading(true);

    try {
      const historyForApi = messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
        raw: msg.raw || undefined,
      }));

      const response = await fetch("/api/chat", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMessage,
          session_id: sessionId,
          history: historyForApi,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        console.error("❌ Erreur API:", data);
        setError(JSON.stringify(data, null, 2));
        return;
      }

      const cleanedReply = cleanMessageForDisplay(data.reply);
      const assistantMessage = {
        role: "assistant",
        content: cleanedReply,
        raw: data.reply_full,
      };
      setMessages((prev) => [...prev, assistantMessage]);

      // --------------------------------------------------------
      // HANDLE ACTION : OPEN_FORM → Afficher carte CTA après délai
      // --------------------------------------------------------
      if (data.action?.type === "OPEN_FORM" && data.action?.url) {
        setFormUrl(data.action.url);
        // Délai pour laisser le temps de lire le message
        setTimeout(() => setShowFormCTA(true), 1500);
      }

    } catch (err) {
      console.error("❌ Erreur fetch:", err);
      setError(JSON.stringify({ error: "Erreur de connexion", details: err.message }, null, 2));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    sendMessage(input.trim());
  };

  const handleQuickReply = (value) => {
    sendMessage(value);
  };

  const handleFormCTAClick = () => {
    // Analytics ou tracking ici si besoin
    console.log("✅ User clicked CTA → redirecting to form");
  };

  // --------------------------------------------------------
  // NOUVELLE CONVERSATION
  // --------------------------------------------------------
  const startNewConversation = () => {
    const newSessionId = generateSessionId();
    localStorage.setItem("fapexpert_session_id", newSessionId);
    setSessionId(newSessionId);
    setMessages([]);
    setError(null);
    setShowFormCTA(false);
  };

  // --------------------------------------------------------
  // QUICK REPLIES
  // --------------------------------------------------------
  const quickReplies = !isLoading ? getQuickRepliesForContext(messages, showFormCTA) : null;

  // --------------------------------------------------------
  // RENDER
  // --------------------------------------------------------
  return (
    <>
      <Head>
        <title>FAPexpert - Diagnostic FAP en ligne | Re-FAP</title>
        <meta
          name="description"
          content="Diagnostic gratuit de votre Filtre à Particules (FAP). Voyant allumé ? Perte de puissance ? Notre expert IA vous guide."
        />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <div className="chat-container">
        {/* HEADER */}
        <header className="chat-header">
          <div className="header-content">
            <h1>FAPexpert</h1>
            <p className="header-subtitle">Diagnostic de votre Filtre à Particules</p>
          </div>
          <button
            onClick={startNewConversation}
            className="new-chat-btn"
            title="Nouvelle conversation"
          >
            + Nouveau
          </button>
        </header>

        {/* MESSAGES */}
        <main className="chat-messages">
          {messages.length === 0 && (
            <div className="welcome-message">
              <div className="welcome-icon">💬</div>
              <p className="welcome-title">Bonjour ! Je suis FAPexpert</p>
              <p className="welcome-text">Je vous aide à diagnostiquer les problèmes de Filtre à Particules. Décrivez-moi votre souci ou utilisez les boutons ci-dessous.</p>
            </div>
          )}

          {messages.map((msg, index) => {
            const displayContent = cleanMessageForDisplay(msg.content);
            if (!displayContent) return null;
            return (
              <div
                key={index}
                className={`message ${msg.role === "user" ? "message-user" : "message-assistant"}`}
              >
                {msg.role === "assistant" && <div className="avatar">🔧</div>}
                <div className="message-content">{displayContent}</div>
              </div>
            );
          })}

          {isLoading && (
            <div className="message message-assistant">
              <div className="avatar">🔧</div>
              <div className="message-content typing-indicator">
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
          )}

          {/* CARTE CTA FORMULAIRE */}
          {showFormCTA && (
            <div className="message message-assistant">
              <div className="avatar">🔧</div>
              <FormCTACard formUrl={formUrl} onContinue={handleFormCTAClick} />
            </div>
          )}

          {/* QUICK REPLIES */}
          {quickReplies && !isLoading && (
            <div className="quick-replies">
              {quickReplies.map((qr, idx) => (
                <button
                  key={idx}
                  className="quick-reply-btn"
                  onClick={() => handleQuickReply(qr.value)}
                >
                  {qr.label}
                </button>
              ))}
            </div>
          )}

          {error && (
            <div className="error-message">
              <strong>❌ Erreur :</strong>
              <pre>{error}</pre>
            </div>
          )}

          <div ref={messagesEndRef} />
        </main>

        {/* INPUT */}
        <div className="chat-input-wrapper">
          <form onSubmit={handleSubmit} className="chat-input-form">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Décrivez votre problème..."
              disabled={isLoading || !sessionId}
              className="chat-input"
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim() || !sessionId}
              className="send-btn"
              aria-label="Envoyer"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 2L11 13M22 2L15 22L11 13M11 13L2 9L22 2" />
              </svg>
            </button>
          </form>
          
          {/* DISCLAIMER IA */}
          <p className="disclaimer">
            FAPexpert est une IA et peut faire des erreurs. Veuillez vérifier les informations.
          </p>
        </div>
      </div>

      {/* STYLES */}
      <style jsx>{`
        .chat-container {
          display: flex;
          flex-direction: column;
          height: 100vh;
          height: 100dvh;
          max-width: 500px;
          margin: 0 auto;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          background: #f8f9fa;
        }

        /* HEADER */
        .chat-header {
          background: linear-gradient(135deg, #1e3a5f 0%, #2d5a87 100%);
          color: white;
          padding: 16px 20px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-shrink: 0;
        }

        .header-content h1 {
          margin: 0;
          font-size: 20px;
          font-weight: 700;
        }

        .header-subtitle {
          margin: 2px 0 0 0;
          font-size: 12px;
          opacity: 0.85;
        }

        .new-chat-btn {
          background: rgba(255, 255, 255, 0.15);
          border: 1px solid rgba(255, 255, 255, 0.25);
          color: white;
          padding: 8px 14px;
          border-radius: 20px;
          cursor: pointer;
          font-size: 13px;
          font-weight: 500;
          transition: all 0.2s;
        }

        .new-chat-btn:hover {
          background: rgba(255, 255, 255, 0.25);
        }

        /* MESSAGES */
        .chat-messages {
          flex: 1;
          overflow-y: auto;
          padding: 20px 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        /* WELCOME */
        .welcome-message {
          background: white;
          padding: 24px 20px;
          border-radius: 16px;
          text-align: center;
          box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
        }

        .welcome-icon {
          font-size: 32px;
          margin-bottom: 12px;
        }

        .welcome-title {
          margin: 0 0 8px 0;
          font-size: 18px;
          font-weight: 600;
          color: #1e3a5f;
        }

        .welcome-text {
          margin: 0;
          font-size: 14px;
          color: #666;
          line-height: 1.5;
        }

        /* MESSAGE BUBBLES */
        .message {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          max-width: 90%;
          animation: messageIn 0.3s ease;
        }

        @keyframes messageIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .message-user {
          align-self: flex-end;
          flex-direction: row-reverse;
        }

        .message-assistant {
          align-self: flex-start;
        }

        .avatar {
          width: 32px;
          height: 32px;
          background: #e8f4f8;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 16px;
          flex-shrink: 0;
          margin-top: 4px;
        }

        .message-content {
          padding: 12px 16px;
          border-radius: 18px;
          line-height: 1.5;
          font-size: 15px;
          white-space: pre-wrap;
          word-wrap: break-word;
        }

        .message-user .message-content {
          background: #1e3a5f;
          color: white;
          border-bottom-right-radius: 6px;
        }

        .message-assistant .message-content {
          background: white;
          color: #333;
          border-bottom-left-radius: 6px;
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
        }

        /* TYPING */
        .typing-indicator {
          display: flex;
          gap: 5px;
          padding: 16px 20px;
        }

        .typing-indicator span {
          width: 8px;
          height: 8px;
          background: #1e3a5f;
          border-radius: 50%;
          animation: typing 1.4s infinite ease-in-out;
        }

        .typing-indicator span:nth-child(1) { animation-delay: 0s; }
        .typing-indicator span:nth-child(2) { animation-delay: 0.2s; }
        .typing-indicator span:nth-child(3) { animation-delay: 0.4s; }

        @keyframes typing {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
          30% { transform: translateY(-6px); opacity: 1; }
        }

        /* QUICK REPLIES */
        .quick-replies {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          padding: 4px 0;
          align-self: flex-start;
          margin-left: 40px;
        }

        .quick-reply-btn {
          background: white;
          border: 1.5px solid #1e3a5f;
          color: #1e3a5f;
          padding: 10px 16px;
          border-radius: 20px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
        }

        .quick-reply-btn:hover {
          background: #1e3a5f;
          color: white;
        }

        .quick-reply-btn:active {
          transform: scale(0.97);
        }

        /* ERROR */
        .error-message {
          background: #fee2e2;
          border: 1px solid #ef4444;
          color: #b91c1c;
          padding: 12px;
          border-radius: 8px;
          font-size: 13px;
        }

        .error-message strong {
          display: block;
          margin-bottom: 6px;
        }

        .error-message pre {
          margin: 0;
          font-size: 11px;
          white-space: pre-wrap;
          word-wrap: break-word;
        }

        /* INPUT WRAPPER */
        .chat-input-wrapper {
          background: white;
          border-top: 1px solid #e5e7eb;
          padding: 12px 16px;
          padding-bottom: max(12px, env(safe-area-inset-bottom));
          flex-shrink: 0;
        }

        .chat-input-form {
          display: flex;
          gap: 10px;
          align-items: center;
        }

        .chat-input {
          flex: 1;
          padding: 14px 18px;
          border: 2px solid #e5e7eb;
          border-radius: 24px;
          font-size: 16px;
          outline: none;
          transition: border-color 0.2s;
        }

        .chat-input:focus {
          border-color: #1e3a5f;
        }

        .chat-input:disabled {
          background: #f9f9f9;
        }

        .send-btn {
          background: #1e3a5f;
          color: white;
          border: none;
          width: 48px;
          height: 48px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s;
          flex-shrink: 0;
        }

        .send-btn:hover:not(:disabled) {
          background: #2d5a87;
          transform: scale(1.05);
        }

        .send-btn:disabled {
          background: #ccc;
          cursor: not-allowed;
        }

        /* DISCLAIMER */
        .disclaimer {
          margin: 10px 0 0 0;
          font-size: 11px;
          color: #999;
          text-align: center;
        }

        /* ============================================================ */
        /* RESPONSIVE                                                    */
        /* ============================================================ */
        @media (max-width: 600px) {
          .chat-container {
            max-width: 100%;
          }

          .chat-header {
            padding: 14px 16px;
          }

          .header-content h1 {
            font-size: 18px;
          }

          .chat-messages {
            padding: 16px 12px;
          }

          .message {
            max-width: 95%;
          }

          .message-content {
            font-size: 14px;
            padding: 10px 14px;
          }

          .quick-replies {
            margin-left: 0;
          }

          .quick-reply-btn {
            padding: 8px 14px;
            font-size: 13px;
          }

          .chat-input {
            font-size: 16px;
            padding: 12px 16px;
          }
        }
      `}</style>

      <style jsx global>{`
        * { box-sizing: border-box; }
        html, body {
          margin: 0;
          padding: 0;
          background: #f8f9fa;
          -webkit-font-smoothing: antialiased;
        }
      `}</style>
    </>
  );
}
