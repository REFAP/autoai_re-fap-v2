// pages/index.js
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
  const [nextAction, setNextAction] = useState(null);   // { type: 'FAP' | 'DIAG' }
  const [showCoach, setShowCoach] = useState(false);
  const chatEndRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

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
      setError("🔧 Tu as déjà échangé 10 messages avec moi sur ce sujet ! Pour éviter les conversations trop longues, la session s’arrête ici. Tu peux relancer une nouvelle discussion à tout moment 🚀.");
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
        body: JSON.stringify({ question: trimmedInput, historique: historiqueText }),
      });

      setLoading(false);

      if (!res.ok) {
        setMessages((msgs) => [
          ...msgs,
          { from: 'bot', text: res.status === 429 ? '⚠️ Le service est temporairement saturé, merci de réessayer plus tard.' : `Erreur serveur ${res.status}` },
        ]);
        return;
      }

      const data = await res.json();

let reply = (data.reply || '').trim();

// ——— ENFORCE: bloc "Question finale" FAP avec choix Oui/Non ———
if (data.nextAction?.type === 'FAP') {
  const choicesLine =
    '→ Oui : [Trouver un Carter-Cash](https://auto.re-fap.fr/?utm_source=autoai&utm_medium=cta&utm_campaign=v2&utm_content=cartercash) • Non : [Trouver un garage partenaire Re-FAP](https://re-fap.fr/trouver_garage_partenaire/?utm_source=autoai&utm_medium=cta&utm_campaign=v2&utm_content=garage)';

  const hasQuestion = /(\*\*|\*)?Question finale\s*:\s*/i.test(reply);
  const hasChoices  = /→\s*Oui\s*:/i.test(reply);

  if (!hasQuestion && !hasChoices) {
    // Rien du tout → on ajoute question + choix
    reply = `${reply}\n**Question finale :** Sais-tu démonter ton FAP toi-même ?\n${choicesLine}`.trim();
  } else if (hasQuestion && !hasChoices) {
    // Question présente, choix absents → on insère la ligne juste après l’en-tête
    reply = reply.replace(
      /(\*\*Question finale\s*:\*\*.*?)(\n|$)/i,
      (_m, head, eol) => `${head}${eol}${choicesLine}\n`
    ).trim();
  }
}
// ——————————————————————————————————————————————————————————————

setMessages((msgs) => [...msgs, { from: 'bot', text: reply }]);
setNextAction(data.nextAction || { type: 'DIAG' });


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

            {nextAction && (
              <div className="bot-msg chat-hint">
                <strong>Astuce :</strong> la <em>solution recommandée</em> est à droite 👉 (boutons verts/bleus).
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} className={m.from === 'user' ? 'user-msg' : 'bot-msg'}>
                <strong>{m.from === 'user' ? 'Moi' : 'AutoAI'}:</strong>
                <ReactMarkdown skipHtml>{m.text.replace(/\n{2,}/g, '\n')}</ReactMarkdown>
              </div>
            ))}

            {loading && (
              <div className="bot-msg typing-indicator">
                <strong>AutoAI:</strong>
                <span className="dots"><span>.</span><span>.</span><span>.</span></span>
              </div>
            )}

            {nextAction && <InlineCTA type={nextAction.type} />}

            <div ref={chatEndRef} />
          </div>

          <div className="garage-button-container">
            {showCoach && nextAction && (
              <Coachmark type={nextAction.type} onClose={() => setShowCoach(false)} />
            )}

            {nextAction?.type === 'FAP' && (
              <>
                <FapExplainer highlight={showCoach} />
                <CtaForFAP highlight={showCoach} />
              </>
            )}
            {nextAction?.type === 'DIAG' && <CtaForDiag highlight={showCoach} />}
            {!nextAction && <CtaDefault highlight={showCoach} />}
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
              setError(val.length > 600 ? '⚠️ Ton message ne peut pas dépasser 600 caractères.' : '');
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
        <p>⚠️ AutoAI peut faire des erreurs, envisage de vérifier les informations importantes.</p>
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
          <strong> Carter-Cash</strong> près de chez toi. En partenariat avec Re-FAP,
          ils proposent un <em>nettoyage “comme neuf”</em> à <strong>partir de 99€ TTC</strong>.
        </p>
        <div className="cta-actions">
          <a href="https://auto.re-fap.fr" className="carter-button" rel="noopener noreferrer">
            Déposer chez Carter-Cash 🛠️
          </a>
        </div>
      </div>

      <div className={`cta-card ${highlight ? 'pulse-card' : ''}`}>
        <div className="cta-title">Tu ne veux/peux pas le démonter ?</div>
        <p className="cta-desc">
          Confie le véhicule à un <strong>garage partenaire Re-FAP</strong> :
          diagnostic confirmé + devis <strong>tout compris</strong> (dépose FAP,
          <strong> nettoyage Re-FAP</strong>, repose, réinitialisation).
        </p>
        <div className="cta-actions">
          <a href="https://re-fap.fr/trouver_garage_partenaire/" className="garage-button" rel="noopener noreferrer">
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
        Lecture des codes + tests des composants pour identifier la cause réelle
        (turbo, EGR, capteurs, AdBlue…) avant toute réparation.
      </p>
      <div className="cta-actions">
        <a href="https://re-fap.fr/trouver_garage_partenaire/" className="garage-button" rel="noopener noreferrer">
          Prendre RDV avec un garage 🔎
        </a>
      </div>
    </div>
  );
}

// Accueil (avant 1ère réponse)
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
          <a href="https://re-fap.fr/trouver_garage_partenaire/" className="garage-button" rel="noopener noreferrer">
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
          <a href="https://auto.re-fap.fr" className="carter-button" rel="noopener noreferrer">
            Trouver un Carter-Cash 🛠️
          </a>
        </div>
      </div>
    </>
  );
}

/* ===================== FAP Explainer ===================== */

function FapExplainer({ highlight }) {
  return (
    <>
      <div className={`cta-card ${highlight ? 'pulse-card' : ''}`}>
        <div className="cta-title">Pourquoi le nettoyage FAP ?</div>
        <ul className="cta-desc">
          <li><strong>Qualité/fiabilité :</strong> quand le FAP n’est pas endommagé, le nettoyage Re-FAP restaure les performances d’origine dans la grande majorité des cas.</li>
          <li><strong>Économique :</strong> évite un remplacement coûteux ; chez Carter-Cash, à partir de <strong>99€ TTC</strong>.</li>
          <li><strong>Éco-responsable :</strong> on réutilise la pièce au lieu de la jeter.</li>
        </ul>
      </div>

      <div className="cta-card">
        <div className="cta-title">Quand ça ne suffit pas ?</div>
        <ul className="cta-desc">
          <li>FAP <strong>fissuré/fondu</strong> (choc thermique, régénération ratée).</li>
          <li>Capteurs <strong>différentiel/température</strong> HS ou fuite turbo importante.</li>
          <li>Calculateur bloqué en <strong>mode dégradé</strong> non levé.</li>
        </ul>
        <p className="cta-desc">Dans ces cas : diagnostic et prise en charge par un <strong>garage partenaire</strong>.</p>
      </div>
    </>
  );
}

/* ===================== Helpers visuels ===================== */

function Coachmark({ type, onClose }) {
  const label =
    type === 'FAP'
      ? 'Recommandation FAP : choisis l’option qui te correspond 👉'
      : 'Besoin d’un diagnostic ? Clique ici 👉';
  return (
    <div className="coachmark" role="status" aria-live="polite">
      <span>{label}</span>
      <button className="coachmark-close" onClick={onClose} aria-label="Fermer">×</button>
    </div>
  );
}

function InlineCTA({ type }) {
  if (type === 'FAP') {
    return (
      <div className="inline-cta">
        <a href="https://re-fap.fr/trouver_garage_partenaire/" className="garage-button">Prendre RDV 🔧</a>
        <a href="https://auto.re-fap.fr" className="carter-button">Déposer chez Carter-Cash 🛠️</a>
      </div>
    );
  }
  // DIAG (et tout le reste) → uniquement garage
  return (
    <div className="inline-cta">
      <a href="https://re-fap.fr/trouver_garage_partenaire/" className="garage-button">Prendre RDV diagnostic 🔎</a>
    </div>
  );
}

