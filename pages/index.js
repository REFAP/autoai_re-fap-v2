// ========================================
// MODIFICATIONS POUR LE BOT AUTOAI
// ========================================

// 1. CHERCHEZ LA PARTIE OÙ VOUS DÉFINISSEZ LES BOUTONS D'ACTION
// Généralement après l'analyse du diagnostic, vous devez avoir quelque chose comme :

// ANCIEN CODE (à remplacer) :
if (diagnosis.includes('garage') || recommendation === 'garage') {
  setNextAction({
    type: 'garage',
    url: 'https://www.idgarages.com/prestations/re-fap', // ANCIENNE URL
    text: 'Prendre RDV en garage partenaire'
  });
}

// NOUVEAU CODE (remplacer par) :
if (diagnosis.includes('garage') || recommendation === 'garage') {
  setNextAction({
    type: 'garage',
    url: 'https://refap.github.io/re-fap-landing/?route=garage&utm_source=bot&utm_medium=cta&utm_campaign=garage_direct#recommendation',
    text: 'Voir ma solution garage personnalisée →'
  });
}

// ========================================

// 2. CHERCHEZ LA PARTIE OÙ VOUS RENDEZ LES BOUTONS CTA
// Probablement dans le JSX, quelque chose comme :

// ANCIEN CODE :
{nextAction && nextAction.type === 'garage' && (
  <a 
    href={nextAction.url}
    target="_blank"
    rel="noopener noreferrer"
    className="btn-garage"
  >
    {nextAction.text}
  </a>
)}

// NOUVEAU CODE (amélioration avec tracking) :
{nextAction && nextAction.type === 'garage' && (
  <a 
    href={nextAction.url}
    target="_blank"
    rel="noopener noreferrer"
    className="btn-garage"
    onClick={() => {
      // Tracking optionnel
      if (typeof gtag !== 'undefined') {
        gtag('event', 'click', {
          event_category: 'bot_cta',
          event_label: 'garage_direct_recommendation',
          value: 1
        });
      }
      // Ou avec autre système de tracking
      console.log('Bot CTA: Navigation vers recommandation garage');
    }}
  >
    <span>🔧</span> {nextAction.text}
  </a>
)}

// ========================================

// 3. SI VOUS AVEZ PLUSIEURS ENDROITS AVEC DES LIENS GARAGE
// Remplacez TOUTES les URLs IDGarages par la nouvelle URL :

const GARAGE_DIRECT_URL = 'https://refap.github.io/re-fap-landing/?route=garage&utm_source=bot&utm_medium=cta&utm_campaign=garage_direct#recommendation';

// Puis utilisez cette constante partout :
// - Dans les boutons
// - Dans les messages de recommandation
// - Dans les liens texte

// ========================================

// 4. POUR LES MESSAGES DU BOT QUI RECOMMANDENT LE GARAGE
// Modifiez le texte pour être plus précis :

// ANCIEN MESSAGE :
"Je vous recommande une prise en charge complète en garage partenaire Re-FAP."

// NOUVEAU MESSAGE :
"Je vous recommande une prise en charge complète en garage partenaire Re-FAP. 
Cliquez sur le bouton ci-dessous pour accéder directement à votre recommandation personnalisée avec les étapes détaillées."

// ========================================

// 5. SI VOUS AVEZ UN BOUTON CARTER-CASH AUSSI
// Pour l'option dépôt magasin :

const CARTER_DIRECT_URL = 'https://refap.github.io/re-fap-landing/?route=depot&utm_source=bot&utm_medium=cta&utm_campaign=carter_direct#recommendation';

// ========================================

// 6. EXEMPLE COMPLET D'INTÉGRATION DANS VOTRE COMPOSANT :

// Dans la partie logique (après l'analyse) :
function generateRecommendation(analysis) {
  if (analysis.needsFullService || !analysis.canDismount) {
    return {
      type: 'garage',
      title: '✅ Solution recommandée : Garage partenaire',
      description: 'Prise en charge complète avec diagnostic, démontage, nettoyage et remontage.',
      cta: {
        url: 'https://refap.github.io/re-fap-landing/?route=garage&utm_source=bot&utm_medium=cta&utm_campaign=garage_direct#recommendation',
        text: 'Voir ma solution personnalisée →',
        icon: '🔧'
      }
    };
  } else if (analysis.hasRemovedDPF || analysis.isComfortable) {
    return {
      type: 'depot',
      title: '✅ Solution recommandée : Dépôt Carter-Cash',
      description: 'Dépôt de votre FAP déjà démonté dans l\'un des 94 magasins.',
      cta: {
        url: 'https://refap.github.io/carter-cash-refap/?utm_source=bot&utm_medium=cta&utm_campaign=carter_depot',
        text: 'Trouver un magasin →',
        icon: '📍'
      }
    };
  }
}

// Dans le JSX :
{recommendation && (
  <div className="recommendation-card">
    <h3>{recommendation.title}</h3>
    <p>{recommendation.description}</p>
    <a 
      href={recommendation.cta.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`btn btn-${recommendation.type}`}
      onClick={trackClick}
    >
      {recommendation.cta.icon} {recommendation.cta.text}
    </a>
  </div>
)}

// ========================================
// URLS À UTILISER :
// ========================================

// GARAGE (solution clé en main) :
// https://refap.github.io/re-fap-landing/?route=garage&utm_source=bot&utm_medium=cta&utm_campaign=garage_direct#recommendation

// CARTER-CASH (dépôt magasin) :
// https://refap.github.io/carter-cash-refap/?utm_source=bot&utm_medium=cta&utm_campaign=carter_depot

// INFORMATION GÉNÉRALE (si indécis) :
// https://refap.github.io/re-fap-landing/#quiz

// ========================================      return;
    }

    const trimmedInput = input.trim();
    if (!trimmedInput) return;

    const userMsg = { from: 'user', text: trimmedInput };
    setMessages((msgs) => [...msgs, userMsg]);
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
        if (res.status === 429) {
          setMessages((msgs) => [
            ...msgs,
            { from: 'bot', text: "Service temporairement saturé. Veuillez réessayer dans quelques instants." },
          ]);
        } else {
          setMessages((msgs) => [
            ...msgs,
            { from: 'bot', text: `Erreur serveur ${res.status}` },
          ]);
        }
        return;
      }

      const data = await res.json();
      const botMsg = {
        from: 'bot',
        text: data.reply || "Service temporairement indisponible. Veuillez réessayer.",
      };
      setMessages((msgs) => [...msgs, botMsg]);
      setNextAction(data.nextAction || { type: 'GEN' });

    } catch {
      setLoading(false);
      setMessages((msgs) => [
        ...msgs,
        { from: 'bot', text: "Erreur de connexion. Veuillez actualiser la page." },
      ]);
    }
  }

  return (
    <>
      <Head>
        <title>AutoAI - Expert FAP par Re-FAP</title>
        <link rel="stylesheet" href="/style.css" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </Head>

      <div className="app-container">
        <main className="chat-container">
          {/* Header */}
          <div className="chat-header">
            <div className="header-content">
              <div className="logo-section">
                <div className="logo-circle">
                  <span className="logo-text">AI</span>
                </div>
                <div className="header-text">
                  <h1>AutoAI par Re-FAP</h1>
                  <p className="subtitle">Expert en diagnostic FAP • Service disponible partout en France</p>
                </div>
              </div>
              <div className="status-indicator">
                <span className="status-dot"></span>
                <span>En ligne</span>
              </div>
            </div>
          </div>

          <div className="chat-main">
            {/* Zone de chat */}
            <div className="chat-area">
              <div className="messages-container">
                {messages.map((m, i) => (
                  <div key={i} className={`message ${m.from}`}>
                    <div className="message-header">
                      {m.from === 'user' ? (
                        <span className="message-author user-author">Vous</span>
                      ) : (
                        <span className="message-author bot-author">AutoAI</span>
                      )}
                    </div>
                    <div className="message-bubble">
                      <ReactMarkdown>{m.text.replace(/\n{2,}/g, '\n')}</ReactMarkdown>
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

              {/* Zone de saisie */}
              <form onSubmit={handleSubmit} className="input-form">
                <div className="input-wrapper">
                  <input
                    type="text"
                    placeholder="Décrivez votre problème de FAP..."
                    value={input}
                    onChange={(e) => {
                      const val = e.target.value;
                      setInput(val);
                      setError(val.length > 600 ? 'Message limité à 600 caractères' : '');
                    }}
                    autoComplete="off"
                    className="message-input"
                    disabled={blocked}
                    maxLength={600}
                  />
                  <button 
                    type="submit" 
                    className="send-button"
                    disabled={blocked || input.length > 600 || loading || !input.trim()}
                  >
                    {loading ? (
                      <span className="button-loading">...</span>
                    ) : (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                        <path d="M22 2L11 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </button>
                </div>
                {error && <div className="error-message">{error}</div>}
              </form>
            </div>

            {/* Zone CTA */}
            <div className="cta-zone">
              <div className="cta-header">
                <h3>Actions rapides</h3>
                <p>Choisissez selon votre situation</p>
              </div>

              {nextAction?.type === 'FAP' && (
                <>
                  <a href="https://re-fap.fr/trouver_garage_partenaire/" className="cta-button primary">
                    <div className="cta-icon">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                        <path d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z" fill="currentColor"/>
                      </svg>
                    </div>
                    <div className="cta-content">
                      <span className="cta-title">FAP monté ?</span>
                      <span className="cta-subtitle">Prendre RDV en garage</span>
                    </div>
                    <svg className="cta-arrow" width="20" height="20" viewBox="0 0 24 24" fill="none">
                      <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                  </a>

                  <a href="https://auto.re-fap.fr" className="cta-button secondary">
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
                <a href="https://re-fap.fr/trouver_garage_partenaire/" className="cta-button primary">
                  <div className="cta-icon">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                      <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2"/>
                      <path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                  </div>
                  <div className="cta-content">
                    <span className="cta-title">Diagnostic complet</span>
                    <span className="cta-subtitle">Garage proche de vous</span>
                  </div>
                  <svg className="cta-arrow" width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                </a>
              )}

              {(!nextAction || nextAction.type === 'GEN') && (
                <>
                  <a href="https://re-fap.fr/trouver_garage_partenaire/" className="cta-button primary">
                    <div className="cta-icon">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                        <path d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z" fill="currentColor"/>
                      </svg>
                    </div>
                    <div className="cta-content">
                      <span className="cta-title">Garage partenaire</span>
                      <span className="cta-subtitle">Service complet</span>
                    </div>
                    <svg className="cta-arrow" width="20" height="20" viewBox="0 0 24 24" fill="none">
                      <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                  </a>

                  <a href="https://auto.re-fap.fr" className="cta-button secondary">
                    <div className="cta-icon">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" fill="currentColor"/>
                        <path d="M14 2v6h6" stroke="white" strokeWidth="2"/>
                      </svg>
                    </div>
                    <div className="cta-content">
                      <span className="cta-title">Carter-Cash</span>
                      <span className="cta-subtitle">Dépôt FAP démonté</span>
                    </div>
                    <svg className="cta-arrow" width="20" height="20" viewBox="0 0 24 24" fill="none">
                      <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                  </a>
                </>
              )}

              <div className="info-card">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
                  <path d="M12 16v-4M12 8h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
                <span>Service garanti 1 an • Partout en France</span>
              </div>
            </div>
          </div>
        </main>

        <footer className="footer">
          <p>AutoAI peut faire des erreurs. Vérifiez les informations importantes auprès d'un professionnel.</p>
        </footer>
      </div>
    </>
  );
}

