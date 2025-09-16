// pages/landing/carter.js
import { useState, useEffect } from 'react';
import Head from 'next/head';

export default function CarterLanding() {
  const [showModal, setShowModal] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('dontShowCarterModal');
    if (stored === 'true') {
      setDontShowAgain(true);
    }
  }, []);

  const handleCTAClick = () => {
    if (dontShowAgain || localStorage.getItem('dontShowCarterModal') === 'true') {
      window.open('https://refap.github.io/carter-cash-refap/', '_blank');
    } else {
      setShowModal(true);
    }
  };

  const handleCloseModal = () => {
    if (dontShowAgain) {
      localStorage.setItem('dontShowCarterModal', 'true');
    }
    setShowModal(false);
  };

  const handleContinue = () => {
    if (dontShowAgain) {
      localStorage.setItem('dontShowCarterModal', 'true');
    }
    window.open('https://refap.github.io/carter-cash-refap/', '_blank');
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
    storesInfo: {
      background: '#e8f5e9',
      padding: '15px',
      borderRadius: '8px',
      margin: '20px 0',
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
        <title>Re-FAP - Dépôt Carter-Cash</title>
      </Head>

      <div style={styles.container}>
        <div style={styles.content}>
          <div style={styles.logo}>re-fap</div>

          <h1 style={styles.title}>
            <span style={styles.checkIcon}>✓</span>
            Vous être à l'aise en mécanique et vous pouvez démonter votre FAP
          </h1>
          <div style={{marginBottom: '30px'}}>
            <div style={styles.benefit}>
              <svg style={styles.benefitIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 11l3 3L22 4"></path>
                <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"></path>
              </svg>
              <div style={styles.benefitText}>
                <strong>Solution économique (99-199€ pour le nettoyage)</strong>
              </div>
            </div>

            <div style={styles.benefit}>
              <svg style={styles.benefitIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 11l3 3L22 4"></path>
                <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"></path>
              </svg>
              <div style={styles.benefitText}>
                <strong>94 magasins Carter-Cash partout en France</strong>
              </div>
            </div>

            <div style={styles.benefit}>
              <svg style={styles.benefitIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 11l3 3L22 4"></path>
                <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"></path>
              </svg>
              <div style={styles.benefitText}>
                <strong>Sans rendez-vous, dépôt immédiat</strong>
              </div>
            </div>
          </div>

          <button style={styles.ctaButton} onClick={handleCTAClick}>
            Voir les magasins Carter-Cash →
          </button>

          <div style={styles.storesInfo}>
            <strong style={{color: '#2e7d32'}}>94 magasins</strong> partout en France<br/>
            Trouvez le plus proche de chez vous
          </div>

          <div style={{textAlign: 'center', marginTop: '20px', color: '#999', fontSize: '14px'}}>
            Recommandation basée sur vos réponses (modifiable à tout moment)<br/>
            <a href="/landing/garage" style={{color: '#2ecc71', textDecoration: 'none'}}>
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
                  📋 Questions fréquentes sur le dépôt
                </h2>
              </div>
              
              <div style={{padding: '30px'}}>
                <div style={{margin: '30px 0'}}>
                  <div style={{marginBottom: '25px'}}>
                    <div style={{fontWeight: '600', color: '#333', marginBottom: '5px', fontSize: '18px'}}>
                      Qui démonte/remonte ?
                    </div>
                    <div style={{color: '#666', lineHeight: '1.6'}}>
                      Le client démonte et remonte lui-même le FAP. Le service Carter-Cash se limite au nettoyage de la pièce déposée. 
                    </div>
                  </div>
                  
                  <div style={{marginBottom: '25px'}}>
                    <div style={{fontWeight: '600', color: '#333', marginBottom: '5px', fontSize: '18px'}}>
                      Comment ça fonctionne ?
                    </div>
                    <div style={{color: '#666', lineHeight: '1.6'}}>
                      1. Démontez votre FAP<br/>
                      2. Apportez-le en magasin Carter-Cash<br/>
                      3. Récupérez-le nettoyé et fonctionnant comme neuf<br/>
                      4. Remontez-le sur votre véhicule et pensez à le réinitialiser par OBD
                    </div>
                  </div>
                  
                  <div style={{marginBottom: '25px'}}>
                    <div style={{fontWeight: '600', color: '#333', marginBottom: '5px', fontSize: '18px'}}>
                      Quel est le prix ?
                    </div>
                    <div style={{color: '#666', lineHeight: '1.6'}}>
                      Entre 99€ et 199€. Prix fixe, pas de surprise. Service garanti 1 an.
                    </div>
                  </div>

                  <div style={{marginBottom: '25px'}}>
                    <div style={{fontWeight: '600', color: '#333', marginBottom: '5px', fontSize: '18px'}}>
                      Besoin d'un rendez-vous ?
                    </div>
                    <div style={{color: '#666', lineHeight: '1.6'}}>
                      Non, le dépôt se fait sans rendez-vous directement en magasin. Présentez-vous avec votre FAP démonté à l'accueil.
                    </div>
                  </div>
                </div>

                <div style={{
                  background: '#fff3cd',
                  padding: '15px',
                  borderRadius: '8px',
                  margin: '20px 0',
                  color: '#856404'
                }}>
                  ⚠️ <strong>Important :</strong> Cette solution nécessite de démonter et remonter soi-même le FAP. Si vous n'êtes pas à l'aise avec la mécanique, privilégiez la solution garage.
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
                  Continuer vers Carter-Cash →
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
