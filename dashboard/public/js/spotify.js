// Spotify: the Web Playback SDK turns this browser into an actual Spotify
// Connect device (audio plays through the same PipeWire/Bluetooth pipeline
// as the Radio tab), while the now-playing info and Play/Pause/Next/Prev
// controls talk to Spotify's Web API directly and act on whichever device is
// currently active - so this also works as a remote for playback on your
// phone, not just for this Pi. Self-contained - imports nothing from the
// other view modules (keeps its own local formatMs/liveProgressMs rather
// than sharing format.js's copy, since nothing outside this module needs
// them).
let spotifyPlayer = null;
let spotifyDeviceId = null;
let spotifyAccessToken = null;
let latestSpotify = {
  linked: false, isPlaying: false, trackName: null, artistName: null,
  albumArt: null, deviceName: null, deviceId: null, itemType: null,
  currentlyPlayingType: null, volumePercent: null, progressMs: null, durationMs: null,
};
// Timestamp of the last time we got a real progressMs reading (from either
// the poll or the SDK) - lets the progress bar keep ticking smoothly between
// updates instead of only jumping once per poll/state-change.
let spotifyProgressCapturedAt = 0;
// Spotify's API sometimes omits episode metadata entirely from /me/player
// (device/is_playing still come through, just no name/art) - since we
// already know what episode was tapped, remember it and use it as a
// fallback display whenever the poll comes back without item data.
let spotifyLastStartedEpisode = null; // { name, image, showName }
// The 8-10s backend poll is fine for "what's playing on some other device",
// but it made track changes on THIS device look sluggish (audio switches
// instantly, the displayed name/art lagged behind by a full poll cycle).
// player_state_changed fires immediately whenever this device is the active
// one, so that's used instead whenever it's available - poll data is only
// the source of truth when this device isn't currently the one playing.
let spotifyLocalState = null; // { isPlaying, trackName, artistName, albumArt } | null
// Same staleness problem as track info, but for volume: without this,
// tapping +/- quickly read the same poll-cycle-old volumePercent each time
// and sent the same target repeatedly, so rapid taps looked like they
// weren't registering.
let spotifyLocalVolumePercent = null;

function effectiveSpotify() {
  const base = spotifyLocalState ? { ...latestSpotify, ...spotifyLocalState } : latestSpotify;
  return spotifyLocalVolumePercent != null ? { ...base, volumePercent: spotifyLocalVolumePercent } : base;
}
// Your playlists/podcasts, loaded once per session (lazily, the first time
// the tab has something to show them in) rather than every poll cycle -
// this is a browse action, not live status like everything else on /api/data.
let spotifyLibrary = { playlists: [], shows: [], loaded: false, loading: false };
let spotifySubTab = 'playing'; // 'playing' | 'playlists' | 'podcasts'
let spotifySelectedPlaylistId = null;
let spotifyPlaylistTracks = [];
let spotifySelectedShowId = null;
let spotifyEpisodes = [];

// The kiosk has no accessible devtools, so anything worth debugging also
// gets posted to the backend (visible via `journalctl -u dashboard.service`)
// in addition to the browser console (which still helps on a real desktop).
function logToServer(context, message, detail) {
  console.error(`[spotify:${context}]`, message, detail || '');
  fetch('/api/client-log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ context: `spotify:${context}`, message, detail }),
  }).catch(() => {});
}

async function getSpotifyToken() {
  try {
    const res = await fetch('/api/spotify/token');
    const data = await res.json();
    if (!data.linked) logToServer('token', 'not linked', JSON.stringify(data));
    spotifyAccessToken = data.accessToken || null;
  } catch (err) {
    logToServer('token', 'failed to fetch access token', err.message);
    spotifyAccessToken = null;
  }
  return spotifyAccessToken;
}

window.onSpotifyWebPlaybackSDKReady = () => {
  spotifyPlayer = new Spotify.Player({
    name: 'Raspy Dashboard',
    getOAuthToken: (cb) => getSpotifyToken().then((token) => cb(token || '')),
    volume: 0.5,
  });
  spotifyPlayer.addListener('ready', ({ device_id }) => {
    spotifyDeviceId = device_id;
    renderSpotifyTab();
  });
  spotifyPlayer.addListener('not_ready', () => {
    spotifyDeviceId = null;
  });
  spotifyPlayer.addListener('player_state_changed', (state) => {
    if (!state) {
      spotifyLocalState = null; // playback moved to a different device - fall back to poll data
      renderSpotifyTab();
      return;
    }
    const track = (state.track_window && state.track_window.current_track) || {};
    spotifyLocalState = {
      isPlaying: !state.paused,
      trackName: track.name || null,
      artistName: track.type === 'episode'
        ? (track.show && track.show.name) || (track.album && track.album.name) || null
        : (track.artists || []).map((a) => a.name).join(', ') || null,
      albumArt: (track.album && track.album.images && track.album.images[0] && track.album.images[0].url) || null,
      progressMs: state.position,
      durationMs: state.duration,
    };
    spotifyProgressCapturedAt = Date.now();
    renderSpotifyTab();
  });
  spotifyPlayer.addListener('initialization_error', ({ message }) => logToServer('sdk-init', message));
  spotifyPlayer.addListener('authentication_error', ({ message }) => logToServer('sdk-auth', message));
  spotifyPlayer.addListener('account_error', ({ message }) => logToServer('sdk-account (Premium required)', message));
  spotifyPlayer.connect();
};

async function spotifyApi(method, path, body) {
  if (!spotifyAccessToken) await getSpotifyToken();
  if (!spotifyAccessToken) {
    logToServer('api-call', `skipped ${method} ${path} - no access token`);
    return;
  }
  try {
    const res = await fetch(`https://api.spotify.com/v1/me/player${path}`, {
      method,
      headers: { Authorization: `Bearer ${spotifyAccessToken}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      logToServer('api-call', `${method} ${path} -> ${res.status} ${res.statusText}`, text.slice(0, 300));
    }
  } catch (err) {
    logToServer('api-call', `${method} ${path} threw`, err.message);
  }
}

function spotifyPlayPause() {
  spotifyApi('PUT', effectiveSpotify().isPlaying ? '/pause' : '/play');
}
function spotifyNext() {
  spotifyApi('POST', '/next');
}
function spotifyPrev() {
  spotifyApi('POST', '/previous');
}
function spotifyPlayHere() {
  if (!spotifyDeviceId) return;
  spotifyApi('PUT', '', { device_ids: [spotifyDeviceId], play: true });
}
function spotifyVolume(delta) {
  const current = effectiveSpotify().volumePercent != null ? effectiveSpotify().volumePercent : 50;
  const next = Math.max(0, Math.min(100, current + delta));
  spotifyLocalVolumePercent = next;
  renderSpotifyTab();
  spotifyApi('PUT', `/volume?volume_percent=${next}`);
}

async function spotifyFetch(path) {
  if (!spotifyAccessToken) await getSpotifyToken();
  if (!spotifyAccessToken) {
    logToServer('library-fetch', `skipped GET ${path} - no access token`);
    return null;
  }
  try {
    const res = await fetch(`https://api.spotify.com/v1${path}`, {
      headers: { Authorization: `Bearer ${spotifyAccessToken}` },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      logToServer('library-fetch', `GET ${path} -> ${res.status} ${res.statusText}`, text.slice(0, 300));
      return null;
    }
    return await res.json();
  } catch (err) {
    logToServer('library-fetch', `GET ${path} threw`, err.message);
    return null;
  }
}

async function loadSpotifyLibrary() {
  if (spotifyLibrary.loading || spotifyLibrary.loaded) return;
  spotifyLibrary.loading = true;
  const [playlistsRes, showsRes] = await Promise.all([
    spotifyFetch('/me/playlists?limit=30'),
    spotifyFetch('/me/shows?limit=30'),
  ]);
  const playlists = ((playlistsRes && playlistsRes.items) || []).filter(Boolean).map((p) => ({
    id: p.id,
    name: p.name,
    image: p.images && p.images[0] && p.images[0].url,
    uri: p.uri,
  }));
  const showEntries = ((showsRes && showsRes.items) || []).filter(Boolean);
  // Sorted by newest episode, not by follow date - so shows with fresh
  // content float to the top, like a podcast app inbox. Costs one extra
  // request per show (just the latest episode), done in parallel.
  const shows = await Promise.all(showEntries.map(async (entry) => {
    const s = entry.show;
    const epData = await spotifyFetch(`/shows/${s.id}/episodes?limit=1`);
    const latest = epData && epData.items && epData.items[0];
    return {
      id: s.id,
      name: s.name,
      publisher: s.publisher,
      image: s.images && s.images[0] && s.images[0].url,
      latestEpisodeDate: latest ? latest.release_date : null,
    };
  }));
  shows.sort((a, b) => (b.latestEpisodeDate || '').localeCompare(a.latestEpisodeDate || ''));
  spotifyLibrary = { playlists, shows, loaded: true, loading: false };
  renderSpotifyTab();
}

// Some Spotify-generated playlists (Daily Mix, Discover Weekly, Release
// Radar, etc.) return 403 on this endpoint for third-party apps regardless
// of scope - a Spotify-side restriction, not something we can fix. Track
// that distinctly from "still loading" so the UI doesn't hang forever.
let spotifyPlaylistTracksFailed = false;
let spotifyEpisodesFailed = false;

async function selectSpotifyPlaylist(id) {
  spotifySelectedPlaylistId = id;
  spotifyPlaylistTracks = [];
  spotifyPlaylistTracksFailed = false;
  renderSpotifyTab();
  const data = await spotifyFetch(`/playlists/${id}/tracks?limit=50`);
  spotifyPlaylistTracksFailed = !data;
  spotifyPlaylistTracks = ((data && data.items) || []).map((item) => item.track).filter(Boolean).map((t) => ({
    name: t.name,
    uri: t.uri,
    artistName: (t.artists || []).map((a) => a.name).join(', '),
    image: t.album && t.album.images && t.album.images[0] && t.album.images[0].url,
  }));
  renderSpotifyTab();
}

async function selectSpotifyShow(id) {
  spotifySelectedShowId = id;
  spotifyEpisodes = [];
  spotifyEpisodesFailed = false;
  renderSpotifyTab();
  const data = await spotifyFetch(`/shows/${id}/episodes?limit=30`);
  spotifyEpisodesFailed = !data;
  spotifyEpisodes = ((data && data.items) || []).filter(Boolean).map((e) => ({
    name: e.name,
    uri: e.uri,
    image: e.images && e.images[0] && e.images[0].url,
    releaseDate: e.release_date,
  }));
  renderSpotifyTab();
}

// Starts playback directly on this Pi's speaker, skipping the manual
// "Play on this speaker" transfer step entirely - that's the whole point of
// browsing playlists/podcasts from here instead of your phone. The Web
// Playback SDK's device only becomes ready a few seconds after the page
// loads, so a tap right after opening the tab retries quietly for a while
// instead of immediately complaining. Jumps to the Now Playing sub-tab once
// the call actually goes out, so starting something is always followed by
// seeing it play.
function spotifyPlayOnThisDevice(body, attempt) {
  attempt = attempt || 0;
  if (spotifyDeviceId) {
    spotifyApi('PUT', `/play?device_id=${spotifyDeviceId}`, body);
    spotifySubTab = 'playing';
    renderSpotifyTab();
    return;
  }
  if (attempt >= 10) {
    logToServer('play', 'gave up waiting for this device to become the Spotify Connect device');
    alert("Couldn't connect to Spotify on this device - try reloading the page.");
    return;
  }
  setTimeout(() => spotifyPlayOnThisDevice(body, attempt + 1), 500);
}
function spotifyPlayPlaylist(uri) {
  spotifyPlayOnThisDevice({ context_uri: uri });
}
function spotifyPlayEpisode(uri) {
  const episode = spotifyEpisodes.find((e) => e.uri === uri);
  const show = spotifyLibrary.shows.find((sh) => sh.id === spotifySelectedShowId);
  if (episode) {
    spotifyLastStartedEpisode = { name: episode.name, image: episode.image, showName: show ? show.name : null };
  }
  spotifyPlayOnThisDevice({ uris: [uri] });
}
function spotifyPlayTrackInPlaylist(playlistUri, trackUri) {
  spotifyPlayOnThisDevice({ context_uri: playlistUri, offset: { uri: trackUri } });
}

function spotifySplitItem(item, fallbackIcon) {
  const img = item.image
    ? `<img class="spotify-split-item-art" src="${item.image}" alt="">`
    : `<div class="spotify-split-item-art spotify-art-fallback">${fallbackIcon}</div>`;
  return `
    <div class="spotify-split-item${item.active ? ' active' : ''}" data-id="${item.id}">
      ${img}
      <div class="spotify-split-item-name">${item.name}</div>
    </div>`;
}

function spotifyEpisodeRow(item) {
  return `
    <div class="spotify-episode" data-uri="${item.uri}">
      ${item.image ? `<img class="spotify-episode-art" src="${item.image}" alt="">` : `<div class="spotify-episode-art spotify-art-fallback">${item.fallbackIcon}</div>`}
      <div class="spotify-episode-info">
        <div class="spotify-episode-name">${item.name}</div>
        <div class="spotify-tile-sub">${item.sub || ''}</div>
      </div>
      <div class="spotify-episode-play">▶</div>
    </div>`;
}

function formatMs(ms) {
  if (ms == null || !Number.isFinite(ms)) return '0:00';
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

// Ticks the position forward between real updates (from the poll or the SDK)
// so the bar moves smoothly instead of only jumping once every few seconds.
function liveProgressMs(s) {
  if (s.progressMs == null) return null;
  const elapsed = s.isPlaying ? Date.now() - spotifyProgressCapturedAt : 0;
  return Math.min(s.progressMs + Math.max(elapsed, 0), s.durationMs != null ? s.durationMs : Infinity);
}

function renderSpotifyPlayingTab() {
  const s = effectiveSpotify();
  const playingHere = spotifyDeviceId && s.deviceId === spotifyDeviceId;
  // Fall back to the episode we know we started, if Spotify didn't send
  // back item metadata for it (see refreshSpotify's currentlyPlayingType).
  const usingFallback = !s.trackName && s.currentlyPlayingType === 'episode' && spotifyLastStartedEpisode;
  const trackName = s.trackName || (usingFallback ? spotifyLastStartedEpisode.name : null);
  const artistName = s.artistName || (usingFallback ? spotifyLastStartedEpisode.showName : null);
  const albumArt = s.albumArt || (usingFallback ? spotifyLastStartedEpisode.image : null);
  const art = albumArt
    ? `<img class="spotify-playing-art" src="${albumArt}" alt="">`
    : '<div class="spotify-playing-art spotify-art-fallback">🎵</div>';
  const position = liveProgressMs(s);
  const pct = position != null && s.durationMs ? Math.min(100, (position / s.durationMs) * 100) : 0;
  return `
    <div class="spotify-playing-tab">
      <div class="spotify-playing-art-col">${art}</div>
      <div class="spotify-playing-info-col">
        <div class="spotify-playing-track">${trackName || 'Nothing playing'}</div>
        <div class="spotify-playing-artist">${artistName || ''}</div>
        ${s.deviceName ? `<div class="spotify-device">${playingHere ? 'Playing here' : `Playing on: ${s.deviceName}`}</div>` : ''}
        ${!playingHere && spotifyDeviceId && trackName ? '<button id="spotify-play-here" class="spotify-btn-primary">▶ Play here instead</button>' : ''}
        ${position != null ? `
        <div class="spotify-progress">
          <span id="spotify-progress-current" class="spotify-progress-time">${formatMs(position)}</span>
          <div class="spotify-progress-track"><div id="spotify-progress-fill" class="spotify-progress-fill" style="width:${pct}%"></div></div>
          <span class="spotify-progress-time">${formatMs(s.durationMs)}</span>
        </div>` : ''}
      <div class="spotify-controls">
        <button id="spotify-prev" class="radio-btn" title="Previous">⏮</button>
        <button id="spotify-playpause" class="radio-btn" title="Play/Pause">${s.isPlaying ? '⏸' : '▶'}</button>
        <button id="spotify-next" class="radio-btn" title="Next">⏭</button>
      </div>
      <div class="spotify-volume">
        <button id="spotify-vol-down" class="radio-btn" title="Volume down">−</button>
        <span id="spotify-vol-pct">${s.volumePercent != null ? `${s.volumePercent}%` : '—'}</span>
        <button id="spotify-vol-up" class="radio-btn" title="Volume up">+</button>
      </div>
      </div>
    </div>`;
}

function renderSpotifyPlaylistsTab() {
  const sidebar = spotifyLibrary.playlists.length
    ? spotifyLibrary.playlists.map((p) => spotifySplitItem({ ...p, active: p.id === spotifySelectedPlaylistId }, '🎵')).join('')
    : `<p class="spotify-lib-empty">${spotifyLibrary.loading ? 'Loading…' : 'No playlists found.'}</p>`;

  let main = '<p class="spotify-lib-empty">Select a playlist to see its tracks.</p>';
  if (spotifySelectedPlaylistId) {
    const playlist = spotifyLibrary.playlists.find((p) => p.id === spotifySelectedPlaylistId);
    const tracks = spotifyPlaylistTracks.length
      ? spotifyPlaylistTracks.map((t) => spotifyEpisodeRow({ ...t, sub: t.artistName, fallbackIcon: '🎵' })).join('')
      : spotifyPlaylistTracksFailed
        ? "<p class=\"spotify-lib-empty\">Can't load this playlist's tracks - Spotify blocks this for some auto-generated playlists (Daily Mix, Discover Weekly, etc.). Play All still works.</p>"
        : '<p class="spotify-lib-empty">Loading tracks…</p>';
    main = `
      <div class="spotify-lib-header">
        <div class="spotify-lib-title">${playlist ? playlist.name : ''}</div>
        <button id="spotify-play-all" class="spotify-btn-primary" data-uri="${playlist ? playlist.uri : ''}">▶ Play All</button>
      </div>
      <div class="spotify-episode-list">${tracks}</div>`;
  }

  return `<div class="spotify-split"><div class="spotify-split-sidebar">${sidebar}</div><div class="spotify-split-main">${main}</div></div>`;
}

function renderSpotifyPodcastsTab() {
  const sidebar = spotifyLibrary.shows.length
    ? spotifyLibrary.shows.map((sh) => spotifySplitItem({ ...sh, active: sh.id === spotifySelectedShowId }, '🎙️')).join('')
    : `<p class="spotify-lib-empty">${spotifyLibrary.loading ? 'Loading…' : 'No followed podcasts found.'}</p>`;

  let main = '<p class="spotify-lib-empty">Select a podcast to see its episodes.</p>';
  if (spotifySelectedShowId) {
    const show = spotifyLibrary.shows.find((sh) => sh.id === spotifySelectedShowId);
    const episodes = spotifyEpisodes.length
      ? spotifyEpisodes.map((e) => spotifyEpisodeRow({ ...e, sub: e.releaseDate, fallbackIcon: '🎙️' })).join('')
      : spotifyEpisodesFailed
        ? '<p class="spotify-lib-empty">Could not load episodes for this show.</p>'
        : '<p class="spotify-lib-empty">Loading episodes…</p>';
    main = `
      <div class="spotify-lib-header">
        <div class="spotify-lib-title">${show ? show.name : ''}</div>
      </div>
      <div class="spotify-episode-list">${episodes}</div>`;
  }

  return `<div class="spotify-split"><div class="spotify-split-sidebar">${sidebar}</div><div class="spotify-split-main">${main}</div></div>`;
}

function spotifySubNav() {
  const tabs = [
    ['playing', 'Now Playing'],
    ['playlists', 'Playlists'],
    ['podcasts', 'Podcasts'],
  ];
  return `<div class="spotify-subnav">${tabs.map(([id, label]) =>
    `<button class="spotify-subnav-btn${spotifySubTab === id ? ' active' : ''}" data-subtab="${id}">${label}</button>`
  ).join('')}</div>`;
}

function updateSpotifyHeaderBadge() {
  const badge = document.getElementById('spotify-badge');
  const s = effectiveSpotify();
  const usingFallback = !s.trackName && s.currentlyPlayingType === 'episode' && spotifyLastStartedEpisode;
  const trackName = s.trackName || (usingFallback ? spotifyLastStartedEpisode.name : null);
  if (trackName) {
    badge.classList.remove('hidden');
    document.getElementById('spotify-header-track').textContent = trackName;
    document.getElementById('spotify-header-playpause').textContent = s.isPlaying ? '⏸' : '▶';
    document.getElementById('spotify-header-vol-pct').textContent = s.volumePercent != null ? `${s.volumePercent}%` : '—';
  } else {
    badge.classList.add('hidden');
  }
}

export function renderSpotifyTab() {
  updateSpotifyHeaderBadge();
  const view = document.getElementById('view-spotify');
  if (!view) return;
  const s = latestSpotify;
  if (!s.linked) {
    view.innerHTML = `
      <div class="spotify-connect">
        <div class="spotify-connect-icon">🎧</div>
        <p>Connect your Spotify Premium account to listen here.</p>
        <a class="spotify-btn-primary" href="/api/spotify/login">Connect Spotify</a>
      </div>`;
    return;
  }

  if (!spotifyLibrary.loaded && !spotifyLibrary.loading) loadSpotifyLibrary();

  let body;
  if (spotifySubTab === 'playlists') body = renderSpotifyPlaylistsTab();
  else if (spotifySubTab === 'podcasts') body = renderSpotifyPodcastsTab();
  else body = renderSpotifyPlayingTab();

  view.innerHTML = `${spotifySubNav()}<div class="spotify-subtab-body">${body}</div>`;
}

// Called from main.js's poll loop instead of assigning latestSpotify/
// spotifyProgressCapturedAt/spotifyLocalVolumePercent directly - imported
// bindings can't be reassigned from outside this module.
export function ingestSpotifyPoll(data) {
  latestSpotify = data || latestSpotify;
  if (!spotifyLocalState) spotifyProgressCapturedAt = Date.now();
  spotifyLocalVolumePercent = null; // real data has arrived, trust it over our optimistic guess
  renderSpotifyTab();
}

// Wires up all of Spotify's own DOM listeners plus the progress-bar ticker -
// called once from main.js at startup. Bundled here (rather than split
// across main.js) because the sub-tab click handler needs to reassign
// spotifySubTab, an imported binding would make read-only from outside this
// module.
export function initSpotify() {
  document.getElementById('view-spotify').addEventListener('click', (e) => {
    if (e.target.id === 'spotify-play-here') return spotifyPlayHere();
    if (e.target.id === 'spotify-playpause') return spotifyPlayPause();
    if (e.target.id === 'spotify-next') return spotifyNext();
    if (e.target.id === 'spotify-prev') return spotifyPrev();
    if (e.target.id === 'spotify-vol-down') return spotifyVolume(-10);
    if (e.target.id === 'spotify-vol-up') return spotifyVolume(10);
    if (e.target.id === 'spotify-play-all') return spotifyPlayPlaylist(e.target.dataset.uri);

    const subtabBtn = e.target.closest('.spotify-subnav-btn');
    if (subtabBtn) {
      spotifySubTab = subtabBtn.dataset.subtab;
      return renderSpotifyTab();
    }

    const episode = e.target.closest('.spotify-episode');
    if (episode) {
      return spotifySubTab === 'playlists'
        ? spotifyPlayTrackInPlaylist(spotifyLibrary.playlists.find((p) => p.id === spotifySelectedPlaylistId).uri, episode.dataset.uri)
        : spotifyPlayEpisode(episode.dataset.uri);
    }

    const item = e.target.closest('.spotify-split-item');
    if (item) {
      return spotifySubTab === 'playlists' ? selectSpotifyPlaylist(item.dataset.id) : selectSpotifyShow(item.dataset.id);
    }
  });
  document.getElementById('spotify-header-playpause').addEventListener('click', spotifyPlayPause);
  document.getElementById('spotify-header-vol-down').addEventListener('click', () => spotifyVolume(-10));
  document.getElementById('spotify-header-vol-up').addEventListener('click', () => spotifyVolume(10));

  renderSpotifyTab();

  // Updates just the progress bar fill/time directly (not a full re-render,
  // which would be wasteful and could interrupt a tap) so it visibly ticks
  // forward every second instead of only jumping on each poll/state-change.
  setInterval(() => {
    if (spotifySubTab !== 'playing') return;
    const fill = document.getElementById('spotify-progress-fill');
    const current = document.getElementById('spotify-progress-current');
    if (!fill || !current) return;
    const s = effectiveSpotify();
    const position = liveProgressMs(s);
    if (position == null) return;
    current.textContent = formatMs(position);
    fill.style.width = `${s.durationMs ? Math.min(100, (position / s.durationMs) * 100) : 0}%`;
  }, 1000);
}
