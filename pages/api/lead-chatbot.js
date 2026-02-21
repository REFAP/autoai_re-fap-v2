// /pages/api/lead-chatbot.js
// Proxy Vercel → WordPress admin-ajax.php
// Mappe les champs chatbot vers les noms attendus par le handler WP
//
// v2.1.0 — Forward tracking complet : source_page, source_url,
//           referrer, utm_source, utm_medium, utm_campaign, utm_content

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = req.body;

    // Construire le formulaire avec les VRAIS noms de champs WordPress
    const params = new URLSearchParams();
    params.append('action',       'refap_submit_lead');
    params.append('firstname',    body.prenom     || '');
    params.append('phone',        body.telephone  || '');
    params.append('contact_mode', 'call');
    params.append('source',       'auto.re-fap.fr');

    // ── Tracking : source_page dynamique (plus de valeur hardcodée)
    // Priorité : ce que le frontend envoie, sinon fallback 'chatbot-direct'
    params.append('source_page', body.source_page || 'chatbot-direct');

    // ── Tracking : URL complète, referrer, UTMs
    if (body.source_url)    params.append('source_url',    body.source_url);
    if (body.referrer)      params.append('referrer',      body.referrer);
    if (body.utm_source)    params.append('utm_source',    body.utm_source);
    if (body.utm_medium)    params.append('utm_medium',    body.utm_medium);
    if (body.utm_campaign)  params.append('utm_campaign',  body.utm_campaign);
    if (body.utm_content)   params.append('utm_content',   body.utm_content);

    // ── Données véhicule / diagnostic
    if (body.vehicule)      params.append('vehicle',      body.vehicule);
    if (body.symptomes)     params.append('problem',      body.symptomes);
    if (body.code_postal)   params.append('postal_code',  body.code_postal);
    if (body.chatbot_cid)   params.append('chatbot_cid',  body.chatbot_cid);

    // Message enrichi avec toutes les métadonnées diagnostic
    const messageParts = [];
    if (body.km)            messageParts.push('Kilométrage: ' + body.km);
    if (body.codes)         messageParts.push('Code: '        + body.codes);
    if (body.centre_proche) messageParts.push('Centre: '      + body.centre_proche);
    if (body.ville)         messageParts.push('Ville: '        + body.ville);
    if (messageParts.length > 0) {
      params.append('message', messageParts.join(' | '));
    }

    // Forward vers WordPress
    const wpResponse = await fetch('https://auto.re-fap.fr/wp-admin/admin-ajax.php', {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    params.toString(),
    });

    const wpData = await wpResponse.json();

    if (wpData.success) {
      return res.status(200).json({ success: true, lead_id: wpData.data?.lead_id });
    } else {
      console.error('WP error:', wpData);
      return res.status(200).json({ success: false, error: 'Erreur WordPress' });
    }
  } catch (err) {
    console.error('lead-chatbot proxy error:', err);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}
