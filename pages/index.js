// /pages/index.js
// FAPexpert Re-FAP - VERSION 5.0 STABLE
// Interface simplifiée

import { useState, useEffect, useRef } from "react";
import Head from "next/head";

function generateSessionId() {
  return "session_" + Date.now() + "_" + Math.random().toString(36).substring(2, 11);
}

export default function Home() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [formUrl, setFormUrl] = useState("");
  const messagesEndRef = useRef(null);

  // Init
  useEffect(() => {
    let stored = localStorage.getItem("fapexpert_session_id");
    if (!stored) {
      stored = generateSessionId();
      localStorage.setItem("fapexpert_session_id", stored);
    }
    setSessionId(stored);
    fetch("/api/bootstrap", { method: "POST", credentials: "include" }).catch(() => {});
  }, []);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Envoi
  const sendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim() || isLoading || !sessionId) return;

    const userMessage = input.trim();
    setInput("");
    setError(null);
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setIsLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMessage,
          session_id: sessionId,
          history: messages.map((m) => ({ role: m.role, content: m.content, intent: m.intent })),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(JSON.stringify(data, null, 2));
        return;
      }

      // Ajouter la réponse (reply est déjà propre, pas besoin de nettoyer)
      setMessages((prev) => [...prev, { 
        role: "assistant", 
        content: data.reply,
        intent: data.intent 
      }]);

      // Ouvrir le formulaire après délai si demandé
      if (data.action?.type === "OPEN_FORM" && data.action?.url) {
        setFormUrl(data.action.url);
        setTimeout(() => setShowModal(true), 2000);
      }

    } catch (err) {
      setError(JSON.stringify({ error: "Erreur de connexion", details: err.message }, null, 2));
    } finally {
      setIsLoading(false);
    }
  };

  // Nouvelle conversation
  const startNewConversation = () => {
    const newId = generateSessionId();
    localStorage.setItem("fapexpert_session_id", newId);
    setSessionId(newId);
    setMessages([]);
    setError(null);
    setShowModal(false);
  };

  return (
    <>
      <Head>
        <title>FAPexpert - Diagnostic FAP | Re-FAP</title>
        <meta name="description" content="Diagnostic gratuit de votre Filtre à Particules" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div className="chat-container">
        <header className="chat-header">
          <h1>FAPexpert</h1>
          <p>Diagnostic de votre Filtre à Particules</p>
          <button onClick={startNewConversation} className="new-chat-btn">
            Nouvelle conversation
          </button>
        </header>

        <main className="chat-messages">
          {messages.length === 0 && (
            <div className="welcome-message">
              <p>👋 Bonjour ! Je suis FAPexpert, votre assistant pour les problèmes de Filtre à Particules.</p>
              <p>Décrivez-moi votre souci.</p>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`message message-${msg.role}`}>
              <div className="message-content">{msg.content}</div>
            </div>
          ))}

          {isLoading && (
            <div className="message message-assistant">
              <div className="message-content typing-indicator">
                <span></span><span></span><span></span>
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

        <form onSubmit={sendMessage} className="chat-input-form">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Décrivez votre problème..."
            disabled={isLoading || !sessionId}
            className="chat-input"
          />
          <button type="submit" disabled={isLoading || !input.trim()} className="send-btn">
            {isLoading ? "..." : "Envoyer"}
          </button>
        </form>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            <div className="modal-header">
              <h2>Demande de rappel</h2>
              <p>Laissez vos coordonnées, on vous rappelle rapidement.</p>
            </div>
            <iframe src={formUrl} className="modal-iframe" title="Formulaire" />
          </div>
        </div>
      )}

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
        .chat-header h1 { margin: 0 0 5px 0; font-size: 24px; }
        .chat-header p { margin: 0 0 15px 0; opacity: 0.9; font-size: 14px; }
        .new-chat-btn {
          background: rgba(255,255,255,0.2);
          border: 1px solid rgba(255,255,255,0.3);
          color: white;
          padding: 8px 16px;
          border-radius: 20px;
          cursor: pointer;
          font-size: 13px;
        }
        .new-chat-btn:hover { background: rgba(255,255,255,0.3); }
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
          box-shadow: 0 2px 8px rgba(0,0,0,0.08);
          margin-bottom: 20px;
        }
        .welcome-message p { margin: 0 0 10px 0; line-height: 1.5; }
        .welcome-message p:last-child { margin-bottom: 0; }
        .message { margin-bottom: 16px; display: flex; }
        .message-user { justify-content: flex-end; }
        .message-assistant { justify-content: flex-start; }
        .message-content {
          max-width: 75%;
          padding: 12px 16px;
          border-radius: 16px;
          line-height: 1.5;
          white-space: pre-wrap;
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
          box-shadow: 0 2px 8px rgba(0,0,0,0.08);
        }
        .typing-indicator { display: flex; gap: 4px; padding: 16px 20px; }
        .typing-indicator span {
          width: 8px; height: 8px;
          background: #1e3a5f;
          border-radius: 50%;
          animation: typing 1.4s infinite ease-in-out;
        }
        .typing-indicator span:nth-child(1) { animation-delay: 0s; }
        .typing-indicator span:nth-child(2) { animation-delay: 0.2s; }
        .typing-indicator span:nth-child(3) { animation-delay: 0.4s; }
        @keyframes typing {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
          30% { transform: translateY(-8px); opacity: 1; }
        }
        .error-message {
          background: #fee2e2;
          border: 1px solid #ef4444;
          color: #b91c1c;
          padding: 16px;
          border-radius: 8px;
          margin-bottom: 16px;
        }
        .error-message pre { margin: 8px 0 0 0; font-size: 12px; white-space: pre-wrap; }
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
        }
        .chat-input:focus { border-color: #1e3a5f; }
        .send-btn {
          background: #1e3a5f;
          color: white;
          border: none;
          padding: 14px 28px;
          border-radius: 24px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
        }
        .send-btn:hover:not(:disabled) { background: #2d5a87; }
        .send-btn:disabled { background: #9ca3af; cursor: not-allowed; }
        .modal-overlay {
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(0,0,0,0.6);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 20px;
        }
        .modal-content {
          background: white;
          border-radius: 16px;
          width: 100%;
          max-width: 500px;
          max-height: 90vh;
          overflow: hidden;
          position: relative;
          box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        }
        .modal-close {
          position: absolute;
          top: 12px; right: 12px;
          background: #f5f5f5;
          border: none;
          width: 32px; height: 32px;
          border-radius: 50%;
          cursor: pointer;
          font-size: 16px;
          z-index: 10;
        }
        .modal-header {
          padding: 24px 24px 16px;
          border-bottom: 1px solid #e5e7eb;
        }
        .modal-header h2 { margin: 0 0 8px 0; font-size: 20px; color: #1e3a5f; }
        .modal-header p { margin: 0; color: #666; font-size: 14px; }
        .modal-iframe { width: 100%; height: 500px; border: none; }
        @media (max-width: 600px) {
          .message-content { max-width: 85%; }
          .modal-iframe { height: 400px; }
        }
      `}</style>
      <style jsx global>{`
        * { box-sizing: border-box; }
        html, body { margin: 0; padding: 0; background: #f5f7fa; }
      `}</style>
    </>
  );
}
