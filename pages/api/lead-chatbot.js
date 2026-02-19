// /pages/api/lead-chatbot.js
// Proxy Vercel → WordPress admin-ajax.php
// Le client poste ici (même domaine = pas de CORS)
// Ce endpoint forward vers WordPress côté serveur (serveur-à-serveur = pas de CORS)

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = req.body;

    // Construire le formulaire pour WordPress
    const params = new URLSearchParams();
    params.append('action', 'refap_submit_lead');
    params.append('prenom', body.prenom || '');
    params.append('telephone', body.telephone || '');
    params.append('contact_mode', 'callback');
    params.append('source', 'auto.re-fap.fr');
    params.append('source_page', 'chatbot_inline');
    params.append('form_type', 'chatbot');

    if (body.chatbot_cid) params.append('chatbot_cid', body.chatbot_cid);
    if (body.vehicule) params.append('vehicule', body.vehicule);
    if (body.symptomes) params.append('symptomes', body.symptomes);
    if (body.km) params.append('mileage', body.km);
    if (body.codes) params.append('fault_code', body.codes);
    if (body.ville) params.append('ville', body.ville);
    if (body.code_postal) params.append('code_postal', body.code_postal);
    if (body.centre_proche) params.append('centre_proche', body.centre_proche);

    // Forward vers WordPress
    const wpResponse = await fetch('https://auto.re-fap.fr/wp-admin/admin-ajax.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    const wpData = await wpResponse.json();

    if (wpData.success) {
      return res.status(200).json({ success: true });
    } else {
      console.error('WP error:', wpData);
      return res.status(200).json({ success: false, error: 'Erreur WordPress' });
    }

  } catch (err) {
    console.error('lead-chatbot proxy error:', err);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}
