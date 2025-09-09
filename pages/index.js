import { useState, useRef, useEffect } from 'react';
import Head from 'next/head';
import ReactMarkdown from 'react-markdown';

export default function Home() {
  const [messages, setMessages] = useState([
    {
      from: 'bot',
      text:
        "Bonjour 👋! Je suis **AutoAI** (Re-FAP). Je t’aide à comprendre un voyant, un souci de **FAP/DPF** ou autre panne et je t’oriente vers la bonne solution. Pose ta question 😄",
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [error, setError] = useState('');
  const [nextAction, setNextAction] = useState(null);   // { type: 'FAP' | 'DIAG' | 'GEN' }
  const [showCoach, setShowCoach] = useState(false);    // coachmark colonne droite
  const chatEndRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Affiche le coachmark 6s quand l’action change
  useEffect(() => {
    if (!nextAction) return;
    setShowCoach(true);
    const t = setTimeout(() => setShowCoach(false), 6000);
    return () => clearTimeout(t);
  }, [nextAction && nextAction.type]);

  function getHistoriqueText() {
    const lastMessages = messages.slice(-5);
    return lastMessages
      .map((m) => (m.from === 'user' ? `Moi: ${m.text}` : `AutoAI: ${m.text}`))
      .join('\n');
  }

  async function handleSubmit(e) {
    e.preventDefault();

    const userMessagesCount = messages.filter((m) => m.from === 'user').length;
    if (userMessagesCount >= 10) {
      setBlocked(true);
      setError(
        "🔧 Tu as déjà échangé 10 messages avec moi sur ce sujet ! Pour éviter les conversations trop longues, la session s’arrête ici. Tu peux relancer une nouvelle discussion à tout moment 🚀."
      );
      return;
    }

    const trimmedInput = input.trim();
    if (!trimmedInput) return;

    setMessages((msgs) => [...msgs, { from: 'user', text: trimmedInput }]);
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
        setMessages((msgs) => [
          ...msgs,
          {
            from: 'bot',
            text:
              res.status === 429
                ? '⚠️ Le service est temporairement saturé, merci de réessayer plus tard.'
                : `Erreur serveur ${res.status}`,
          },
        ]);
        return;
      }

      const data = await res.json();

      // Garde-fou : si la conclusion “→ Oui :” est là sans “Question finale”, on injecte la question
      let reply = (data.reply || '').trim();
      if (/^→\s*Oui\s*:/m.test(reply) && !/Question finale\s*:/i.test(reply)) {
        reply = reply.replace(
          /^→\s*Oui\s*:.*/m,
          (match) =>
            `**Question finale :** Sais-tu démonter ton FAP toi-même ?\n${match}`
        );
      }

      setMessages((msgs) => [...msgs, { from: 'bot', text: reply }]);
      setNextAction(data.nextAction || { type: 'GEN' });
    } catch {
      setLoading(false);
      setMessages((msgs) => [
        ...msgs,
        {
          from: 'bot',
          text:
            "Désolé, il y a eu une erreur réseau, merci d'actualiser la page :).",
        },
      ]);
    }
  }

  return (
    <>
      <Head>
        <title>Auto AI</title>
        <link rel="stylesheet" href="/style.css" />
      </Head>

      <main className="container">
        <h1>AutoAI par Re-FAP</h1>

        <div className="chat-and-button">
          <div id="chat-window" className="chat-window">
            {/* Hint discret côté chat */}
            {nextAction && (
              <div className="bot-msg chat-hint">
                <strong>Astuce :</strong> la <em>solution recommandée</em> est à
                droite 👉 (boutons verts/bleus).
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} className={m.from === 'user' ? 'user-msg' : 'bot-msg'}>
                <strong>{m.from === 'user' ? 'Moi' : 'AutoAI'}:</strong>
                <ReactMarkdown skipHtml>
                  {m.text.replace(/\n{2,}/g, '\n')}
                </ReactMarkdown>
              </div>
            ))}

            {loading && (
              <div className="bot-msg typing-indicator">
                <strong>AutoAI:</strong>
                <span className="dots">
                  <span>.</span>
                  <span>.</span>
                  <span>.</span>
                </span>
              </div>
            )}

            {/* Inline CTA (double l’action dans la zone chat) */}
            {nextAction && <InlineCTA type={nextAction.type} />}

            <div ref={chatEndRef} />
          </div>

          {/* Colonne CTA */}
          <div className="garage-button-container">
            {showCoach && nextAction && (
              <Coachmark
                type={nextAction.type}
                onClose={() => setShowCoach(false)}
              />
            )}
            {nextAction?.type === 'FAP' && <CtaForFAP highlight={showCoach} />}
            {nextAction?.type === 'DIAG' && <CtaForDiag highlight={showCoach} />}
            {(!nextAction || nextAction.type === 'GEN') && (
              <CtaDefault highlight={showCoach} />
            )}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="chat-form">
          <input
            type="text"
            placeholder="Écris ta question ici..."
            value={input}
            onChange={(e) => {
              const val = e.target.value;
              setInput(val);
              setError(
                val.length > 600
                  ? '⚠️ Ton message ne peut pas dépasser 600 caractères.'
                  : ''
              );
            }}
            autoComplete="off"
            id="user-input"
            disabled={blocked}
          />
          <button type="submit" disabled={blocked || input.length > 600 || loading}>
            {loading ? 'Envoi…' : 'Envoyer'}
          </button>
        </form>

        {error && <p className="error-msg">{error}</p>}
      </main>

      <footer className="footer">
        <p>
          ⚠️ AutoAI peut faire des erreurs, envisage de vérifier les informations
          importantes.
        </p>
      </footer>
    </>
  );
}

/* ===================== CTA Components ===================== */

function CtaForFAP({ highlight }) {
  return (
    <>
      <div className={`cta-card ${highlight ? 'pulse-card' : ''}`}>
        <div className="cta-title">Tu sais démonter ton FAP toi-même ?</div>
        <p className="cta-desc">
          <strong>Solution idéale :</strong> dépose ton FAP directement dans un
          <strong> Carter-Cash</strong> près de chez toi. En partenariat avec
          Re-FAP, ils proposent un <em>nettoyage “comme neuf”</em> des filtres à
          particules <strong>à partir de 99€ TTC</strong>.
        </p>
        <div className="cta-actions">
          <a
            href="https://auto.re-fap.fr"
            className="carter-button"
            rel="noopener noreferrer"
          >
            Déposer chez Carter-Cash 🛠️
          </a>
        </div>
      </div>

      <div className={`cta-card ${highlight ? 'pulse-card' : ''}`}>
        <div className="cta-title">Tu ne veux/peux pas le démonter ?</div>
        <p className="cta-desc">
          Confie le véhicule à un <strong>garage partenaire Re-FAP</strong> :
          confirmation du diagnostic et devis <strong>tout compris</strong> :
          dépose du FAP, <strong>nettoyage Re-FAP</strong>, repose et réinitialisation
          à la valise — au meilleur prix.
        </p>
        <div className="cta-actions">
          <a
            href="https://re-fap.fr/trouver_garage_partenaire/"
            className="garage-button"
            rel="noopener noreferrer"
          >
            Prendre RDV avec un garage 🔧
          </a>
        </div>
      </div>
    </>
  );
}

function CtaForDiag({ highlight }) {
  return (
    <div className={`cta-card ${highlight ? 'pulse-card' : ''}`}>
      <div className="cta-title">Besoin d’un diagnostic électronique</div>
      <p className="cta-desc">
        Lecture des codes défaut + tests des composants pour trouver la cause
        réelle (turbo, EGR, capteurs, etc.) avant toute réparation.
      </p>
      <div className="cta-actions">
        <a
          href="https://re-fap.fr/trouver_garage_partenaire/"
          className="garage-button"
          rel="noopener noreferrer"
        >
          Prendre RDV avec un garage 🔎
        </a>
      </div>
    </div>
  );
}

function CtaDefault({ highlight }) {
  return (
    <>
      <div className={`cta-card ${highlight ? 'pulse-card' : ''}`}>
        <div className="cta-title">Tu veux qu’un pro s’en charge ?</div>
        <p className="cta-desc">
          Réseau de <strong>garages partenaires Re-FAP</strong> : diagnostic, dépose,
          <strong> nettoyage Re-FAP</strong>, repose, réinitialisation.
        </p>
        <div className="cta-actions">
          <a
            href="https://re-fap.fr/trouver_garage_partenaire/"
            className="garage-button"
            rel="noopener noreferrer"
          >
            Trouver un garage partenaire 🔧
          </a>
        </div>
      </div>

      <div className="cta-card">
        <div className="cta-title">Tu sais démonter ton FAP ?</div>
        <p className="cta-desc">
          Dépose directe dans un <strong>Carter-Cash</strong> : nettoyage Re-FAP
          <strong> à partir de 99€ TTC</strong>.
        </p>
        <div className="cta-actions">
          <a
            href="https://auto.re-fap.fr"
            className="carter-button"
            rel="noopener noreferrer"
          >
            Trouver un Carter-Cash 🛠️
          </a>
        </div>
      </div>
    </>
  );
}

/* ===================== UI helpers ===================== */

function Coachmark({ type, onClose }) {
  const label =
    type === 'FAP'
      ? "Recommandation FAP : choisis l’option qui te correspond 👉"
      : type === 'DIAG'
      ? "Besoin d’un diagnostic ? Clique ici 👉"
      : "Solutions disponibles 👉";
  return (
    <div className="coachmark" role="status" aria-live="polite">
      <span>{label}</span>
      <button className="coachmark-close" onClick={onClose} aria-label="Fermer">
        ×
      </button>
    </div>
  );
}

function InlineCTA({ type }) {
  if (type === 'FAP') {
    return (
      <div className="inline-cta">
        <a
          href="https://re-fap.fr/trouver_garage_partenaire/"
          className="garage-button"
        >
          Prendre RDV 🔧
        </a>
        <a href="https://auto.re-fap.fr" className="carter-button">
          Déposer chez Carter-Cash 🛠️
        </a>
      </div>
    );
  }
  if (type === 'DIAG') {
    return (
      <div className="inline-cta">
        <a
          href="https://re-fap.fr/trouver_garage_partenaire/"
          className="garage-button"
        >
          Prendre RDV diagnostic 🔎
        </a>
      </div>
    );
  }
  return (
    <div className="inline-cta">
      <a
        href="https://re-fap.fr/trouver_garage_partenaire/"
        className="garage-button"
      >
        Garage partenaire 🔧
      </a>
      <a href="https://auto.re-fap.fr" className="carter-button">
        Carter-Cash 🛠️
      </a>
    </div>
  );
}
