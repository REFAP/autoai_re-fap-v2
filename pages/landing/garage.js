// pages/landing/garage.js
import { useState, useEffect } from 'react';
import Head from 'next/head';

export default function GarageLanding() {
  const [agreed, setAgreed] = useState(false);

  const handleContinue = () => {
    window.open('https://www.idgarages.com/fr-fr/prestations/diagnostic-electronique?utm_source=re-fap&utm_medium=partenariat&utm_campaign=diagnostic-electronique&ept-publisher=re-fap&ept-name=re-fap-diagnostic-electronique', '_blank');
  };

  const styles = {
    container: {
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px'
    },
    content: {
      background: 'white',
      borderRadius: '20px',
      padding: '40px',
      maxWidth: '700px',
      width: '100%',
      boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)'
    },
    logo: {
      fontSize: '32px',
      fontWeight: 'bold',
      color: '#8BC34A',
      marginBottom: '30px'
    },
    mainTitle: {
      fontSize: '32px',
      fontWeight: 'bold',
      color: '#333',
      marginBottom: '10px',
      lineHeight: '1.2',
      textAlign: 'center'
    },
    mainTitleHighlight: {
      color: '#2ecc71',
      display: 'block',
      fontSize: '36px'
    },
    subtitle: {
      fontSize: '18px',
      color: '#333',
      marginBottom: '30px',
      lineHeight: '1.5'
    },
    section: {
      marginBottom: '25px'
    },
    sectionTitle: {
      fontSize: '20px',
      fontWeight: '600',
      color: '#333',
      marginBottom: '15px',
      display: 'flex',
      alignItems: 'center',
      gap: '10px'
    },
    sectionIcon: {
      width: '24px',
      height: '24px',
      color: '#2ecc71'
    },
    warningBox: {
      background: '#fff3cd',
      borderLeft: '4px solid #ffc107',
      padding: '15px',
      borderRadius: '8px',
      marginBottom: '20px'
    },
    successBox: {
      background: '#e8f5e9',
      borderLeft: '4px solid #2ecc71',
      padding: '15px',
      borderRadius: '8px',
      marginBottom: '20px'
    },
    step: {
      display: 'flex',
      alignItems: 'flex-start',
      gap: '15px',
      marginBottom: '15px'
    },
    stepNumber: {
      width: '28px',
      height: '28px',
      background: '#2ecc71',
      color: 'white',
      borderRadius: '50%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontWeight: 'bold',
      fontSize: '14px',
      flexShrink: 0
    },
    stepContent: {
      flex: 1
    },
    stepTitle: {
      fontWeight: '600',
      color: '#333',
      marginBottom: '4px'
    },
    stepText: {
      color: '#666',
      fontSize: '14px',
      lineHeight: '1.5'
    },
    ctaButton: {
      display: 'block',
      width: '100%',
      padding: '18px 30px',
      background: '#2ecc71',
      color: 'white',
      border: 'none',
      borderRadius: '10px',
      fontSize: '18px',
      fontWeight: '600',
      textAlign: 'center',
      cursor: 'pointer',
      transition: 'all 0.3s ease',
      marginTop: '20px'
    },
    ctaButtonDisabled: {
      background: '#95a5a6',
      cursor: 'not-allowed'
    },
    checkboxContainer: {
      display: 'flex',
      alignItems: 'flex-start',
      gap: '10px',
      marginTop: '20px',
      marginBottom: '10px',
      padding: '15px',
      background: '#f8f9fa',
      borderRadius: '8px'
    },
    badge: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '5px',
      padding: '5px 10px',
      background: '#e8f5e9',
      borderRadius: '5px',
      fontSize: '14px',
      color: '#2e7d32',
      marginRight: '10px'
    }
  };

  return (
    <>
      <Head>
        <title>Re-FAP - Économisez 1000€ sur votre FAP</title>
      </Head>

      <div style={styles.container}>
        <div style={styles.content}>
          <div style={styles.logo}>re-fap</div>

          {/* Nouveau titre principal accrocheur */}
          <h1 style={styles.mainTitle}>
            <span style={styles.mainTitleHighlight}>Économisez 1000€*</span>
            Trouvez un garage FAP de confiance<br/>près de chez vous en 2 min
          </h1>
          
          <div style={{textAlign: 'center', fontSize: '11px', color: '#999', marginTop: '5px', marginBottom: '25px'}}>
            *Économie moyenne constatée en choisissant le nettoyage vs remplacement. Varie selon le type de moteur et de véhicule.
          </div>

          <p style={styles.subtitle}>
            Vous avez besoin d'un garage de confiance pour prendre en charge votre FAP tout compris <strong>(Dépose, nettoyage re-fap, repose, réinitialisation)</strong>.
            L'économie provient du choix du nettoyage comme neuf plutôt que du remplacement complet.
            Voici la solution clé en main que nous vous proposons.
          </p>

          {/* Section : Pourquoi cette recommandation */}
          <div style={styles.section}>
            <h2 style={styles.sectionTitle}>
              <svg style={styles.sectionIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z"/>
              </svg>
              Pourquoi commencer par un diagnostic ?
            </h2>
                    
            <div style={{color: '#666', lineHeight: '1.8'}}>
              Le diagnostic permet de :
              <ul style={{marginTop: '10px', paddingLeft: '25px'}}>
                <li><strong>Confirmer l'origine exacte</strong> du problème (FAP, capteur, EGR...)</li>
                <li><strong>Éviter des dépenses inutiles</strong> si ce n'est pas le FAP</li>
                <li><strong>Obtenir un devis tout compris (dépose du FAP, nettoyage re-fap, repose et réinitialisation</strong> adapté à votre véhicule</li>
              </ul>
            </div>
          </div>

          {/* Section : Comment ça marche */}
          <div style={styles.section}>
            <h2 style={styles.sectionTitle}>
              <svg style={styles.sectionIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 11l3 3L22 4"></path>
                <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"></path>
              </svg>
              Comment obtenir rapidement un RDV près de chez vous
            </h2>

            <div style={styles.step}>
              <div style={styles.stepNumber}>1</div>
              <div style={styles.stepContent}>
                <div style={styles.stepTitle}>Entrez votre immatriculation</div>
                <div style={styles.stepText}>IDGarages identifie automatiquement votre véhicule et ses spécificités techniques</div>
              </div>
            </div>

            <div style={styles.step}>
              <div style={styles.stepNumber}>2</div>
              <div style={styles.stepContent}>
                <div style={styles.stepTitle}>Comparez les garages certifiés proches</div>
                <div style={styles.stepText}>Prix transparents, disponibilités en temps réel, avis clients vérifiés, distance</div>
              </div>
            </div>

            <div style={styles.step}>
              <div style={styles.stepNumber}>3</div>
              <div style={styles.stepContent}>
                <div style={styles.stepTitle}>Prenez RDV pour le diagnostic près de chez vous</div>
                <div style={styles.stepText}>Garages à moins de 20 min de votre position</div>
              </div>
            </div>

            <div style={styles.step}>
              <div style={styles.stepNumber}>4</div>
              <div style={styles.stepContent}>
                <div style={styles.stepTitle}>Recevez votre devis personnalisé</div>
                <div style={styles.stepText}>Prix tout compris : diagnostic + nettoyage FAP si nécessaire + garantie 1 an</div>
              </div>
            </div>
          </div>

          {/* Section : Avantages */}
          <div style={styles.successBox}>
            <div style={{fontWeight: '600', marginBottom: '8px'}}>✅ Vos avantages avec cette solution :</div>
            <div style={{fontSize: '14px', lineHeight: '1.6'}}>
              • <strong>Économie garantie</strong> : 1000€ de moins qu'un remplacement<br/>
              • <strong>Proximité</strong> : Garages à moins de 20 min de chez vous<br/>
              • <strong>Prix garantis</strong> : Devis ferme avant toute intervention<br/>
              • <strong>Garages certifiés</strong> : Professionnels agréés et formés<br/>
              • <strong>Garantie 1 an</strong> : Sur le nettoyage re-fap
            </div>
          </div>

          {/* Section : Engagement */}
          <div style={{marginBottom: '20px'}}>
            <div style={{marginBottom: '10px'}}>
              <span style={styles.badge}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                  <path d="M7 11V7a5 5 0 0110 0v4"/>
                </svg>
                Données sécurisées
              </span>
              <span style={styles.badge}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <polyline points="12 6 12 12 16 14"/>
                </svg>
                2 minutes
              </span>
              <span style={styles.badge}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0116 0z"/>
                  <circle cx="12" cy="10" r="3"/>
                </svg>
                Proche de vous
              </span>
            </div>
          </div>

          <div style={styles.checkboxContainer}>
            <input 
              type="checkbox" 
              id="understand" 
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              style={{marginTop: '3px'}}
            />
            <label htmlFor="understand" style={{color: '#666', fontSize: '14px', lineHeight: '1.5'}}>
              Je comprends l'importance du diagnostic préalable et je reste libre de choisir mon garage parmi les professionnels certifiés
            </label>
          </div>

          <button 
            onClick={handleContinue}
            style={{
              ...styles.ctaButton,
              ...(agreed ? {} : styles.ctaButtonDisabled)
            }}
            disabled={!agreed}
          >
            {agreed ? '🚗 Trouver mon garage maintenant →' : 'Cochez pour continuer'}
          </button>

          <div style={{textAlign: 'center', marginTop: '20px', fontSize: '13px', color: '#999'}}>
            Vous allez être redirigé vers notre partenaire IDGarages<br/>
            <a href="/landing/carter" style={{color: '#2ecc71', textDecoration: 'none'}}>
              Voir l'option Carter-Cash (FAP démonté)
            </a>
          </div>
        </div>
      </div>
    </>
  );
}
