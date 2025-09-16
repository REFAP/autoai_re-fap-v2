// pages/landing/garage.js
import { useState, useEffect } from 'react';
import Head from 'next/head';

export default function GarageLanding() {
  const [showModal, setShowModal] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('dontShowGarageModal');
    if (stored === 'true') {
      setDontShowAgain(true);
    }
  }, []);

  const handleCTAClick = () => {
    if (dontShowAgain || localStorage.getItem('dontShowGarageModal') === 'true') {
      window.open('https://www.idgarages.com/fr-fr/prestations/diagnostic-electronique?utm_source=re-fap&utm_medium=partenariat&utm_campaign=diagnostic-electronique&ept-publisher=re-fap&ept-name=re-fap-diagnostic-electronique', '_blank');
    } else {
      setShowModal(true);
    }
  };

  const handleCloseModal = () => {
    if (dontShowAgain) {
      localStorage.setItem('dontShowGarageModal', 'true');
    }
    setShowModal(false);
  };

  const handleContinue = () => {
    if (dontShowAgain) {
      localStorage.setItem('dontShowGarageModal', 'true');
    }
    window.open('https://www.idgarages.com/fr-fr/prestations/diagnostic-electronique?utm_source=re-fap&utm_medium=partenariat&utm_campaign=diagnostic-electronique&ept-publisher=re-fap&ept-name=re-fap-diagnostic-electronique', '_blank');
    setShowModal(false);
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
      maxWidth: '600px',
      width: '100%',
      boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)'
    },
    logo: {
      fontSize: '32px',
      fontWeight: 'bold',
      color: '#8BC34A',
      marginBottom: '30px'
    },
    title: {
      color: '#2ecc71',
      fontSize: '28px',
      marginBottom: '20px',
      display: 'flex',
      alignItems: 'center',
      gap: '10px'
    },
    checkIcon: {
      width: '32px',
      height: '32px',
      background: '#2ecc71',
      borderRadius: '50%',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'white'
    },
    subtitle: {
      fontSize: '18px',
      color: '#333',
      marginBottom: '30px',
      lineHeight: '1.5'
    },
    benefit: {
      display: 'flex',
      alignItems: 'flex-start',
      gap: '15px',
      marginBottom: '20px'
    },
    benefitIcon: {
      width: '24px',
      height: '24px',
      color: '#2ecc71',
      flexShrink: 0,
      marginTop: '2px'
    },
    benefitTitle: {
      fontWeight: '600',
      color: '#333',
      marginBottom: '4px'
    },
    benefitText: {
      color: '#555',
      lineHeight: '1.6'
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
      transition: 'all 0.3s ease'
    },
    infoBox: {
      background: '#f8f9fa',
      borderRadius: '10px',
      padding: '20px',
      margin: '30px 0',
      textAlign: 'center'
    },
    modal: {
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      background: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '20px'
    },
    modalContent: {
      background: 'white',
      borderRadius: '20px',
      maxWidth: '600px',
      width: '100%',
      maxHeight: '90vh',
      overflowY: 'auto',
      position: 'relative'
    },
    modalHeader: {
      padding: '30px 30px 20px',
      borderBottom: '1px solid #eee',
      position: 'sticky',
      top: 0,
      background: 'white',
      zIndex: 10
    },
    modalClose: {
      position: 'absolute',
      top: '20px',
      right: '20px',
      background: 'none',
      border: 'none',
      fontSize: '28px',
      color: '#999',
      cursor: 'pointer'
    }
  };

  return (
    <>
      <Head>
        <title>Re-FAP - Diagnostic FAP Garage Partenaire</title>
      </Head>

      <div style={styles.container}>
        <div style={styles.content}>
          <div style={styles.logo}>re-fap</div>

          <h1 style={styles.title}>
            <span style={styles.checkIcon}>✓</span>
            Votre recommandation personnalisée
          </h1>

          <p style={styles.subtitle}>
            Vous préférez une solution clé en main avec prise en charge complète.
          </p>

          <div style={{marginBottom: '30px'}}>
            <div style={styles.benefit}>
              <svg style={styles.benefitIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 11l3 3L22 4"></path>
                <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"></path>
              </svg>
              <div>
                <div style={styles.benefitTitle}>① Entrez votre immatriculation et code postal</div>
                <div style={styles.benefitText}>Pour identifier votre véhicule et localiser les garages proches</div>
              </div>
            </div>

            <div style={styles.benefit}>
              <svg style={styles.benefitIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 11l3 3L22 4"></path>
                <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"></path>
              </svg>
              <div>
                <div style={styles.benefitTitle}>② Comparez les garages certifiés Re-FAP</div>
                <div style={styles.benefitText}>Prix, proximité, disponibilités, avis clients</div>
              </div>
            </div>

            <div style={styles.benefit}>
              <svg style={styles.benefitIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 11l3 3L22 4"></path>
                <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"></path>
              </svg>
              <div>
                <div style={styles.benefitTitle}>③ Prenez RDV pour un diagnostic</div>
                <div style={styles.benefitText}>Le garage proposera un devis tout compris si nettoyage nécessaire</div>
              </div>
            </div>
          </div>

          <button style={styles.ctaButton} onClick={handleCTAClick}>
            Prendre RDV pour un diagnostic →
          </button>

          <div style={styles.infoBox}>
            <div style={{fontSize: '16px', color: '#666', marginBottom: '10px'}}>
              Pourquoi un diagnostic ?
            </div>
            <div style={{fontWeight: '600', color: '#333'}}>
              Pour confirmer la cause (FAP vs capteur/EGR), éviter des dépenses inutiles,<br/>
              et obtenir un <strong>devis tout compris</strong> si un nettoyage est nécessaire.
            </div>
          </div>

          <div style={{textAlign: 'center', marginTop: '20px', color: '#999', fontSize: '14px'}}>
            Recommandation basée sur vos réponses (modifiable à tout moment)<br/>
            <a href="/landing/carter" style={{color: '#2ecc71', textDecoration: 'none'}}>
              Voir l'autre option
            </a>
          </div>
        </div>

        {showModal && (
          <div style={styles.modal} onClick={handleCloseModal}>
            <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
              <div style={styles.modalHeader}>
                <button style={styles.modalClose} onClick={handleCloseModal}>&times;</button>
                <h2 style={{color: '#2ecc71', fontSize: '24px', fontWeight: '600', paddingRight: '40px'}}>
                  📋 Ce qui va se passer sur notre site partenaire
                </h2>
                <p style={{color: '#666', fontSize: '16px', marginTop: '10px'}}>
                  ✅ La prise de RDV diagnostic est sans engagement. Vous ne payez que si une intervention est nécessaire.
                </p>
              </div>
              
              <div style={{padding: '30px'}}>
                <p style={{color: '#666', marginBottom: '20px'}}>
                  Pour obtenir votre diagnostic FAP et devis personnalisé :
                </p>
                
                <div style={{margin: '30px 0'}}>
                  <div style={{display: 'flex', gap: '20px', marginBottom: '25px'}}>
                    <div style={{
                      width: '40px',
                      height: '40px',
                      background: '#2ecc71',
                      color: 'white',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 'bold',
                      fontSize: '18px',
                      flexShrink: 0
                    }}>1</div>
                    <div>
                      <div style={{fontWeight: '600', color: '#333', marginBottom: '5px', fontSize: '18px'}}>
                        Entrez votre immatriculation et code postal
                      </div>
                      <div style={{color: '#666', lineHeight: '1.6'}}>
                        Pour identifier votre véhicule et localiser les garages proches
                      </div>
                    </div>
                  </div>
                  
                  <div style={{display: 'flex', gap: '20px', marginBottom: '25px'}}>
                    <div style={{
                      width: '40px',
                      height: '40px',
                      background: '#2ecc71',
                      color: 'white',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 'bold',
                      fontSize: '18px',
                      flexShrink: 0
                    }}>2</div>
                    <div>
                      <div style={{fontWeight: '600', color: '#333', marginBottom: '5px', fontSize: '18px'}}>
                        Comparez les garages certifiés Re-FAP
                      </div>
                      <div style={{color: '#666', lineHeight: '1.6'}}>
                        Prix, proximité, disponibilités, avis clients
                      </div>
                    </div>
                  </div>
                  
                  <div style={{display: 'flex', gap: '20px', marginBottom: '25px'}}>
                    <div style={{
                      width: '40px',
                      height: '40px',
                      background: '#2ecc71',
                      color: 'white',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 'bold',
                      fontSize: '18px',
                      flexShrink: 0
                    }}>3</div>
                    <div>
                      <div style={{fontWeight: '600', color: '#333', marginBottom: '5px', fontSize: '18px'}}>
                        Prenez RDV pour un diagnostic
                      </div>
                      <div style={{color: '#666', lineHeight: '1.6'}}>
                        Le garage proposera un devis tout compris si nettoyage nécessaire
                      </div>
                    </div>
                  </div>
                </div>

                <div style={{
                  background: '#e8f5e9',
                  padding: '15px',
                  borderRadius: '8px',
                  margin: '20px 0',
                  color: '#2e7d32',
                  fontWeight: '600'
                }}>
                  ✅ Vous restez libre de choisir le garage qui vous convient
                </div>

                <div style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '10px',
                  margin: '20px 0',
                  padding: '15px',
                  background: '#f8f9fa',
                  borderRadius: '8px'
                }}>
                  <input 
                    type="checkbox" 
                    id="dontShow" 
                    checked={dontShowAgain}
                    onChange={(e) => setDontShowAgain(e.target.checked)}
                    style={{marginTop: '3px'}}
                  />
                  <label htmlFor="dontShow" style={{color: '#666', fontSize: '14px', lineHeight: '1.5'}}>
                    Ne plus afficher ce message
                  </label>
                </div>

                <button 
                  onClick={handleContinue}
                  style={{
                    ...styles.ctaButton,
                    marginTop: '20px'
                  }}
                >
                  Continuer vers IDGarages →
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
