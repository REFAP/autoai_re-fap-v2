/**
 * InlineChatForm.jsx — Formulaire inline chatbot Re-FAP
 * POST vers /api/lead-chatbot (même domaine Vercel = pas de CORS)
 * L'API Vercel forward vers WordPress côté serveur
 *
 * v2.1.0 — Ajout tracking source_page / UTM / referrer
 * via window.rfapGetTrackingData() exposé par WPCode sur re-fap.fr
 * Si le visiteur vient directement sur auto.re-fap.fr,
 * on lit les params UTM depuis l'URL courante en fallback.
 */

import { useState } from 'react';

/**
 * Lit les données de tracking depuis :
 * 1. window.rfapGetTrackingData() si dispo (visiteur venant de re-fap.fr)
 * 2. URLSearchParams de l'URL courante en fallback (lien direct avec UTMs)
 * 3. Valeurs vides sinon
 */
function getTrackingData() {
  // Cas 1 : visiteur venant de re-fap.fr via le snippet WPCode
  if (typeof window !== 'undefined' && typeof window.rfapGetTrackingData === 'function') {
    try {
      return window.rfapGetTrackingData();
    } catch (e) {
      // silencieux, on passe au fallback
    }
  }

  // Cas 2 : fallback — lecture des params dans l'URL courante
  // Utilisé quand le chatbot est ouvert via un lien direct avec UTMs
  // ex: auto.re-fap.fr/?source_page=p2002&utm_source=google
  if (typeof window !== 'undefined') {
    var params = new URLSearchParams(window.location.search);
    return {
      source_page:   params.get('source_page')   || 'chatbot-direct',
      source_url:    window.location.href,
      referrer:      document.referrer || '',
      utm_source:    params.get('utm_source')    || '',
      utm_medium:    params.get('utm_medium')    || '',
      utm_campaign:  params.get('utm_campaign')  || '',
      utm_content:   params.get('utm_content')   || '',
    };
  }

  // Cas 3 : SSR / aucune donnée disponible
  return {
    source_page:  'chatbot-direct',
    source_url:   '',
    referrer:     '',
    utm_source:   '',
    utm_medium:   '',
    utm_campaign: '',
    utm_content:  '',
  };
}

export default function InlineChatForm({ conversationId, conversationData, onSuccess }) {
  const [prenom, setPrenom]       = useState('');
  const [telephone, setTelephone] = useState('');
  const [loading, setLoading]     = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError]         = useState('');

  const handleSubmit = async () => {
    setError('');

    const cleanPhone = telephone.replace(/[\s.\-]/g, '');
    if (!/^(0[1-9])\d{8}$/.test(cleanPhone) && !/^\+33[1-9]\d{8}$/.test(cleanPhone)) {
      setError('Numéro de téléphone invalide');
      return;
    }
    if (!prenom.trim() || prenom.trim().length < 2) {
      setError('Prénom requis');
      return;
    }

    setLoading(true);

    // Récupère les données de tracking au moment du submit
    var tracking = getTrackingData();

    try {
      var res = await fetch('/api/lead-chatbot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // Données contact
          prenom:        prenom.trim(),
          telephone:     cleanPhone,
          chatbot_cid:   conversationId || '',
          // Données véhicule / diagnostic
          vehicule:      conversationData?.vehicule    || '',
          symptomes:     Array.isArray(conversationData?.symptome)
                           ? conversationData.symptome.join(', ')
                           : (conversationData?.symptome || ''),
          km:            conversationData?.km          || '',
          codes:         Array.isArray(conversationData?.codes)
                           ? conversationData.codes.join(', ')
                           : (conversationData?.codes  || ''),
          ville:         conversationData?.ville       || '',
          code_postal:   conversationData?.code_postal || '',
          centre_proche: conversationData?.centre_proche || '',
          // ↓ Tracking v2.1.0
          source_page:   tracking.source_page,
          source_url:    tracking.source_url,
          referrer:      tracking.referrer,
          utm_source:    tracking.utm_source,
          utm_medium:    tracking.utm_medium,
          utm_campaign:  tracking.utm_campaign,
          utm_content:   tracking.utm_content,
        }),
      });

      var data = await res.json();

      if (res.ok && data.success) {
        setSubmitted(true);
        if (onSuccess) onSuccess();
      } else {
        setError(data.error || "Erreur, réessaye ou appelle directement");
      }
    } catch (err) {
      setError('Erreur réseau, réessaye ou appelle directement');
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div style={styles.container}>
        <div style={styles.successBox}>
          <div style={{ fontSize: '24px', marginBottom: '4px' }}>✅</div>
          <div style={{ fontSize: '16px', fontWeight: '700', color: '#166534', marginBottom: '4px' }}>
            C'est noté {prenom} !
          </div>
          <div style={{ fontSize: '13px', color: '#15803d' }}>
            Un expert Re-FAP te rappelle rapidement au {telephone}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.formBox}>
        <div style={{ fontSize: '16px', fontWeight: '700', color: '#1a1a1a', marginBottom: '4px' }}>
          📞 On te rappelle
        </div>
        <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '12px', lineHeight: '1.4' }}>
          Laisse ton prénom et ton numéro, un expert Re-FAP te contacte rapidement.
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <input
            type="text"
            placeholder="Prénom"
            value={prenom}
            onChange={function(e) { setPrenom(e.target.value); }}
            style={styles.input}
            autoComplete="given-name"
            disabled={loading}
          />
          <input
            type="tel"
            placeholder="06 12 34 56 78"
            value={telephone}
            onChange={function(e) { setTelephone(e.target.value); }}
            style={styles.input}
            autoComplete="tel"
            disabled={loading}
            inputMode="tel"
          />

          {error && (
            <div style={{ color: '#dc2626', fontSize: '13px', padding: '4px 0' }}>{error}</div>
          )}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading}
            style={{
              width: '100%', padding: '12px', fontSize: '15px', fontWeight: '600',
              color: '#ffffff', background: '#2563eb', border: 'none', borderRadius: '8px',
              marginTop: '4px', fontFamily: 'inherit', cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? 'Envoi...' : 'Être rappelé ✓'}
          </button>
        </div>

        <div style={{ fontSize: '11px', color: '#9ca3af', textAlign: 'center', marginTop: '8px' }}>
          🔒 Données utilisées uniquement pour te recontacter
        </div>

        <div style={{ textAlign: 'center', fontSize: '12px', color: '#9ca3af', margin: '8px 0' }}>ou</div>

        <a href="tel:0473378821" style={styles.callLink}>
          📞 Appeler Julien, Expert FAP — 04 73 37 88 21
        </a>
      </div>
    </div>
  );
}

var styles = {
  container:  { padding: '8px 0', width: '100%', maxWidth: '340px' },
  formBox:    { background: '#ffffff', borderRadius: '12px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', border: '1px solid #e5e7eb' },
  input:      { width: '100%', padding: '10px 12px', fontSize: '15px', border: '1.5px solid #d1d5db', borderRadius: '8px', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', color: '#1a1a1a', background: '#fafafa' },
  callLink:   { display: 'block', textAlign: 'center', fontSize: '13px', fontWeight: '600', color: '#2563eb', textDecoration: 'none', padding: '8px', borderRadius: '8px', background: '#eff6ff', border: '1px solid #dbeafe' },
  successBox: { background: '#f0fdf4', borderRadius: '12px', padding: '16px', textAlign: 'center', border: '1px solid #bbf7d0' },
};
