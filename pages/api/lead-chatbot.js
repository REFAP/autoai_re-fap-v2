/**
 * /pages/api/lead-chatbot.js — Endpoint lead chatbot inline
 * 
 * Reçoit les soumissions du formulaire inline du chatbot.
 * Stocke dans Supabase (table chatbot_leads) + POST vers WordPress CRM handler.
 * 
 * Payload attendu :
 * {
 *   prenom: "Jean",
 *   telephone: "0612345678",
 *   conversation_id: "uuid",
 *   vehicule: "Peugeot 308 1.6 HDI 2015",
 *   symptomes: "voyant_fap,perte_puissance",
 *   km: "145000",
 *   ville: "Roubaix",
 *   code_postal: "59100",
 *   tentative_precedente: "additif",
 *   fault_code: "P2002",
 *   centre_proche: "Carter-Cash Lambres-lez-Douai",
 *   urgence: "haute"
 * }
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
process.env.SUPABASE_SERVICE_ROLE_KEY
);

// URL du handler WordPress CRM (existant)
const WP_CRM_HANDLER = process.env.WP_CRM_HANDLER_URL || 'https://auto.re-fap.fr/wp-json/refap/v1/lead';

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const {
    prenom,
    telephone,
    conversation_id,
    vehicule,
    symptomes,
    km,
    ville,
    code_postal,
    tentative_precedente,
    fault_code,
    centre_proche,
    urgence,
  } = req.body;

  // Validation minimale
  if (!prenom || !telephone) {
    return res.status(400).json({ error: 'Prénom et téléphone requis' });
  }

  const cleanPhone = telephone.replace(/[\s.\-]/g, '');
  if (!/^(0[1-9])\d{8}$/.test(cleanPhone) && !/^\+33[1-9]\d{8}$/.test(cleanPhone)) {
    return res.status(400).json({ error: 'Numéro de téléphone invalide' });
  }

  try {
    // ─── 1. Stocker dans Supabase ───
    const leadData = {
      conversation_id: conversation_id || null,
      prenom: prenom.trim(),
      telephone: cleanPhone,
      vehicule: vehicule || null,
      symptomes: symptomes || null,
      km: km || null,
      ville: ville || null,
      code_postal: code_postal || null,
      tentative_precedente: tentative_precedente || null,
      fault_code: fault_code || null,
      centre_proche: centre_proche || null,
      urgence: urgence || null,
      source: 'chatbot_inline',
      created_at: new Date().toISOString(),
      status: 'new',
    };

    const { data: supaLead, error: supaError } = await supabase
      .from('chatbot_leads')
      .insert(leadData)
      .select()
      .single();

    if (supaError) {
      console.error('[lead-chatbot] Supabase error:', supaError);
      // On continue quand même pour essayer le CRM WordPress
    }

    // ─── 2. POST vers WordPress CRM handler (async, non-bloquant) ───
    // Envoie les données au format attendu par le handler WPCode existant
    try {
      const wpPayload = new URLSearchParams({
        form_type: 'chatbot',
        prenom: prenom.trim(),
        telephone: cleanPhone,
        vehicule: vehicule || '',
        symptomes: symptomes || '',
        mileage: km || '',
        ville: ville || '',
        code_postal: code_postal || '',
        chatbot_cid: conversation_id || '',
        fault_code: fault_code || '',
        contact_mode: 'chatbot_inline',
      });

      // Fire & forget — on n'attend pas la réponse WP pour ne pas bloquer le user
      fetch(WP_CRM_HANDLER, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: wpPayload.toString(),
      }).catch(err => {
        console.error('[lead-chatbot] WP CRM sync error:', err.message);
      });
    } catch (wpErr) {
      console.error('[lead-chatbot] WP CRM error:', wpErr.message);
      // Non-bloquant : le lead est déjà dans Supabase
    }

    // ─── 3. Tracker l'orientation dans centre_assignments ───
    // Si on a identifié un centre proche, on crée l'orientation
    if (centre_proche && conversation_id) {
      try {
        // Résoudre le centre_code depuis le nom du centre
        const { data: centreMatch } = await supabase
          .from('centre_code_map')
          .select('centre_code')
          .or(`label.ilike.%${centre_proche}%,alias.ilike.%${centre_proche}%`)
          .limit(1)
          .single();

        if (centreMatch) {
          await supabase.from('centre_assignments').insert({
            conversation_id,
            centre_code: centreMatch.centre_code,
            channel: 'CHATBOT',
            created_at: new Date().toISOString(),
          });
        }
      } catch (orientErr) {
        console.error('[lead-chatbot] Orientation tracking error:', orientErr.message);
      }
    }

    // ─── Réponse ───
    return res.status(200).json({
      success: true,
      lead_id: supaLead?.id || null,
      message: 'Lead enregistré',
    });

  } catch (err) {
    console.error('[lead-chatbot] Unexpected error:', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}
