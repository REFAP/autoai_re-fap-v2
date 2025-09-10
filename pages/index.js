// pages/index.js
import { useState, useRef, useEffect } from 'react';
import Head from 'next/head';
import ReactMarkdown from 'react-markdown';

/* -------- Cartes colonne droite -------- */
function WhyCleanFAPCard() {
  return (
    <div className="cta-card">
      <div className="cta-title">Pourquoi le nettoyage FAP ?</div>
      <ul className="cta-desc">
        <li><strong>Qualité / fiabilité :</strong> si le FAP n’est pas endommagé, le nettoyage Re-FAP permet le retour aux performances d’origine dans la grande majorité des cas.</li>
        <li><strong>Économique :</strong> évite un remplacement coûteux ; chez Carter-Cash, à partir de <strong>99€ TTC</strong>.</li>
        <li><strong>Éco-responsable :</strong> on réutilise la pièce au lieu de la jeter.</li>
      </ul>
    </div>
  );
}

function CarterCashCard() {
  return (
    <div className="cta-card">
      <div className="cta-title">Tu sais démonter ton FAP toi-même ?</div>
      <div className="cta-desc">
        <p><strong>Solution idéale :</strong> dépose ton FAP dans un Carter-Cash près de chez toi. En partenariat avec Re-FAP, ils proposent un <strong>nettoyage “comme neuf”</strong> à partir de <strong>99€ TTC</strong>.</p>
      </div>
      <div className="cta-actions">
        <a
          href="https://auto.re-fap.fr/?utm_source=autoai&utm_medium=cta&utm_campaign=v2&utm_content=right_cartercash"
          className="carter-button"
          rel="noopener noreferrer"
        >
          Déposer chez Carter-Cash 🛠️
        </a>
      </div>
    </div>
  );
}

function GarageFAPCard() {
  return (
    <div className="cta-card">
      <div className="cta-title">Tu ne veux/peux pas le démonter ?</div>
      <div className="cta-desc">
        <p>Confie le véhicule à un <strong>garage partenaire Re-FAP</strong> : diagnostic confirmé + devis <strong>tout compris</strong> (dépose FAP, nettoyage Re-FAP, repose, réinitialisation).</p>
      </div>
      <div className="cta-actions">
        <a
          href="https://re-fap.fr/trouver_garage_partenaire/?utm_source=autoai&utm_medium=cta&utm_campaign=v2&utm_content=right_garage"
          className="garage-button"
          rel="noopener noreferrer"
        >
          Prendre RDV avec un garage 🔧
        </a>
      </div>
    </div>
  );
}

function CtaForDiag() {
  return (
    <div className="cta-card">
      <div className="cta-title">Besoin d’un diagnostic électronique ?</div>
      <ul className="cta-desc">
        <li>On te met en relation avec un <strong>garage partenaire de confiance</strong>.</li>
        <li>Tu renseignes <strong>immatriculation</strong> et <strong>code postal</strong> pour voir les garages <strong>près de chez toi</strong>.</li>
        <li><strong>Tarif clair</strong> pour le diagnostic et <strong>créneaux rapides</strong> pour réserver en ligne.</li>
      </ul>
      <div className="cta-actions">
        <a
          href="https://re-fap.fr/trouver_garage_partenaire/?utm_source=autoai&utm_medium=cta&utm_campaign=v2&utm_content=diag_preamble"
          className="garage-button"
          rel="noopener noreferrer"
        >
          Trouver un garage & réserver 🔎
        </a>
      </div>
    </div>
  );
}

/* -------- CTAs inline (sous la bulle) -------- */
function InlineCTAs({ mode }) {
  if (mode === 'FAP') {
    return (
      <div className="inline-ctas">
        <a
          href="https://re-fap.fr/trouver_garage_partenaire/?utm_source=autoai&utm_medium=cta&utm_campaign=v2&utm_content=bottom_garage"
          className="garage-button"
          rel="noopener noreferrer"
        >
          Prendre RDV 🔧
        </a>
        <a
          href="https://auto.re-fap.fr/?utm_source=autoai&utm_medium=cta&utm_campaign=v2&utm_content=bottom_cartercash"
          className="carter-button"
          rel="noopener noreferrer"
        >
          Déposer chez Carter-Cash 🛠️
        </a>
      </div>
    );
  }
  return (
    <div className="inline-ctas">
      <a
        href="https://re-fap.fr/trouver_garage_partenaire/?utm_source=autoai&utm_medium=cta&utm_campaign=v2&utm_content=bottom_diag"
        className="garage-button"
        rel="noopener noreferrer"
      >
        Prendre RDV diagnostic 🔎
      </a>
    </div>
  );
}

/* ------------------------ Page ------------------------ */
export default function Home() {
  const [messages, setMessages] = useState([
    {
      from: 'bot',
      text:
        "Bonjour 👋! Je suis **AutoAI** (Re-FAP). Je t’aide à comprendre un voyant, un souci de **FAP/DPF** ou autre panne et je t’oriente vers la bonne solution. Pose ta question 😊",
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [error, setError] = useState('');
  const [topic, setTopic] = useState('DIAG'); // 'FAP' | 'DIAG'
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
      setError("🔧 Tu as déjà échangé 10 messages avec moi sur ce sujet. Tu peux relancer une nouvelle session à tout moment 🚀.");
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
      const r = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: trimmedInput, historique: historiqueText }),
      });

      setLoading(false);

      if (!r.ok) {
        setMessages((msgs) => [
          ...msgs,
          { from: 'bot', text: r.status === 429
              ? "⚠️ Le service est temporairement saturé, merci de réessayer plus tard."
              : `Erreur serveur ${r.status}` }
        ]);
        return;
      }

      const data = await r.json();
      const text = data.reply || "Désolé, j’ai eu un souci. Renvoie ta question 🙂.";
      setMessages((msgs) => [...msgs, { from: 'bot', text }]);

      if (data.nextAction?.type === 'FAP' || data.nextAction?.type === 'DIAG') {
        setTopic(data.nextAction.type);
      }
    } catch {
      setLoading(false);
      setMessages((msgs) => [
        ...msgs,
        { from: 'bot', text: "Désolé, il y a eu une erreur réseau. Actualise et réessaie 🙂." },
      ]);
    }
  }

  return (
    <>
      <Head>
        <title>Auto AI</title>
         </Head>

      <main className="container">
        <h1>AutoAI par Re-FAP</h1>

        <div className="chat-and-button">
          {/* COLONNE GAUCHE : chat + CTAs collés */}
          <div className="left-rail">
            <div id="chat-window" className="chat-window">
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
                  <span className="dots"><span>.</span><span>.</span><span>.</span></span>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* CTAs sous la bulle, centrés et proches */}
            <InlineCTAs mode={topic} />
          </div>

          {/* COLONNE DROITE */}
          <aside className="right-rail">
            {topic === 'FAP' ? (
              <>
                <WhyCleanFAPCard />
                <CarterCashCard />
                <GarageFAPCard />
              </>
            ) : (
              <CtaForDiag />
            )}
          </aside>
        </div>

        {/* Formulaire d’envoi */}
        <form onSubmit={handleSubmit} className="chat-form">
          <input
            type="text"
            placeholder="Écris ta question ici…"
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
          <button type="submit" disabled={blocked || input.length > 600}>
            Envoyer
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

