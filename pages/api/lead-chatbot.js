// /pages/api/lead-chatbot.js 
// Proxy Vercel → WordPress admin-ajax.php
// Mappe les champs chatbot vers les noms attendus par le handler WP

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = req.body;

    // Construire le formulaire avec les VRAIS noms de champs WordPress
    const params = new URLSearchParams();
    params.append('action', 'refap_submit_lead');
    params.append('firstname', body.prenom || '');
    params.append('phone', body.telephone || '');
    params.append('contact_mode', 'call');
    params.append('source', 'auto.re-fap.fr');
    params.append('source_page', 'chatbot_inline');
    
    if (body.vehicule) params.append('vehicle', body.vehicule);
    if (body.symptomes) params.append('problem', body.symptomes);
    if (body.code_postal) params.append('postal_code', body.code_postal);
    if (body.km) params.append('message', 'Kilométrage: ' + body.km + (body.codes ? ' | Code: ' + body.codes : '') + (body.centre_proche ? ' | Centre: ' + body.centre_proche : ''));
    if (body.chatbot_cid) params.append('chatbot_cid', body.chatbot_cid);

    // Forward vers WordPress
    const wpResponse = await fetch('https://auto.re-fap.fr/wp-admin/admin-ajax.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
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
