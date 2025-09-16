<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Re-FAP - Dépôt Carter-Cash</title>
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

        .price-badge {
            background: #fff3cd;
            color: #856404;
            padding: 10px 20px;
            border-radius: 8px;
            display: inline-block;
            margin: 20px 0;
            font-weight: 600;
            font-size: 18px;
        }

        .stores-info {
            background: #e8f5e9;
            padding: 15px;
            border-radius: 8px;
            margin: 20px 0;
            text-align: center;
        }

        .stores-info strong {
            color: #2e7d32;
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
            Vous avez un FAP déjà démonté ou êtes à l'aise avec la mécanique.
        </p>

        <div class="benefits">
            <div class="benefit">
                <svg class="benefit-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M9 11l3 3L22 4"></path>
                    <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"></path>
                </svg>
                <div class="benefit-text">
                    <strong>Solution économique (99-199€ pour le nettoyage)</strong>
                </div>
            </div>

            <div class="benefit">
                <svg class="benefit-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M9 11l3 3L22 4"></path>
                    <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"></path>
                </svg>
                <div class="benefit-text">
                    <strong>94 magasins Carter-Cash partout en France</strong>
                </div>
            </div>

            <div class="benefit">
                <svg class="benefit-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M9 11l3 3L22 4"></path>
                    <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"></path>
                </svg>
                <div class="benefit-text">
                    <strong>Sans rendez-vous, dépôt immédiat</strong>
                </div>
            </div>
        </div>

        <button class="cta-button" onclick="showModal()">
            Voir les magasins Carter-Cash →
        </button>

        <div class="stores-info">
            <strong>94 magasins</strong> partout en France<br>
            Trouvez le plus proche de chez vous
        </div>

        <div class="footer-info">
            Recommandation basée sur vos réponses (modifiable à tout moment)<br>
            <a href="garage-landing.html">Voir l'autre option</a>
        </div>
    </div>

    <!-- Modal -->
    <div class="modal" id="infoModal">
        <div class="modal-content">
            <div class="modal-header">
                <button class="modal-close" onclick="closeModal()">&times;</button>
                <h2 class="modal-title">📋 Questions fréquentes sur le dépôt</h2>
            </div>
            <div class="modal-body">
                <div class="steps">
                    <div class="step">
                        <div class="step-content">
                            <div class="step-title">Qui démonte/remonte ?</div>
                            <div class="step-description">
                                Le client démonte et remonte lui-même le FAP. Le service Carter-Cash se limite au nettoyage de la pièce déposée. Des tutoriels vidéo sont disponibles sur YouTube pour votre modèle de véhicule.
                            </div>
                        </div>
                    </div>
                    
                    <div class="step">
                        <div class="step-content">
                            <div class="step-title">Comment ça fonctionne ?</div>
                            <div class="step-description">
                                1. Démontez votre FAP<br>
                                2. Apportez-le en magasin Carter-Cash<br>
                                3. Récupérez-le nettoyé sous 48-72h<br>
                                4. Remontez-le sur votre véhicule
                            </div>
                        </div>
                    </div>
                    
                    <div class="step">
                        <div class="step-content">
                            <div class="step-title">Quel est le prix ?</div>
                            <div class="step-description">
                                Entre 99€ et 199€ selon la taille du FAP. Prix fixe, pas de surprise. Service garanti 1 an.
                            </div>
                        </div>
                    </div>

                    <div class="step">
                        <div class="step-content">
                            <div class="step-title">Besoin d'un rendez-vous ?</div>
                            <div class="step-description">
                                Non, le dépôt se fait sans rendez-vous directement en magasin. Présentez-vous avec votre FAP démonté à l'accueil.
                            </div>
                        </div>
                    </div>
                </div>

                <div style="background: #fff3cd; padding: 15px; border-radius: 8px; margin: 20px 0;">
                    <p style="color: #856404;">
                        ⚠️ <strong>Important :</strong> Cette solution nécessite de démonter et remonter soi-même le FAP. Si vous n'êtes pas à l'aise avec la mécanique, privilégiez la solution garage.
                    </p>
                </div>

                <div class="checkbox-container">
                    <input type="checkbox" id="dontShow" />
                    <label for="dontShow" class="checkbox-label">Ne plus afficher ce message</label>
                </div>

                <a href="https://www.carter-cash.com/services/nettoyage-fap?utm_source=re-fap&utm_medium=partenariat&utm_campaign=depot-fap" 
                   class="modal-cta" 
                   target="_blank">
                    Continuer vers Carter-Cash →
                </a>
            </div>
        </div>
    </div>

    <script>
        function showModal() {
            // Vérifier si l'utilisateur a coché "Ne plus afficher"
            if (localStorage.getItem('dontShowCarterModal') === 'true') {
                // Redirection directe vers Carter-Cash
                window.open('https://www.carter-cash.com/services/nettoyage-fap?utm_source=re-fap&utm_medium=partenariat&utm_campaign=depot-fap', '_blank');
            } else {
                // Afficher la modal
                document.getElementById('infoModal').classList.add('show');
            }
        }

        function closeModal() {
            // Sauvegarder la préférence si cochée
            if (document.getElementById('dontShow').checked) {
                localStorage.setItem('dontShowCarterModal', 'true');
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
                localStorage.setItem('dontShowCarterModal', 'true');
            } else {
                localStorage.removeItem('dontShowCarterModal');
            }
        });
    </script>
</body>
</html>
