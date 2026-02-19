/**
 * InlineChatForm.jsx — Formulaire inline chatbot Re-FAP
 * POST FormData vers WordPress admin-ajax.php
 * CORS géré par le snippet WPCode "CORS Chatbot"
 */

import { useState } from 'react';

export default function InlineChatForm({ conversationId, conversationData, onSuccess }) {
  const [prenom, setPrenom] = useState('');
  const [telephone, setTelephone] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

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

    try {
      var formData = new FormData();
      formData.append('action', 'refap_submit_lead');
      formData.append('prenom', prenom.trim());
      formData.append('telephone', cleanPhone);
      formData.append('contact_mode', 'callback');
      formData.append('source', 'auto.re-fap.fr');
      formData.append('source_page', 'chatbot_inline');
      formData.append('form_type', 'chatbot');
      if (conversationId) formData.append('chatbot_cid', conversationId);
      if (conversationData?.vehicule) formData.append('vehicule', conversationData.vehicule);
      if (conversationData?.symptome) {
        formData.append('symptomes', Array.isArray(conversationData.symptome) ? conversationData.symptome.join(', ') : conversationData.symptome);
      }
      if (conversationData?.km) formData.append('mileage', conversationData.km);
      if (conversationData?.codes) {
        var c = Array.isArray(conversationData.codes) ? conversationData.codes.join(', ') : conversationData.codes;
        if (c) formData.append('fault_code', c);
      }
      if (conversationData?.ville) formData.append('ville', conversationData.ville);
      if (conversationData?.code_postal) formData.append('code_postal', conversationData.code_postal);
      if (conversationData?.centre_proche) formData.append('centre_proche', conversationData.centre_proche);

      var res = await fetch('https://auto.re-fap.fr/wp-admin/admin-ajax.php', {
        method: 'POST',
        body: formData,
      });

      var data = await res.json();

      if (data.success) {
        setSubmitted(true);
        if (onSuccess) onSuccess();
      } else {
        setError("Erreur, réessaye ou appelle directement");
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

          {error && <div style={{ color: '#dc2626', fontSize: '13px', padding: '4px 0' }}>{error}</div>}

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
  container: { padding: '8px 0', width: '100%', maxWidth: '340px' },
  formBox: { background: '#ffffff', borderRadius: '12px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', border: '1px solid #e5e7eb' },
  input: { width: '100%', padding: '10px 12px', fontSize: '15px', border: '1.5px solid #d1d5db', borderRadius: '8px', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', color: '#1a1a1a', background: '#fafafa' },
  callLink: { display: 'block', textAlign: 'center', fontSize: '13px', fontWeight: '600', color: '#2563eb', textDecoration: 'none', padding: '8px', borderRadius: '8px', background: '#eff6ff', border: '1px solid #dbeafe' },
  successBox: { background: '#f0fdf4', borderRadius: '12px', padding: '16px', textAlign: 'center', border: '1px solid #bbf7d0' },
};
