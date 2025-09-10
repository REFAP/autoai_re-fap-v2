ï»¿// pages/api/ping.js
export default function handler(req, res) {
  res.status(200).json({
    up: true,
    hasKey: Boolean(process.env.MISTRAL_API_KEY),
    model: process.env.MISTRAL_MODEL || null
  });
}

