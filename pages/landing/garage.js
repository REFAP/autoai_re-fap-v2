<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Re-FAP - Diagnostic FAP Garage Partenaire</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }

        .container {
            background: white;
            border-radius: 20px;
            padding: 40px;
            max-width: 600px;
            width: 100%;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        }

        .logo {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-bottom: 30px;
        }

        .logo-text {
            font-size: 32px;
            font-weight: bold;
            color: #8BC34A;
        }

        h1 {
            color: #2ecc71;
            font-size: 28px;
            margin-bottom: 20px;
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .check-icon {
            width: 32px;
            height: 32px;
            background: #2ecc71;
            border-radius: 50%;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            color: white;
        }

        .subtitle {
            font-size: 18px;
            color: #333;
            margin-bottom: 30px;
            line-height: 1.5;
        }

        .benefits {
            margin-bottom: 30px;
        }

        .benefit {
            display: flex;
            align-items: flex-start;
            gap: 15px;
            margin-bottom: 20px;
        }

        .benefit-icon {
            width: 24px;
            height: 24px;
            color: #2ecc71;
            flex-shrink: 0;
            margin-top: 2px;
        }

        .benefit-text {
            color: #555;
            line-height: 1.6;
        }

        .benefit-title {
            font-weight: 600;
            color: #333;
            margin-bottom: 4px;
        }

        .cta-button {
            display: block;
            width: 100%;
            padding: 18px 30px;
            background: #2ecc71;
            color: white;
            text-decoration: none;
            border-radius: 10px;
            font-size: 18px;
            font-weight: 600;
            text-align: center;
            transition: all 0.3s ease;
            border: none;
            cursor: pointer;
        }

        .cta-button:hover {
            background: #27ae60;
            transform: translateY(-2px);
            box-shadow: 0 10px 20px rgba(46, 204, 113, 0.3);
        }

        .info-box {
            background: #f8f9fa;
            border-radius: 10px;
            padding: 20px;
            margin: 30px 0;
            text-align: center;
        }

        .info-box-title {
            font-size: 16px;
            color: #666;
            margin-bottom: 10px;
        }

        .info-box-content {
            font-weight: 600;
            color: #333;
        }

        .footer-info {
            text-align: center;
            margin-top: 20px;
            color: #999;
            font-size: 14px;
        }

        .footer-info a {
            color: #2ecc71;
            text-decoration: none;
        }

        /* Modal Styles */
        .modal {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            align-items: center;
            justify-content: center;
            z-index: 1000;
            padding: 20px;
        }

        .modal.show {
            display: flex;
        }

        .modal-content {
            background: white;
            border-radius: 20px;
            max-width: 600px;
            width: 100%;
            max-height: 90vh;
            overflow-y: auto;
            position: relative;
        }

        .modal-header {
            padding: 30px 30px 20px;
            border-bottom: 1px solid #eee;
            position: sticky;
            top: 0;
            background: white;
            z-index: 10;
        }

        .modal-close {
            position: absolute;
            top: 20px;
            right: 20px;
            background: none;
            border: none;
            font-size: 28px;
            color: #999;
            cursor: pointer;
            width: 36px;
            height: 36px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 50%;
            transition: background 0.3s;
        }

        .modal-close:hover {
            background: #f5f5f5;
        }

        .modal-body {
            padding: 30px;
        }

        .modal-title {
            color: #2ecc71;
            font-size: 24px;
            font-weight: 600;
            margin-bottom: 10px;
            padding-right: 40px;
        }

        .modal-subtitle {
            color: #666;
            font-size: 16px;
            line-height: 1.5;
        }

        .steps {
            margin: 30px 0;
        }

        .step {
            display: flex;
            gap: 20px;
            margin-bottom: 25px;
        }

        .step-number {
            width: 40px;
            height: 40px;
            background: #2ecc71;
            color: white;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
            font-size: 18px;
            flex-shrink: 0;
        }

        .step-content {
            flex: 1;
        }

        .step-title {
            font-weight: 600;
            color: #333;
            margin-bottom: 5px;
            font-size: 18px;
        }

        .step-description {
            color: #666;
            line-height: 1.6;
        }

        .modal-cta {
            background: #2ecc71;
            color: white;
            padding: 18px 30px;
            border-radius: 10px;
            font-size: 18px;
            font-weight: 600;
            text-align: center;
            text-decoration: none;
            display: block;
            transition: all 0.3s ease;
            margin-top: 20px;
        }

        .modal-cta:hover {
            background: #27ae60;
            transform: translateY(-2px);
        }

        .checkbox-container {
            display: flex;
            align-items: flex-start;
            gap: 10px;
            margin: 20px 0;
            padding: 15px;
            background: #f8f9fa;
            border-radius: 8px;
        }

        .checkbox-container input {
            margin-top: 3px;
        }

        .checkbox-label {
            color: #666;
            font-size: 14px;
            line-height: 1.5;
        }

        .security-badges {
            display: flex;
            gap: 20px;
            justify-content: center;
            margin-top: 20px;
            padding-top: 20px;
            border-top: 1px solid #eee;
        }

        .badge {
            display: flex;
            align-items: center;
            gap: 8px;
            color: #666;
            font-size: 14px;
        }

        .badge-icon {
            width: 20px;
            height: 20px;
            color: #2ecc71;
        }

        @media (max-width: 600px) {
            .container {
                padding: 30px 20px;
            }

            h1 {
                font-size: 24px;
            }

            .modal-content {
                margin: 10px;
            }

            .step {
                gap: 15px;
            }

            .step-number {
                width: 35px;
                height: 35px;
                font-size: 16px;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="logo">
            <span class="logo-text">re-fap</span>
        </div>

        <h1>
            <span class="check-icon">✓</span>
            Votre recommandation personnalisée
        </h1>

        <p class="subtitle">
            Vous préférez une solution clé en main avec prise en charge complète.
        </p>

        <div class="benefits">
            <div class="benefit">
                <svg class="benefit-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M9 11l3 3L22 4"></path>
                    <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"></path>
                </svg>
                <div>
                    <div class="benefit-title">① Entrez votre immatriculation et code postal</div>
                    <div class="benefit-text">Pour identifier votre véhicule et localiser les garages proches</div>
                </div>
            </div>

            <div class="benefit">
                <svg class="benefit-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M9 11l3 3L22 4"></path>
                    <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"></path>
                </svg>
                <div>
                    <div class="benefit-title">② Comparez les garages certifiés Re-FAP</div>
                    <div class="benefit-text">Prix, proximité, disponibilités, avis clients</div>
                </div>
            </div>

            <div class="benefit">
                <svg class="benefit-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M9 11l3 3L22 4"></path>
                    <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"></path>
                </svg>
                <div>
                    <div class="benefit-title">③ Prenez RDV pour un diagnostic</div>
                    <div class="benefit-text">Le garage proposera un devis tout compris si nettoyage nécessaire</div>
                </div>
            </div>
        </div>

        <button class="cta-button" onclick="showModal()">
            Prendre RDV pour un diagnostic →
        </button>

        <div class="info-box">
            <div class="info-box-title">Pourquoi un diagnostic ?</div>
            <div class="info-box-content">
                Pour confirmer la cause (FAP vs capteur/EGR), éviter des dépenses inutiles,<br>
                et obtenir un <strong>devis tout compris</strong> si un nettoyage est nécessaire.
            </div>
        </div>

        <div class="security-badges">
            <div class="badge">
                <svg class="badge-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                    <path d="M7 11V7a5 5 0 0110 0v4"></path>
                </svg>
                <span>Carte grise sous la main</span>
            </div>
            <div class="badge">
                <svg class="badge-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"></circle>
                    <polyline points="12 6 12 12 16 14"></polyline>
                </svg>
                <span>Saisie 1-2 minutes</span>
            </div>
        </div>

        <div class="footer-info">
            Recommandation basée sur vos réponses (modifiable à tout moment)<br>
            <a href="#" onclick="window.history.back(); return false;">Voir l'autre option</a>
        </div>
    </div>

    <!-- Modal -->
    <div class="modal" id="infoModal">
        <div class="modal-content">
            <div class="modal-header">
                <button class="modal-close" onclick="closeModal()">&times;</button>
                <h2 class="modal-title">📋 Ce qui va se passer sur notre site partenaire</h2>
                <p class="modal-subtitle">
                    ✅ La prise de RDV diagnostic est sans engagement. Vous ne payez que si une intervention est nécessaire.
                </p>
            </div>
            <div class="modal-body">
                <p style="color: #666; margin-bottom: 20px;">Pour obtenir votre diagnostic FAP et devis personnalisé :</p>
                
                <div class="steps">
                    <div class="step">
                        <div class="step-number">1</div>
                        <div class="step-content">
                            <div class="step-title">Entrez votre immatriculation et code postal</div>
                            <div class="step-description">Pour identifier votre véhicule et localiser les garages proches</div>
                        </div>
                    </div>
                    
                    <div class="step">
                        <div class="step-number">2</div>
                        <div class="step-content">
                            <div class="step-title">Comparez les garages certifiés Re-FAP</div>
                            <div class="step-description">Prix, proximité, disponibilités, avis clients</div>
                        </div>
                    </div>
                    
                    <div class="step">
                        <div class="step-number">3</div>
                        <div class="step-content">
                            <div class="step-title">Prenez RDV pour un diagnostic</div>
                            <div class="step-description">Le garage proposera un devis tout compris si nettoyage nécessaire</div>
                        </div>
                    </div>
                </div>

                <div style="background: #e8f5e9; padding: 15px; border-radius: 8px; margin: 20px 0;">
                    <p style="color: #2e7d32; font-weight: 600; margin-bottom: 5px;">
                        ✅ Vous restez libre de choisir le garage qui vous convient
                    </p>
                </div>

                <div class="checkbox-container">
                    <input type="checkbox" id="dontShow" />
                    <label for="dontShow" class="checkbox-label">Ne plus afficher ce message</label>
                </div>

                <a href="https://www.idgarages.com/fr-fr/prestations/diagnostic-electronique?utm_source=re-fap&utm_medium=partenariat&utm_campaign=diagnostic-electronique&ept-publisher=re-fap&ept-name=re-fap-diagnostic-electronique" 
                   class="modal-cta" 
                   target="_blank">
                    Continuer vers IDGarages →
                </a>
            </div>
        </div>
    </div>

    <script>
        function showModal() {
            // Vérifier si l'utilisateur a coché "Ne plus afficher"
            if (localStorage.getItem('dontShowGarageModal') === 'true') {
                // Redirection directe vers IDGarages
                window.open('https://www.idgarages.com/fr-fr/prestations/diagnostic-electronique?utm_source=re-fap&utm_medium=partenariat&utm_campaign=diagnostic-electronique&ept-publisher=re-fap&ept-name=re-fap-diagnostic-electronique', '_blank');
            } else {
                // Afficher la modal
                document.getElementById('infoModal').classList.add('show');
            }
        }

        function closeModal() {
            // Sauvegarder la préférence si cochée
            if (document.getElementById('dontShow').checked) {
                localStorage.setItem('dontShowGarageModal', 'true');
            }
            document.getElementById('infoModal').classList.remove('show');
        }

        // Fermer la modal en cliquant à l'extérieur
        document.getElementById('infoModal').addEventListener('click', function(e) {
            if (e.target === this) {
                closeModal();
            }
        });

        // Gérer la case à cocher
        document.getElementById('dontShow').addEventListener('change', function() {
            if (this.checked) {
                localStorage.setItem('dontShowGarageModal', 'true');
            } else {
                localStorage.removeItem('dontShowGarageModal');
            }
        });
    </script>
</body>
</html>
