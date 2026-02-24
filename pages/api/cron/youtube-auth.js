// /pages/api/cron/youtube-auth.js
// Helper endpoint to obtain a YouTube OAuth2 refresh token.
//
// Usage:
//   1. GET  /api/cron/youtube-auth          → returns the authorization URL
//   2. Open the URL in your browser, consent, copy the "code" param
//   3. GET  /api/cron/youtube-auth?code=XXX  → exchanges the code for tokens
//   4. Copy the refresh_token and set it as YOUTUBE_REFRESH_TOKEN in Vercel
//
// Required env vars: YOUTUBE_OAUTH_CLIENT_ID, YOUTUBE_OAUTH_CLIENT_SECRET

import { google } from "googleapis";

const CLIENT_ID = process.env.YOUTUBE_OAUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.YOUTUBE_OAUTH_CLIENT_SECRET;

// "urn:ietf:wg:oauth:2.0:oob" is deprecated; use a simple redirect for manual copy.
// We use the "out of band" redirect so the code is shown in the browser.
const REDIRECT_URI = "urn:ietf:wg:oauth:2.0:oob";

const SCOPES = [
  "https://www.googleapis.com/auth/yt-analytics.readonly",
  "https://www.googleapis.com/auth/youtube.readonly",
];

export default async function handler(req, res) {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    return res.status(500).json({
      error: "YOUTUBE_OAUTH_CLIENT_ID and YOUTUBE_OAUTH_CLIENT_SECRET must be set in env.",
    });
  }

  const oauth2 = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

  // --- Step 2: Exchange authorization code for tokens ---
  const { code } = req.query;
  if (code) {
    try {
      const { tokens } = await oauth2.getToken(code);
      console.log("[YT-AUTH] Tokens received:", {
        access_token: tokens.access_token ? "present" : "missing",
        refresh_token: tokens.refresh_token ? "present" : "missing",
        expiry_date: tokens.expiry_date,
      });
      return res.status(200).json({
        message: "Success! Copy the refresh_token below and add it as YOUTUBE_REFRESH_TOKEN in Vercel.",
        refresh_token: tokens.refresh_token,
        access_token: tokens.access_token,
        expiry_date: tokens.expiry_date,
        warning: tokens.refresh_token
          ? null
          : "No refresh_token returned. You may need to revoke access at https://myaccount.google.com/permissions and re-authorize with prompt=consent.",
      });
    } catch (err) {
      console.error("[YT-AUTH] Token exchange failed:", err.message);
      return res.status(400).json({
        error: "Token exchange failed",
        details: err.message,
      });
    }
  }

  // --- Step 1: Generate authorization URL ---
  const authUrl = oauth2.generateAuthUrl({
    access_type: "offline",
    prompt: "consent", // forces refresh_token to be returned
    scope: SCOPES,
  });

  return res.status(200).json({
    message: "Open the URL below in your browser, authorize, then come back with the code.",
    auth_url: authUrl,
    next_step: "After authorizing, call: GET /api/cron/youtube-auth?code=PASTE_CODE_HERE",
  });
}
