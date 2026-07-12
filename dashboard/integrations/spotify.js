// Spotify OAuth + now-playing polling. A one-time interactive login (via
// GET /api/spotify/login, done once from any browser on the LAN) gets a
// refresh token that's persisted to disk and silently renewed after that -
// the dashboard never needs the user's Spotify password again after the
// first login.
//
// refreshSpotify() reads whatever is currently playing on the user's Spotify
// account, on whichever device is active - not necessarily this Pi (could be
// their phone). This is what makes the dashboard a "remote": the frontend's
// Play/Pause/Next/Prev calls act on the currently active device regardless
// of where this poll shows it playing, and separately offer to *transfer*
// playback to this Pi's speaker via the Web Playback SDK device it
// registers client-side.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { fetchJson } = require('../lib/http');
const { logOnce } = require('../lib/log');
const { requireApiKey } = require('../lib/auth');

const SPOTIFY_TOKEN_PATH = path.join(__dirname, '..', 'data', 'spotify-token.json');

module.exports = function createSpotifyIntegration(config) {
  let spotifyToken = { accessToken: null, refreshToken: null, expiresAt: 0 };
  try {
    const saved = JSON.parse(fs.readFileSync(SPOTIFY_TOKEN_PATH, 'utf8'));
    spotifyToken.refreshToken = saved.refreshToken || null;
  } catch {
    // not linked yet
  }
  function saveSpotifyToken() {
    try {
      fs.mkdirSync(path.dirname(SPOTIFY_TOKEN_PATH), { recursive: true });
      fs.writeFileSync(SPOTIFY_TOKEN_PATH, JSON.stringify({ refreshToken: spotifyToken.refreshToken }));
    } catch (err) {
      console.error('[spotify] failed to persist token:', err.message);
    }
  }

  // Returns a live access token, refreshing it first if it's missing/
  // expiring. Only the refresh token is persisted to disk - access tokens
  // are short-lived (1hr) and cheap to re-derive, so keeping them in memory
  // only is enough.
  async function getSpotifyAccessToken() {
    const { clientId, clientSecret } = config.spotify || {};
    if (!spotifyToken.refreshToken || !clientId || !clientSecret) return null;
    if (spotifyToken.accessToken && Date.now() < spotifyToken.expiresAt - 30000) return spotifyToken.accessToken;
    try {
      const data = await fetchJson('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        },
        body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: spotifyToken.refreshToken }),
      });
      spotifyToken.accessToken = data.access_token;
      spotifyToken.expiresAt = Date.now() + data.expires_in * 1000;
      if (data.refresh_token) {
        spotifyToken.refreshToken = data.refresh_token; // Spotify rotates this occasionally
        saveSpotifyToken();
      }
      return spotifyToken.accessToken;
    } catch (err) {
      // invalid_grant means the refresh token itself is dead (revoked from
      // Spotify's side, or expired from a year of inactivity) - retrying
      // with the same token will never succeed, so forget it and fall back
      // to the "not linked" state instead of silently failing forever.
      if (/invalid_grant/.test(err.message)) {
        spotifyToken = { accessToken: null, refreshToken: null, expiresAt: 0 };
        saveSpotifyToken();
      }
      throw err;
    }
  }

  async function refreshSpotify() {
    const empty = {
      isPlaying: false, trackName: null, artistName: null, albumArt: null,
      deviceName: null, deviceId: null, itemType: null, currentlyPlayingType: null, volumePercent: null,
      progressMs: null, durationMs: null,
    };
    if (!config.spotify || !config.spotify.clientId) {
      return { status: 'warning', linked: false, ...empty, error: 'not configured' };
    }
    try {
      const accessToken = await getSpotifyAccessToken();
      if (!accessToken) {
        return { status: 'warning', linked: false, ...empty, error: 'not linked - visit /api/spotify/login' };
      }
      const res = await fetch('https://api.spotify.com/v1/me/player', { headers: { Authorization: `Bearer ${accessToken}` } });
      if (res.status === 204 || res.status === 202) {
        logOnce('spotify', null);
        return { status: 'good', linked: true, ...empty };
      }
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const data = await res.json();
      const item = data.item || {};
      const isEpisode = item.type === 'episode';
      logOnce('spotify', null);
      return {
        status: 'good',
        linked: true,
        isPlaying: !!data.is_playing,
        trackName: item.name || null,
        artistName: isEpisode
          ? (item.show && item.show.name) || null
          : (item.artists || []).map((a) => a.name).join(', ') || null,
        albumArt: (item.images && item.images[0] && item.images[0].url)
          || (item.album && item.album.images && item.album.images[0] && item.album.images[0].url)
          || null,
        deviceName: (data.device && data.device.name) || null,
        deviceId: (data.device && data.device.id) || null,
        itemType: item.type || null,
        // Spotify sometimes omits `item` entirely for podcast episodes (a
        // known API gap - device/is_playing still come through fine), so
        // this top-level field is the only reliable "an episode is playing"
        // signal in that case. The frontend falls back to metadata it
        // already has from browsing (the episode you tapped) when this
        // happens.
        currentlyPlayingType: data.currently_playing_type || null,
        volumePercent: (data.device && data.device.volume_percent) != null ? data.device.volume_percent : null,
        progressMs: data.progress_ms != null ? data.progress_ms : null,
        durationMs: item.duration_ms != null ? item.duration_ms : null,
        error: null,
      };
    } catch (err) {
      logOnce('spotify', err.message);
      return { status: 'warning', linked: !!spotifyToken.refreshToken, ...empty, error: err.message };
    }
  }

  // Spotify OAuth: visit /api/spotify/login once from any browser on the LAN
  // (easier from a phone/laptop than typing your password on the
  // touchscreen) to grant access; the refresh token this gets is persisted
  // to disk, so it's a one-time step. Not gated by requireApiKey - login is
  // meant to be clicked directly in a browser, and it's harmless to expose
  // (it only redirects to Spotify's own login page; nothing sensitive
  // happens until a real Spotify auth code comes back to /callback with a
  // matching state).
  let spotifyAuthState = null;
  const router = express.Router();

  router.get('/api/spotify/login', (req, res) => {
    const { clientId, redirectUri } = config.spotify || {};
    if (!clientId || !redirectUri) {
      return res.status(503).send('Spotify not configured - add clientId/clientSecret/redirectUri under "spotify" in config.json.');
    }
    spotifyAuthState = crypto.randomBytes(16).toString('hex');
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      scope: 'streaming user-read-email user-read-private user-read-playback-state user-modify-playback-state '
        + 'playlist-read-private playlist-read-collaborative user-library-read',
      redirect_uri: redirectUri,
      state: spotifyAuthState,
    });
    res.redirect(`https://accounts.spotify.com/authorize?${params}`);
  });

  router.get('/api/spotify/callback', async (req, res) => {
    const { clientId, clientSecret, redirectUri } = config.spotify || {};
    const { code, state, error } = req.query;
    if (error) return res.status(400).send(`Spotify authorization failed: ${error}`);
    if (!state || state !== spotifyAuthState) {
      return res.status(400).send('Invalid or expired login attempt - go back to the dashboard and try connecting again.');
    }
    spotifyAuthState = null;
    try {
      const data = await fetchJson('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        },
        body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri }),
      });
      spotifyToken = {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: Date.now() + data.expires_in * 1000,
      };
      saveSpotifyToken();
      res.redirect('/');
    } catch (err) {
      res.status(502).send(`Failed to complete Spotify login: ${err.message}`);
    }
  });

  // The frontend needs a raw access token twice: once for the Web Playback
  // SDK's getOAuthToken callback, and again to call Spotify's Web API
  // directly (play/pause/transfer) without round-tripping through this
  // backend.
  router.get('/api/spotify/token', requireApiKey, async (req, res) => {
    try {
      const accessToken = await getSpotifyAccessToken();
      res.json({ linked: !!accessToken, accessToken: accessToken || null });
    } catch (err) {
      res.status(502).json({ linked: false, error: err.message });
    }
  });

  return { refreshSpotify, router };
};
