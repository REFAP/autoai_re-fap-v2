// /pages/index.js
// FAPexpert Re-FAP - Interface Chat
// VERSION 4.4 - Quick Replies + Disclaimer IA + UX améliorée

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
  // Après le welcome message
  initial: [
    { label: "Voyant allumé", value: "J'ai un voyant allumé sur le tableau de bord" },
    { label: "Perte de puissance", value: "Ma voiture a perdu de la puissance" },
    { label: "Fumée anormale", value: "Ma voiture fume anormalement" },
  ],
  // Après question sur le véhicule
  vehicule: [
    { label: "Peugeot", value: "C'est une Peugeot" },
    { label: "Renault", value: "C'est une Renault" },
    { label: "Citroën", value: "C'est une Citroën" },
    { label: "Autre marque", value: "Autre marque" },
  ],
  // Après la question closing
  closing: [
    { label: "Oui, je veux être rappelé", value: "Oui" },
    { label: "Plus tard", value: "Non merci, plus tard" },
  ],
};

// Détecter quel set de quick replies afficher
function getQuickRepliesForContext(messages) {
  if (messages.length === 0) {
    return QUICK_REPLIES_CONFIG.initial;
  }
  
  const lastAssistant = [...messages].reverse().find(m => m.role === "assistant");
  if (!lastAssistant) return null;
  
  const content = (lastAssistant.raw || lastAssistant.content || "").toLowerCase();
  
  // Closing question
  if (content.includes("expert re-fap analyse") || content.includes("gratuit et sans engagement")) {
    return QUICK_REPLIES_CONFIG.closing;
  }
  
  // Question véhicule
  if (content.includes("quelle voiture") || content.includes("quel véhicule") || content.includes("marque") || content.includes("modèle")) {
    return QUICK_REPLIES_CONFIG.vehicule;
  }
  
  return null;
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
  const [showModal, setShowModal] = useState(false);
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
  }, [messages]);

  // --------------------------------------------------------
  // ENVOI MESSAGE
  // --------------------------------------------------------
  const sendMessage = async (messageText) => {
    const userMessage = typeof messageText === "string" ? messageText : input.trim();
    if (!userMessage || isLoading || !sessionId) return;

    setInput("");
    setError(null);

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

      // HANDLE ACTION : OPEN_FORM
      if (data.action?.type === "OPEN_FORM" && data.action?.url) {
        setFormUrl(data.action.url);
        setTimeout(() => setShowModal(true), 2000);
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

  // --------------------------------------------------------
  // NOUVELLE CONVERSATION
  // --------------------------------------------------------
  const startNewConversation = () => {
    const newSessionId = generateSessionId();
    localStorage.setItem("fapexpert_session_id", newSessionId);
    setSessionId(newSessionId);
    setMessages([]);
    setError(null);
    setShowModal(false);
  };

  // --------------------------------------------------------
  // QUICK REPLIES
  // --------------------------------------------------------
  const quickReplies = !isLoading ? getQuickRepliesForContext(messages) : null;

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

      {/* ============================================================ */}
      {/* MODAL FORMULAIRE                                             */}
      {/* ============================================================ */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowModal(false)}>
              ✕
            </button>
            <div className="modal-header">
              <h2>Demande de rappel</h2>
              <p>Laissez vos coordonnées, on vous rappelle rapidement.</p>
            </div>
            <iframe
              src={formUrl}
              className="modal-iframe"
              title="Formulaire de contact"
            />
          </div>
        </div>
      )}

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
          align-items: flex-end;
          gap: 8px;
          max-width: 85%;
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
        /* MODAL                                                         */
        /* ============================================================ */
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.6);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 20px;
          animation: fadeIn 0.2s ease;
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        .modal-content {
          background: white;
          border-radius: 16px;
          width: 100%;
          max-width: 480px;
          max-height: 90vh;
          overflow: hidden;
          position: relative;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
          animation: slideUp 0.3s ease;
        }

        @keyframes slideUp {
          from { transform: translateY(30px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }

        .modal-close {
          position: absolute;
          top: 12px;
          right: 12px;
          background: #f5f5f5;
          border: none;
          width: 32px;
          height: 32px;
          border-radius: 50%;
          cursor: pointer;
          font-size: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 0.2s;
          z-index: 10;
        }

        .modal-close:hover {
          background: #e5e5e5;
        }

        .modal-header {
          padding: 24px 24px 16px;
          border-bottom: 1px solid #e5e7eb;
        }

        .modal-header h2 {
          margin: 0 0 8px 0;
          font-size: 20px;
          color: #1e3a5f;
        }

        .modal-header p {
          margin: 0;
          color: #666;
          font-size: 14px;
        }

        .modal-iframe {
          width: 100%;
          height: 500px;
          border: none;
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
            max-width: 90%;
          }

          .message-content {
            font-size: 14px;
            padding: 10px 14px;
          }

          .quick-reply-btn {
            padding: 8px 14px;
            font-size: 13px;
          }

          .chat-input {
            font-size: 16px; /* Prevent zoom on iOS */
            padding: 12px 16px;
          }

          .modal-content {
            max-height: 85vh;
            margin: 10px;
          }

          .modal-iframe {
            height: 400px;
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
