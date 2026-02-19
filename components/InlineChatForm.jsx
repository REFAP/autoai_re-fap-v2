/**
 * InlineChatForm.jsx — Formulaire inline chatbot Re-FAP
 * 
 * S'affiche dans le chat quand Mistral retourne OPEN_FORM.
 * 2 champs seulement : prénom + téléphone.
 * Le reste (véhicule, km, symptômes, ville) vient du DATA JSON de la conversation.
 * 
 * INTÉGRATION : Importer dans le composant chat principal et afficher
 * quand `showInlineForm` est true (voir INTEGRATION.md)
 */

import { useState } from 'react';

export default function InlineChatForm({ conversationId, conversationData, onSuccess, onError }) {
  const [prenom, setPrenom] = useState('');
  const [telephone, setTelephone] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
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
const res = await fetch('https://autoai-re-fap-v2.vercel.app/api/lead-chatbot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prenom: prenom.trim(),
          telephone: cleanPhone,
          conversation_id: conversationId,
          // DATA JSON collecté pendant la conversation
          vehicule: conversationData?.vehicule || '',
          symptomes: conversationData?.symptome || '',
          km: conversationData?.km || '',
          ville: conversationData?.ville || '',
          code_postal: conversationData?.code_postal || '',
          tentative_precedente: conversationData?.tentative || '',
          fault_code: conversationData?.codes?.join(', ') || '',
          centre_proche: conversationData?.centre_proche || '',
          urgence: conversationData?.urgence || '',
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setSubmitted(true);
        onSuccess?.();
      } else {
        setError(data.error || 'Erreur lors de l\'envoi');
        onError?.(data.error);
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

        <form onSubmit={handleSubmit} style={styles.form}>
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
            type="submit"
            style={{
              ...styles.button,
              opacity: loading ? 0.7 : 1,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
            disabled={loading}
          >
            {loading ? 'Envoi...' : 'Être rappelé ✓'}
          </button>
        </form>

        <div style={styles.privacy}>
          🔒 Données utilisées uniquement pour te recontacter
        </div>
      </div>
    </div>
  );
}

// Styles inline pour éviter les dépendances CSS externes
// Adaptés au contexte chatbot (fond sombre probable, mobile-first)
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
    background: '#2563eb', // Bleu Re-FAP
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
  // Succès
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
};
