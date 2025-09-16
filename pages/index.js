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

// ========================================
