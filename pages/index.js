// /pages/index.js
// FAPexpert Re-FAP - Interface Chat
// VERSION 6.1.1 - Formulaire inline chatbot + support ?q= auto-send (lanceur hero)

import { useState, useEffect, useRef } from "react";
import Head from "next/head";
import InlineChatForm from "../components/InlineChatForm";

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
function renderMarkdown(text) {
  if (!text) return "";
  return text
    // liens [texte](url)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" style="color:#689f38;text-decoration:underline;">$1</a>')
    // liens tel: [texte](tel:xxx)
    .replace(/\[([^\]]+)\]\((tel:[^\)]+)\)/g, '<a href="$2" style="color:#689f38;text-decoration:underline;">$1</a>')
    // italique *texte*
    .replace(/\*(.*?)\*/g, '<em>$1</em>');
}
function generateSessionId() {
  return "session_" + Date.now() + "_" + Math.random().toString(36).substring(2, 11);
}

function getTrackingParams() {
  if (typeof window === 'undefined') return '';
  var params = new URLSearchParams(window.location.search);
  var keys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid'];
  var parts = [];
  keys.forEach(function(key) {
    var val = params.get(key);
    if (val) parts.push(key + '=' + encodeURIComponent(val));
  });
  return parts.join('&');
}

// ============================================================
// QUICK REPLIES CONFIG — FALLBACK STATIQUE
// Utilisé uniquement quand le backend n'envoie pas de suggested_replies
// ============================================================
const QUICK_REPLIES_CONFIG = {
  initial: [
    { label: "⚠️ J'ai un problème (voyant, puissance...)", value: "J'ai un problème sur mon véhicule" },
    { label: "📍 Faire nettoyer mon FAP près de chez moi", value: "Je veux faire nettoyer mon FAP près de chez moi" },
    { label: "🔧 Garage qui gère tout (dépose + nettoyage + repose)", value: "Je cherche un garage qui gère tout, dépose et repose du FAP inclus" },
    { label: "💶 Combien ça coûte ?", value: "Combien coûte le nettoyage FAP ?" },
  ],
  vehicule: [
    { label: "Peugeot", value: "C'est une Peugeot" },
    { label: "Renault", value: "C'est une Renault" },
    { label: "Citroën", value: "C'est une Citroën" },
    { label: "Volkswagen", value: "C'est une Volkswagen" },
    { label: "BMW", value: "C'est une BMW" },
    { label: "Audi", value: "C'est une Audi" },
    { label: "Mercedes", value: "C'est une Mercedes" },
    { label: "Dacia", value: "C'est une Dacia" },
    { label: "Ford", value: "C'est une Ford" },
    { label: "Autre", value: "Autre marque" },
  ],
  closing: [
    { label: "✅ Oui, rappelez-moi", value: "oui je veux être rappelé" },
    { label: "Non merci", value: "non merci" },
  ],
};

function getStaticQuickReplies(messages, showFormCTA) {
  if (showFormCTA) return null;
  
  if (messages.length === 0) {
    return QUICK_REPLIES_CONFIG.initial;
  }
  
  const lastAssistant = [...messages].reverse().find(m => m.role === "assistant");
  if (!lastAssistant) return null;
  
  const content = (lastAssistant.raw || lastAssistant.content || "").toLowerCase();
  
  // Détection closing
  if (content.includes("expert re-fap") && (content.includes("gratuit") || content.includes("sans engagement") || content.includes("te rappelle") || content.includes("qu'on te rappelle"))) {
    return QUICK_REPLIES_CONFIG.closing;
  }
  
  // Détection demande véhicule
  if (
    content.includes("quelle voiture") || 
    content.includes("quel véhicule") || 
    content.includes("c'est quoi comme") ||
    content.includes("tu roules en quoi") ||
    content.includes("comme véhicule")
  ) {
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
  const [showFormCTA, setShowFormCTA] = useState(false);
  const [conversationData, setConversationData] = useState({});
  const [dynamicReplies, setDynamicReplies] = useState(null);
  const messagesEndRef = useRef(null);

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

  // v6.1.1 — Auto-send depuis ?q= (lanceur hero re-fap.fr)
  useEffect(() => {
    if (!sessionId) return;
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    const autoQ = params.get('q');
    if (autoQ && autoQ.trim() && messages.length === 0) {
      const timer = setTimeout(() => {
        sendMessage(autoQ.trim());
        window.history.replaceState({}, '', window.location.pathname);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [sessionId]);

  // --------------------------------------------------------
  // ENVOI MESSAGE
  // --------------------------------------------------------
  const sendMessage = async (messageText) => {
    const userMessage = typeof messageText === "string" ? messageText : input.trim();
    if (!userMessage || isLoading || !sessionId) return;

    setInput("");
    setError(null);
    setShowFormCTA(false);
    setDynamicReplies(null);

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

      // SUGGESTED REPLIES du backend (prioritaire sur les statiques)
      if (data.suggested_replies && Array.isArray(data.suggested_replies) && data.suggested_replies.length > 0) {
        setDynamicReplies(data.suggested_replies);
      } else {
        setDynamicReplies(null);
      }

      // Accumuler le DATA JSON à chaque réponse bot (pour le formulaire inline)
      const rawReply = data.reply_full || data.reply || "";
      const dataMatch = rawReply.match(/DATA:\s*(\{[\s\S]*?\})\s*$/);
      if (dataMatch) {
        try {
          const parsed = JSON.parse(dataMatch[1]);
          setConversationData(prev => ({ ...prev, ...parsed }));
        } catch (e) { /* ignore parse error */ }
      }

      // HANDLE ACTION : Formulaire inline chatbot
      if (data.action?.type === "OPEN_FORM") {
        setTimeout(() => setShowFormCTA(true), 800);
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
    setShowFormCTA(false);
    setConversationData({});
    setDynamicReplies(null);
  };

  // Quick replies : backend dynamiques > fallback statiques
  const quickReplies = isLoading ? null
    : showFormCTA ? null
    : dynamicReplies || getStaticQuickReplies(messages, showFormCTA);

  // --------------------------------------------------------
  // RENDER
  // --------------------------------------------------------
  return (
    <>
      <Head>
        <title>FAPexpert - Un problème de FAP ? On vous guide | Re-FAP</title>
        <meta name="description" content="Un problème de FAP ? On vous guide. Voyant allumé ? Perte de puissance ? FAPexpert vous aide et vous oriente gratuitement." />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <div className="chat-container">
        {/* HEADER */}
        <header className="chat-header">
          <div className="header-left">
            <img 
              src="https://auto.re-fap.fr/wp-content/uploads/2026/01/Re-Fap_Logo_Couleur.png" 
              alt="Re-FAP" 
              className="header-logo" 
            />
            <div className="header-text">
              <h1>FAPexpert</h1>
              <p className="header-subtitle">Un problème de FAP ? On vous guide.</p>
            </div>
          </div>
          <button onClick={startNewConversation} className="new-chat-btn">
            Nouveau
          </button>
        </header>

        {/* MESSAGES */}
        <main className="chat-messages">
          {messages.length === 0 && (
            <div className="welcome-message">
              <p className="welcome-icon">💬</p>
              <p className="welcome-title">Bonjour ! Je suis FAPexpert</p>
              <p className="welcome-text">Je vous aide à comprendre votre problème de Filtre à Particules et vous oriente vers la meilleure solution. Décrivez votre souci ou cliquez sur un bouton ci-dessous.</p>
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
              <div
  className="message-content"
  dangerouslySetInnerHTML={{ __html: renderMarkdown(displayContent) }}
/>
              </div>
            );
          })}

          {isLoading && (
            <div className="message message-assistant">
              <div className="avatar">🔧</div>
              <div className="message-content typing-indicator">
                <span></span><span></span><span></span>
              </div>
            </div>
          )}

          {/* FORMULAIRE INLINE CHATBOT */}
          {showFormCTA && (
            <div className="message message-assistant cta-message">
              <div className="avatar">🔧</div>
              <InlineChatForm
                conversationId={sessionId}
                conversationData={conversationData}
                onSuccess={() => {
                  setShowFormCTA(false);
                  const confirmMsg = {
                    role: "assistant",
                    content: "C'est noté ! Un expert Re-FAP te rappelle rapidement. 🚗",
                  };
                  setMessages(prev => [...prev, confirmMsg]);
                }}
              />
            </div>
          )}

          {/* QUICK REPLIES — dynamiques (backend) ou statiques (fallback) */}
          {quickReplies && !isLoading && (
            <div className="quick-replies">
              {quickReplies.map((qr, idx) => (
                <button key={idx} className="quick-reply-btn" onClick={() => handleQuickReply(qr.value)}>
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
            >
              {isLoading ? "..." : "Envoyer"}
            </button>
          </form>
          <p className="disclaimer">FAPexpert est une IA et peut faire des erreurs. Veuillez vérifier les informations.</p>
        </div>
      </div>

      {/* STYLES */}
      <style jsx>{`
        .chat-container {
          display: flex;
          flex-direction: column;
          height: 100vh;
          height: 100dvh;
          max-width: 600px;
          margin: 0 auto;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          background: #f5f7f5;
        }

        .chat-header {
          background: linear-gradient(135deg, #8bc34a 0%, #689f38 100%);
          color: white;
          padding: 12px 16px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-shrink: 0;
          box-shadow: 0 2px 8px rgba(104, 159, 56, 0.3);
        }

        .header-left {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .header-logo {
          height: 40px;
          width: auto;
          border-radius: 6px;
          background: white;
          padding: 4px 8px;
        }

        .header-text h1 {
          margin: 0;
          font-size: 18px;
          font-weight: 700;
        }

        .header-subtitle {
          margin: 2px 0 0 0;
          font-size: 11px;
          opacity: 0.95;
          font-weight: 500;
        }

        .new-chat-btn {
          background: rgba(255,255,255,0.2);
          border: 1px solid rgba(255,255,255,0.4);
          color: white;
          padding: 8px 14px;
          border-radius: 20px;
          cursor: pointer;
          font-size: 12px;
          font-weight: 500;
          transition: background 0.2s;
        }

        .new-chat-btn:hover {
          background: rgba(255,255,255,0.3);
        }

        .chat-messages {
          flex: 1;
          overflow-y: auto;
          padding: 20px 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .welcome-message {
          background: white;
          padding: 24px 20px;
          border-radius: 16px;
          text-align: center;
          box-shadow: 0 2px 12px rgba(0,0,0,0.06);
          border: 1px solid #e8f5e9;
        }

        .welcome-icon {
          font-size: 32px;
          margin: 0 0 10px 0;
        }

        .welcome-title {
          margin: 0 0 8px 0;
          font-size: 18px;
          font-weight: 600;
          color: #2d5a27;
        }

        .welcome-text {
          margin: 0;
          font-size: 14px;
          color: #666;
          line-height: 1.5;
        }

        .message {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          max-width: 85%;
          animation: fadeIn 0.3s ease;
        }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .message-user {
          align-self: flex-end;
          flex-direction: row-reverse;
        }

        .message-assistant {
          align-self: flex-start;
        }

        .cta-message {
          max-width: 380px;
        }

        .avatar {
          width: 32px;
          height: 32px;
          background: #e8f5e9;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 16px;
          flex-shrink: 0;
        }

        .message-content {
          padding: 12px 16px;
          border-radius: 16px;
          line-height: 1.5;
          font-size: 15px;
         white-space: pre-wrap;
word-break: break-word;
        }

        .message-user .message-content {
          background: #689f38;
          color: white;
          border-bottom-right-radius: 4px;
        }

        .message-assistant .message-content {
          background: white;
          color: #333;
          border-bottom-left-radius: 4px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.06);
        }

        .typing-indicator {
          display: flex;
          gap: 5px;
          padding: 14px 18px;
        }

        .typing-indicator span {
          width: 8px;
          height: 8px;
          background: #689f38;
          border-radius: 50%;
          animation: bounce 1.4s infinite ease-in-out;
        }

        .typing-indicator span:nth-child(1) { animation-delay: 0s; }
        .typing-indicator span:nth-child(2) { animation-delay: 0.2s; }
        .typing-indicator span:nth-child(3) { animation-delay: 0.4s; }

        @keyframes bounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
          30% { transform: translateY(-6px); opacity: 1; }
        }

        .quick-replies {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          padding: 4px 0;
          margin-left: 42px;
        }

        .quick-reply-btn {
          background: white;
          border: 1.5px solid #689f38;
          color: #689f38;
          padding: 10px 16px;
          border-radius: 20px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
        }

        .quick-reply-btn:hover {
          background: #689f38;
          color: white;
        }

        .error-message {
          background: #fee2e2;
          border: 1px solid #ef4444;
          color: #b91c1c;
          padding: 12px;
          border-radius: 8px;
          font-size: 13px;
        }

        .error-message pre {
          margin: 8px 0 0 0;
          font-size: 11px;
          white-space: pre-wrap;
        }

        .chat-input-wrapper {
          background: white;
          border-top: 1px solid #e0e0e0;
          padding: 16px;
          flex-shrink: 0;
        }

        .chat-input-form {
          display: flex;
          gap: 10px;
        }

        .chat-input {
          flex: 1;
          padding: 14px 18px;
          border: 2px solid #e0e0e0;
          border-radius: 24px;
          font-size: 16px;
          outline: none;
          transition: border-color 0.2s;
        }

        .chat-input:focus {
          border-color: #8bc34a;
        }

        .send-btn {
          background: linear-gradient(135deg, #8bc34a 0%, #689f38 100%);
          color: white;
          border: none;
          padding: 14px 24px;
          border-radius: 24px;
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }

        .send-btn:hover:not(:disabled) {
          box-shadow: 0 4px 12px rgba(104, 159, 56, 0.4);
          transform: translateY(-1px);
        }

        .send-btn:disabled {
          background: #9ca3af;
          cursor: not-allowed;
        }

        .disclaimer {
          margin: 10px 0 0 0;
          font-size: 11px;
          color: #999;
          text-align: center;
        }

        @media (max-width: 600px) {
          .chat-container { max-width: 100%; }
          .chat-header { padding: 10px 12px; }
          .header-logo { height: 36px; }
          .header-text h1 { font-size: 16px; }
          .header-subtitle { font-size: 10px; }
          .chat-messages { padding: 16px 12px; }
          .message { max-width: 90%; }
          .cta-message { max-width: 95%; }
          .quick-replies { margin-left: 0; }
          .quick-reply-btn { padding: 8px 14px; font-size: 13px; }
          .send-btn { padding: 14px 18px; }
        }
      `}</style>

      <style jsx global>{`
        * { box-sizing: border-box; }
        html, body { margin: 0; padding: 0; background: #f5f7f5; }
      `}</style>
    </>
  );
}

