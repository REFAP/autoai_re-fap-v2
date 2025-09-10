// pages/api/chat.js
import { handleChat } from '../../lib/engine';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée.' });

  try {
    const { question = '', historique = '' } = req.body || {};
    if (!String(question || '').trim()) return res.status(400).json({ error: 'question manquante' });

    const result = await handleChat({ question, historique });
    return res.status(200).json(result);
  } catch {
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}
