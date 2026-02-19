/**
 * InlineChatForm.jsx — Formulaire inline chatbot Re-FAP
 * 
 * POST direct vers WordPress admin-ajax.php (handler refap_submit_lead)
 * → Le lead arrive directement dans wp_refap_devis comme les autres
 */

import { useState } from 'react';

export default function InlineChatForm({ conversationId, conversationData, onSuccess, onError }) {
  const [prenom, setPrenom] = useState('');
  const [telephone, setTelephone] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    setError('');

    // Validation téléphone FR (mobile ou fixe)
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
      // POST vers WordPress admin-ajax.php — même handler que le formulaire auto.re-fap.fr
      const formData = new FormData();
      formData.append('action', 'refap_submit_lead');
      formData.append('prenom', prenom.trim());
      formData.append('telephone', cleanPhone);
      formData.append('contact_mode', 'callback');
      formData.append('source', 'auto.re-fap.fr');
      formData.append('source_page', 'chatbot_inline');

      // Données enrichies depuis le DATA JSON du chatbot
      if (conversationData?.vehicule) formData.append('vehicule', conversationData.vehicule);
      if (conversationData?.symptome) {
        const symp = Array.isArray(conversationData.symptome)
          ? conversationData.symptome.join(', ')
          : conversationData.symptome;
        formData.append('symptomes', symp);
      }
      if (conversationData?.km) formData.append('mileage', conversationData.km);
      if (conversationData?.codes) {
        const codes = Array.isArray(conversationData.codes)
          ? conversationData.codes.join(', ')
          : conversationData.codes;
        if (codes) formData.append('fault_code', codes);
      }
      if (conversationData?.ville) formData.append('ville', conversationData.ville);
      if (conversationData?.code_postal) formData.append('code_postal', conversationData.code_postal);
      if (conversationData?.centre_proche) formData.append('centre_proche', conversationData.centre_proche);
      if (conversationId) formData.append('chatbot_cid', conversationId);
      formData.append('form_type', 'chatbot');

      const res = await fetch('https://auto.re-fap.fr/wp-admin/admin-ajax.php', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (data.success) {
        setSubmitted(true);
        onSuccess?.();
      } else {
        setError(data.data?.message || "Erreur lors de l'envoi");
        onError?.(data.data?.message);
      }
    } catch (err) {
      setError('Erreur réseau, réessaye');
      onError?.(err.message);
    } finally {
      setLoading(false);
    }
  };

  // État succès
  if (submitted) {
    return (
      <div style={styles.container}>
        <div style={styles.successBox}>
          <div style={styles.successIcon}>✅</div>
          <div style={styles.successTitle}>C'est noté {prenom} !</div>
          <div style={styles.successText}>
            Un expert Re-FAP te rappelle rapidement au {telephone}
          </div>
        </div>
      </div>
    );
  }

  // Formulaire
  return (
    <div style={styles.container}>
      <div style={styles.formBox}>
        <div style={styles.formTitle}>📞 On te rappelle</div>
        <div style={styles.formSubtitle}>
          Laisse ton prénom et ton numéro, un expert Re-FAP te contacte rapidement.
        </div>

        <div style={styles.form}>
          <input
            type="text"
            placeholder="Prénom"
            value={prenom}
            onChange={(e) => setPrenom(e.target.value)}
            style={styles.input}
            autoComplete="given-name"
            required
            disabled={loading}
          />
          <input
            type="tel"
            placeholder="06 12 34 56 78"
            value={telephone}
            onChange={(e) => setTelephone(e.target.value)}
            style={styles.input}
            autoComplete="tel"
            required
            disabled={loading}
            inputMode="tel"
          />

          {error && <div style={styles.error}>{error}</div>}

          <button
            type="button"
            onClick={handleSubmit}
            style={{
              ...styles.button,
              opacity: loading ? 0.7 : 1,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
            disabled={loading}
          >
            {loading ? 'Envoi...' : 'Être rappelé ✓'}
          </button>
        </div>

        <div style={styles.privacy}>
          🔒 Données utilisées uniquement pour te recontacter
        </div>

        <div style={styles.separator}>ou</div>

        <a href="tel:0473378821" style={styles.callLink}>
          📞 Appeler Julien, Expert FAP — 04 73 37 88 21
        </a>
      </div>
    </div>
  );
}

const styles = {
  container: {
    padding: '8px 0',
    width: '100%',
    maxWidth: '340px',
  },
  formBox: {
    background: '#ffffff',
    borderRadius: '12px',
    padding: '16px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
    border: '1px solid #e5e7eb',
  },
  formTitle: {
    fontSize: '16px',
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: '4px',
  },
  formSubtitle: {
    fontSize: '13px',
    color: '#6b7280',
    marginBottom: '12px',
    lineHeight: '1.4',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    fontSize: '15px',
    border: '1.5px solid #d1d5db',
    borderRadius: '8px',
    outline: 'none',
    transition: 'border-color 0.2s',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
    color: '#1a1a1a',
    background: '#fafafa',
  },
  button: {
    width: '100%',
    padding: '12px',
    fontSize: '15px',
    fontWeight: '600',
    color: '#ffffff',
    background: '#2563eb',
    border: 'none',
    borderRadius: '8px',
    marginTop: '4px',
    fontFamily: 'inherit',
    transition: 'background 0.2s',
  },
  error: {
    color: '#dc2626',
    fontSize: '13px',
    padding: '4px 0',
  },
  privacy: {
    fontSize: '11px',
    color: '#9ca3af',
    textAlign: 'center',
    marginTop: '8px',
  },
  successBox: {
    background: '#f0fdf4',
    borderRadius: '12px',
    padding: '16px',
    textAlign: 'center',
    border: '1px solid #bbf7d0',
  },
  successIcon: {
    fontSize: '24px',
    marginBottom: '4px',
  },
  successTitle: {
    fontSize: '16px',
    fontWeight: '700',
    color: '#166534',
    marginBottom: '4px',
  },
  successText: {
    fontSize: '13px',
    color: '#15803d',
    lineHeight: '1.4',
  },
  separator: {
    textAlign: 'center',
    fontSize: '12px',
    color: '#9ca3af',
    margin: '8px 0',
  },
  callLink: {
    display: 'block',
    textAlign: 'center',
    fontSize: '13px',
    fontWeight: '600',
    color: '#2563eb',
    textDecoration: 'none',
    padding: '8px',
    borderRadius: '8px',
    background: '#eff6ff',
    border: '1px solid #dbeafe',
  },
};
