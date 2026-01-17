// /pages/index.js
// FAPexpert Re-FAP - Interface Chat
// VERSION 2.4 - Production Ready + Auth cookie signé

import { useState, useEffect, useRef } from "react";
import Head from "next/head";

// ============================================================
// FONCTION : Normaliser la position de DATA (force \n avant)
// ============================================================
function normalizeDataPosition(content) {
  if (!content) return "";
  return content.replace(/([^\n])\s*DATA:\s*\{/g, "$1\nDATA: {");
}

// ============================================================
// FONCTION : Nettoyer les messages (retirer DATA:) - REGEX ROBUSTE
// ============================================================
function cleanMessageForDisplay(content) {
  if (!content || typeof content !== "string") return "";
  
  const normalized = normalizeDataPosition(content);
  
  const match = normalized.match(/^([\s\S]*?)(?:\nDATA:\s*\{[\s\S]*\})\s*$/);
  if (match) {
    return match[1].trim();
  }
  
  const lines = normalized.split("\n");
  const cleanLines = [];
  for (const line of lines) {
    if (line.trim().startsWith("DATA:")) break;
    cleanLines.push(line);
  }
  
  const result = cleanLines.join("\n").trim();
  return result || content.trim();
}

// ============================================================
// FONCTION : Générer un session_id unique
// ============================================================
function generateSessionId() {
  return "session_" + Date.now() + "_" + Math.random().toString(36).substring(2, 11);
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
  const messagesEndRef = useRef(null);

  // Initialiser session_id + bootstrap cookie au montage
  useEffect(() => {
    let storedSessionId = localStorage.getItem("fapexpert_session_id");
    if (!storedSessionId) {
      storedSessionId = generateSessionId();
      localStorage.setItem("fapexpert_session_id", storedSessionId);
    }
    setSessionId(storedSessionId);

    // Bootstrap : récupère le cookie signé httpOnly
    fetch("/api/bootstrap", { method: "POST", credentials: "include" }).catch(() => {});
  }, []);

  // Auto-scroll vers le bas
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // --------------------------------------------------------
  // ENVOI MESSAGE
  // --------------------------------------------------------
  const sendMessage = async (e) => {
    e.preventDefault();
    
    if (!input.trim() || isLoading || !sessionId) return;

    const userMessage = input.trim();
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
        credentials: "include", // ← CRITIQUE : envoie le cookie
        headers: {
          "Content-Type": "application/json",
        },
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

    } catch (err) {
      console.error("❌ Erreur fetch:", err);
      setError(JSON.stringify({ 
        error: "Erreur de connexion", 
        details: err.message,
        stack: err.stack 
      }, null, 2));
    } finally {
      setIsLoading(false);
    }
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
  };

  // --------------------------------------------------------
  // RENDER
  // --------------------------------------------------------
  return (
    <>
      <Head>
        <title>FAPexpert - Diagnostic FAP en ligne | Re-FAP</title>
        <meta 
          name="description" 
          content="Diagnostic gratuit de votre Filtre à Particules (FAP). Voyant allumé ? Perte de puissance ? Notre expert vous guide." 
        />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <div className="chat-container">
        {/* HEADER */}
        <header className="chat-header">
          <h1>FAPexpert</h1>
          <p>Diagnostic de votre Filtre à Particules</p>
          <button 
            onClick={startNewConversation} 
            className="new-chat-btn"
            title="Nouvelle conversation"
          >
            Nouvelle conversation
          </button>
        </header>

        {/* MESSAGES */}
        <main className="chat-messages">
          {messages.length === 0 && (
            <div className="welcome-message">
              <p>👋 Bonjour ! Je suis FAPexpert, votre assistant pour diagnostiquer les problèmes de Filtre à Particules.</p>
              <p>Décrivez-moi votre souci ou posez-moi une question.</p>
            </div>
          )}

          {messages.map((msg, index) => (
            <div
              key={index}
              className={`message ${msg.role === "user" ? "message-user" : "message-assistant"}`}
            >
              <div className="message-content">
                {cleanMessageForDisplay(msg.content)}
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="message message-assistant">
              <div className="message-content typing-indicator">
                <span></span>
                <span></span>
                <span></span>
              </div>
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
        <form onSubmit={sendMessage} className="chat-input-form">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Décrivez votre problème de FAP..."
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
      </div>

      {/* STYLES - INCHANGÉ */}
      <style jsx>{`
        .chat-container {
          display: flex;
          flex-direction: column;
          height: 100vh;
          max-width: 800px;
          margin: 0 auto;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }

        .chat-header {
          background: linear-gradient(135deg, #1e3a5f 0%, #2d5a87 100%);
          color: white;
          padding: 20px;
          text-align: center;
        }

        .chat-header h1 {
          margin: 0 0 5px 0;
          font-size: 24px;
        }

        .chat-header p {
          margin: 0 0 15px 0;
          opacity: 0.9;
          font-size: 14px;
        }

        .new-chat-btn {
          background: rgba(255, 255, 255, 0.2);
          border: 1px solid rgba(255, 255, 255, 0.3);
          color: white;
          padding: 8px 16px;
          border-radius: 20px;
          cursor: pointer;
          font-size: 13px;
          transition: background 0.2s;
        }

        .new-chat-btn:hover {
          background: rgba(255, 255, 255, 0.3);
        }

        .chat-messages {
          flex: 1;
          overflow-y: auto;
          padding: 20px;
          background: #f5f7fa;
        }

        .welcome-message {
          background: white;
          padding: 20px;
          border-radius: 12px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
          margin-bottom: 20px;
        }

        .welcome-message p {
          margin: 0 0 10px 0;
          line-height: 1.5;
        }

        .welcome-message p:last-child {
          margin-bottom: 0;
        }

        .message {
          margin-bottom: 16px;
          display: flex;
        }

        .message-user {
          justify-content: flex-end;
        }

        .message-assistant {
          justify-content: flex-start;
        }

        .message-content {
          max-width: 75%;
          padding: 12px 16px;
          border-radius: 16px;
          line-height: 1.5;
          white-space: pre-wrap;
          word-wrap: break-word;
        }

        .message-user .message-content {
          background: #1e3a5f;
          color: white;
          border-bottom-right-radius: 4px;
        }

        .message-assistant .message-content {
          background: white;
          color: #333;
          border-bottom-left-radius: 4px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
        }

        .typing-indicator {
          display: flex;
          gap: 4px;
          padding: 16px 20px;
        }

        .typing-indicator span {
          width: 8px;
          height: 8px;
          background: #1e3a5f;
          border-radius: 50%;
          animation: typing 1.4s infinite ease-in-out;
        }

        .typing-indicator span:nth-child(1) {
          animation-delay: 0s;
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
            opacity: 0.4;
          }
          30% {
            transform: translateY(-8px);
            opacity: 1;
          }
        }

        .error-message {
          background: #fee2e2;
          border: 1px solid #ef4444;
          color: #b91c1c;
          padding: 16px;
          border-radius: 8px;
          margin-bottom: 16px;
        }

        .error-message strong {
          display: block;
          margin-bottom: 8px;
        }

        .error-message pre {
          margin: 0;
          font-size: 12px;
          white-space: pre-wrap;
          word-wrap: break-word;
          background: rgba(0, 0, 0, 0.05);
          padding: 10px;
          border-radius: 4px;
        }

        .chat-input-form {
          display: flex;
          gap: 12px;
          padding: 20px;
          background: white;
          border-top: 1px solid #e5e7eb;
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
          background: #f5f5f5;
        }

        .send-btn {
          background: #1e3a5f;
          color: white;
          border: none;
          padding: 14px 28px;
          border-radius: 24px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.2s;
        }

        .send-btn:hover:not(:disabled) {
          background: #2d5a87;
        }

        .send-btn:disabled {
          background: #9ca3af;
          cursor: not-allowed;
        }

        @media (max-width: 600px) {
          .chat-header {
            padding: 15px;
          }

          .chat-header h1 {
            font-size: 20px;
          }

          .chat-messages {
            padding: 15px;
          }

          .message-content {
            max-width: 85%;
          }

          .chat-input-form {
            padding: 15px;
          }

          .send-btn {
            padding: 14px 20px;
          }
        }
      `}</style>

      <style jsx global>{`
        * {
          box-sizing: border-box;
        }

        html,
        body {
          margin: 0;
          padding: 0;
          background: #f5f7fa;
        }
      `}</style>
    </>
  );
}
