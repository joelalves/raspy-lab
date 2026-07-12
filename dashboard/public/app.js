const POLL_MS = 8000;

// Portuguese radio stations - direct MP3/AAC streams only (not .m3u8/HLS,
// which a plain <audio> element can't play in Chromium without extra JS).
// Each was verified with a real request confirming an audio/* content-type
// before being added here.
// Logo URLs sourced from radio-browser.info's verified station database
// (matched by exact stream URL where possible) and each confirmed with a
// real request returning an image/* content-type before being added here.
const RADIO_STATIONS = [
  { id: 'comercial', name: 'Rádio Comercial', url: 'https://stream-icy.bauermedia.pt/comercial.mp3', logo: 'https://static2.mytuner.mobi/media/tvos_radios/drkZNBUn6W.png' },
  { id: 'rfm', name: 'RFM', url: 'https://23603.live.streamtheworld.com/RFMAAC.aac', logo: 'https://rfmsite2023-images.azureedge.net/icons/touch-icon-iphone-retina.png' },
  { id: 'megahits', name: 'Mega Hits', url: 'http://22333.live.streamtheworld.com:3690/MEGA_HITS_SC', logo: 'https://cdn-radiotime-logos.tunein.com/s6745q.png' },
  { id: 'antena3', name: 'Antena 3', url: 'https://radiocast.rtp.pt/antena380a.mp3', logo: 'https://cdn-images.rtp.pt/common/img/channels/logos/color/horizontal/1-143718101410.png?q=10&v=3&w=275' },
  { id: 'm80', name: 'M80', url: 'http://stream-icy.bauermedia.pt/m80.mp3', logo: 'https://m80.pt/favicon.ico' },
  { id: 'antena1', name: 'Antena 1', url: 'https://radiocast.rtp.pt/antena180a.mp3', logo: 'https://cdn-images.rtp.pt/common/img/channels/logos/color/horizontal/5-563718101410.png?q=10&v=3&w=275' },
  { id: 'renascenca', name: 'Rádio Renascença', url: 'http://22653.live.streamtheworld.com/RADIO_RENASCENCA_SC', logo: 'https://rrsite-images.azureedge.net/favicon/apple-touch-icon.png' },
  { id: 'cidadefm', name: 'Cidade FM', url: 'https://stream-icy.bauermedia.pt/cidade.mp3', logo: 'https://cidade.fm/favicon.ico' },
  { id: 'smoothfm', name: 'Smooth FM', url: 'https://stream-icy.bauermedia.pt/smooth.aac', logo: 'https://smoothfm.pt/favicon.ico' },
  { id: 'tsf', name: 'TSF Rádio Notícias', url: 'https://tsfdirecto.tsf.pt/tsfdirecto.mp3', logo: 'https://www.tsf.pt/favicon.ico' },
];

const RADIO_VOLUME_KEY = 'raspy-dashboard-radio-volume';
const radioAudio = document.getElementById('radio-audio');
let currentRadioStation = null;
let latestBluetooth = { connected: false, name: null, batteryPct: null };

function getStoredVolume() {
  const v = parseFloat(localStorage.getItem(RADIO_VOLUME_KEY));
  return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.7;
}

function playStation(station) {
  if (currentRadioStation && currentRadioStation.id === station.id) {
    stopRadio();
    return;
  }
  currentRadioStation = station;
  radioAudio.src = station.url;
  radioAudio.volume = getStoredVolume();
  radioAudio.muted = false;
  radioAudio.play().catch((err) => {
    currentRadioStation = null;
    updateRadioUI();
    alert(`Couldn't play ${station.name}: ${err.message}`);
  });
  updateRadioUI();
}

function stopRadio() {
  radioAudio.pause();
  radioAudio.removeAttribute('src');
  radioAudio.load();
  currentRadioStation = null;
  updateRadioUI();
}

function changeVolume(delta) {
  const next = Math.max(0, Math.min(1, radioAudio.volume + delta));
  radioAudio.volume = next;
  radioAudio.muted = false;
  localStorage.setItem(RADIO_VOLUME_KEY, next);
  updateRadioUI();
}

function toggleMute() {
  radioAudio.muted = !radioAudio.muted;
  updateRadioUI();
}

function batteryLabel() {
  return latestBluetooth.connected && latestBluetooth.batteryPct != null ? `🔋${latestBluetooth.batteryPct}%` : null;
}

function updateRadioUI() {
  const badge = document.getElementById('radio-badge');
  const battery = document.getElementById('radio-battery');
  if (currentRadioStation) {
    badge.classList.remove('hidden');
    document.getElementById('radio-station-name').textContent = currentRadioStation.name;
    document.getElementById('radio-vol-pct').textContent = `${Math.round(radioAudio.volume * 100)}%`;
    document.getElementById('radio-mute-btn').textContent = radioAudio.muted ? '🔇' : '🔊';
    const label = batteryLabel();
    battery.textContent = label || '';
    battery.classList.toggle('hidden', !label);
  } else {
    badge.classList.add('hidden');
  }
  renderRadioTab();
  const overviewCard = document.getElementById('radio-overview-card');
  if (overviewCard) overviewCard.outerHTML = renderRadioOverviewCard();
}

function stationLogoImg(station, className) {
  return `<img class="${className}" src="${station.logo}" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'${className} ${className}-fallback',textContent:'📻'}))">`;
}

function renderRadioOverviewCard() {
  const label = currentRadioStation ? currentRadioStation.name : 'Tap to browse stations';
  const icon = currentRadioStation ? stationLogoImg(currentRadioStation, 'woc-icon-img') : '<div class="woc-icon">📻</div>';
  return `
    <div class="stat-card weather-overview-card" data-jump="radio" id="radio-overview-card">
      <div class="stat-title">Radio</div>
      ${icon}
      <div class="woc-label">${label}</div>
      ${currentRadioStation ? `<div class="woc-details"><span>${radioAudio.muted ? '🔇' : '🔊'} ${Math.round(radioAudio.volume * 100)}%</span>${batteryLabel() ? `<span>${batteryLabel()}</span>` : ''}</div>` : ''}
    </div>`;
}

function renderRadioTab() {
  const view = document.getElementById('view-radio');
  if (!view) return;
  view.innerHTML = RADIO_STATIONS.map((s) => {
    const playing = currentRadioStation && currentRadioStation.id === s.id;
    return `
      <div class="radio-station-card${playing ? ' playing' : ''}" data-station-id="${s.id}">
        ${stationLogoImg(s, 'rsc-icon-img')}
        <div class="rsc-name">${s.name}</div>
        ${playing ? '<div class="rsc-status">▶ Playing</div>' : ''}
      </div>`;
  }).join('');
}

// Spotify: the Web Playback SDK turns this browser into an actual Spotify
// Connect device (audio plays through the same PipeWire/Bluetooth pipeline
// as the Radio tab), while the now-playing info and Play/Pause/Next/Prev
// controls talk to Spotify's Web API directly and act on whichever device is
// currently active - so this also works as a remote for playback on your
// phone, not just for this Pi.
let spotifyPlayer = null;
let spotifyDeviceId = null;
let spotifyAccessToken = null;
let latestSpotify = {
  linked: false, isPlaying: false, trackName: null, artistName: null,
  albumArt: null, deviceName: null, deviceId: null, itemType: null, volumePercent: null,
};
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
  spotifyApi('PUT', latestSpotify.isPlaying ? '/pause' : '/play');
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
  const current = latestSpotify.volumePercent != null ? latestSpotify.volumePercent : 50;
  const next = Math.max(0, Math.min(100, current + delta));
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

async function selectSpotifyPlaylist(id) {
  spotifySelectedPlaylistId = id;
  spotifyPlaylistTracks = [];
  renderSpotifyTab();
  const data = await spotifyFetch(`/playlists/${id}/tracks?limit=50`);
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
  renderSpotifyTab();
  const data = await spotifyFetch(`/shows/${id}/episodes?limit=30`);
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

function renderSpotifyPlayingTab() {
  const s = latestSpotify;
  const playingHere = spotifyDeviceId && s.deviceId === spotifyDeviceId;
  const art = s.albumArt
    ? `<img class="spotify-playing-art" src="${s.albumArt}" alt="">`
    : '<div class="spotify-playing-art spotify-art-fallback">🎵</div>';
  return `
    <div class="spotify-playing-tab">
      ${art}
      <div class="spotify-playing-track">${s.trackName || 'Nothing playing'}</div>
      <div class="spotify-playing-artist">${s.artistName || ''}</div>
      ${s.deviceName ? `<div class="spotify-device">${playingHere ? 'Playing here' : `Playing on: ${s.deviceName}`}</div>` : ''}
      ${!playingHere && spotifyDeviceId && s.trackName ? '<button id="spotify-play-here" class="spotify-btn-primary">▶ Play here instead</button>' : ''}
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
  const s = latestSpotify;
  if (s.trackName) {
    badge.classList.remove('hidden');
    document.getElementById('spotify-header-track').textContent = s.trackName;
    document.getElementById('spotify-header-playpause').textContent = s.isPlaying ? '⏸' : '▶';
    document.getElementById('spotify-header-vol-pct').textContent = s.volumePercent != null ? `${s.volumePercent}%` : '—';
  } else {
    badge.classList.add('hidden');
  }
}

function renderSpotifyTab() {
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

function formatBytes(bytes) {
  if (!bytes) return '0 MB';
  const mb = bytes / (1024 * 1024);
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(0)} MB`;
}

function formatDuration(ms) {
  if (!ms) return '—';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

function formatAgo(timestamp) {
  if (!timestamp) return '—';
  const diffMin = Math.round((Date.now() - timestamp) / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  return `${Math.round(diffH / 24)}d ago`;
}

function card(name, meta, status) {
  return `<div class="card"><span class="dot ${status}"></span><span class="name">${name}</span><span class="meta">${meta}</span></div>`;
}

function formatUptime(seconds) {
  if (!seconds && seconds !== 0) return 'n/a';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function pctStatus(p) {
  if (p == null) return '';
  if (p >= 90) return 'critical';
  if (p >= 75) return 'warning';
  return '';
}

function tempStatus(c) {
  if (c == null) return '';
  if (c >= 75) return 'critical';
  if (c >= 65) return 'warning';
  return '';
}

function statItem(label, value, statusCls, wide, percent) {
  const bar = percent == null ? '' : `<div class="stat-bar-track"><div class="stat-bar-fill ${statusCls || ''}" style="width:${Math.max(0, Math.min(100, percent))}%"></div></div>`;
  return `<div class="stat-item${wide ? ' wide' : ''}"><span class="stat-label">${label}</span><span class="stat-value ${statusCls || ''}">${value}</span>${bar}</div>`;
}

function renderSystemCard(title, sys) {
  if (!sys) {
    return `<div class="stat-card"><div class="stat-title">${title}</div><div class="empty">unavailable</div></div>`;
  }
  const tempVal = sys.cpuTempC != null ? `${sys.cpuTempC}°C` : 'n/a';
  const diskVal = sys.disk ? `${sys.disk.percent}%` : 'n/a';
  return `
    <div class="stat-card">
      <div class="stat-title">${title}</div>
      <div class="stat-grid">
        ${statItem('Host', sys.hostname, '', true)}
        ${statItem('Model', sys.model || 'n/a', '', true)}
        ${statItem('OS', sys.osName || 'n/a', '', true)}
        ${statItem('CPU temp', tempVal, tempStatus(sys.cpuTempC), false, sys.cpuTempC != null ? (sys.cpuTempC / 90) * 100 : null)}
        ${statItem('Load (1m)', sys.loadAvg[0].toFixed(2))}
        ${statItem('Memory', `${sys.memory.percent}%`, pctStatus(sys.memory.percent), false, sys.memory.percent)}
        ${statItem('Disk', diskVal, sys.disk ? pctStatus(sys.disk.percent) : '', false, sys.disk ? sys.disk.percent : null)}
        ${statItem('Uptime', formatUptime(sys.uptimeSeconds))}
      </div>
    </div>`;
}

function quickTile(view, title, meta, status) {
  return `<div class="card quick-tile" data-jump="${view}"><span class="dot ${status}"></span><span class="name">${title}</span><span class="meta">${meta}</span></div>`;
}

function formatCo2(grams) {
  return grams >= 1000 ? `${(grams / 1000).toFixed(2)} kg` : `${Math.round(grams)} g`;
}

// A stat-card variant for Overview: status dot in the title, then a small
// grid of labeled values below - unlike plain card()/quickTile(), long
// summary text here has its own row instead of fighting the title for space.
function statTile(view, title, status, itemsHtml) {
  const jumpAttr = view ? ` data-jump="${view}"` : '';
  const clickableCls = view ? ' quick-tile' : '';
  return `
    <div class="stat-card overview-tile${clickableCls}"${jumpAttr}>
      <div class="stat-title"><span class="dot ${status}"></span>${title}</div>
      <div class="stat-grid">${itemsHtml}</div>
    </div>`;
}

function renderWeatherOverviewCard(weather) {
  const today = weather.days[0];
  if (!today) {
    return `<div class="stat-card weather-overview-card" data-jump="weather"><div class="stat-title">Weather</div><div class="empty">${weather.error || 'unavailable'}</div></div>`;
  }
  return `
    <div class="stat-card weather-overview-card" data-jump="weather">
      <div class="stat-title">Weather</div>
      <div class="woc-icon" title="${today.label}">${today.icon}</div>
      <div class="woc-label">${today.label}</div>
      <div class="woc-temps">${today.tempMax}° <span class="min">${today.tempMin}°</span></div>
      <div class="woc-details">
        <span>💧 ${today.precipProbability ?? 0}%</span>
        <span>💨 ${today.windSpeedKmh} km/h</span>
        <span>☀️ UV ${today.uvIndex}</span>
      </div>
    </div>`;
}

function renderOverview(data) {
  const docker = data.docker;
  const dockerTile = statTile('docker', 'Docker', docker.status, statItem('Containers', docker.summary, '', true));

  const pg = data.postgres;
  const pgTile = statTile(
    null,
    'PostgreSQL',
    pg.status,
    pg.status === 'good'
      ? statItem('Connections', pg.connections) + statItem('DB size', formatBytes(pg.databaseSizeBytes)) + statItem('Version', pg.version, '', true)
      : statItem('Status', pg.error || 'unreachable', pg.status, true)
  );

  const ph = data.pihole;
  const phTile = statTile(
    'pihole',
    'Pi-hole',
    ph.status,
    ph.percentBlocked != null
      ? statItem('Status', ph.enabled ? 'Enabled' : 'Disabled', ph.enabled ? '' : 'warning')
        + statItem('Blocked', `${ph.percentBlocked}%`)
        + statItem('Queries today', ph.queriesToday.toLocaleString(), '', true)
      : statItem('Status', ph.error || 'unreachable', ph.status, true)
  );

  const sh = data.shelly;
  const shTile = statTile(
    'shelly',
    'Shelly',
    sh.status,
    sh.currentPowerW != null
      ? statItem('Power', `${sh.currentPowerW} W`, sh.overpower ? 'critical' : '')
        + statItem('Today', `${(sh.todayConsumedWh / 1000).toFixed(2)} kWh`)
        + statItem('Today CO₂', formatCo2(sh.todayCo2Grams), '', true)
      : statItem('Status', sh.error || 'unreachable', sh.status, true)
  );

  return renderWeatherOverviewCard(data.weather) + renderRadioOverviewCard() + shTile + phTile + pgTile + dockerTile;
}

function renderSystemTab(data) {
  const ov = data.overview;
  return renderSystemCard('Server Pi', ov.serverSystem) + renderSystemCard('This Pi (dashboard)', ov.dashboardSystem);
}

function renderDocker(section) {
  if (section.error) return `<div class="error-msg">${section.error}</div>`;
  if (!section.containers.length) return `<div class="empty">No containers found.</div>`;
  return section.containers
    .map((c) => {
      const meta = c.state === 'running'
        ? `CPU ${c.cpuPercent}% · Mem ${c.memPercent}% (${formatBytes(c.memUsage)})`
        : c.state;
      // Bottom strip shows whichever of CPU/mem is higher, so a hot container
      // is visible at a glance without reading the numbers.
      const util = c.state === 'running' ? Math.max(c.cpuPercent, c.memPercent) : 0;
      const utilBar = c.state === 'running'
        ? `<div class="card-util-bar"><div class="card-util-bar-fill ${pctStatus(util)}" style="width:${Math.min(util, 100)}%"></div></div>`
        : '';
      return `<div class="card has-logs" data-container-id="${c.id}" data-container-name="${c.name}"><span class="dot ${c.status}"></span><span class="name">${c.name}</span><span class="meta">${meta}</span>${utilBar}</div>`;
    })
    .join('');
}

function formatBuildResult(result) {
  if (!result) return null;
  return result.charAt(0) + result.slice(1).toLowerCase(); // SUCCESS -> Success
}

function renderJenkins(section) {
  if (section.error) return `<div class="error-msg">${section.error}</div>`;
  if (!section.jobs.length) return `<div class="empty">No Jenkins jobs found.</div>`;
  return section.jobs
    .map((j) => {
      const result = formatBuildResult(j.lastBuildResult);
      const meta = j.building
        ? 'Building…'
        : `${result ? `${result} · ` : ''}#${j.lastBuildNumber ?? '—'} · ${formatAgo(j.lastBuildTimestamp)} · ${formatDuration(j.lastBuildDuration)}`;
      return `<div class="card has-logs" data-job-name="${j.name}" title="Tap for logs · hold 1.5s to build">
        <span class="dot ${j.status}"></span><span class="name">${j.name}</span><span class="meta">${meta}</span>
        <div class="card-util-bar"><div class="card-util-bar-fill hold-progress"></div></div>
      </div>`;
    })
    .join('');
}

function renderSonarQube(section) {
  if (section.error) return `<div class="error-msg">${section.error}</div>`;
  if (!section.projects.length) return `<div class="empty">No SonarQube projects found.</div>`;
  return section.projects
    .map((p) => {
      const failing = (p.conditions || []).filter((c) => c.status !== 'good');
      const meta = p.error
        ? p.error
        : failing.length
        ? failing.map((c) => `${c.metric}: ${c.actual}`).join(', ')
        : 'quality gate passed';
      return card(p.name, meta, p.status);
    })
    .join('');
}

function weatherDayCard(day, index) {
  const dayLabel = index === 0 ? 'Today' : new Date(`${day.date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short' });
  return `
    <div class="weather-card">
      <div class="wc-day">${dayLabel}</div>
      <div class="wc-icon" title="${day.label}">${day.icon}</div>
      <div class="wc-label">${day.label}</div>
      <div class="wc-temps">${day.tempMax}° <span class="min">${day.tempMin}°</span></div>
      <div class="wc-details">
        <span>💧 ${day.precipProbability ?? 0}%</span>
        <span>💨 ${day.windSpeedKmh} km/h</span>
        <span>☀️ UV ${day.uvIndex}</span>
      </div>
    </div>`;
}

function hourlyCard(hour) {
  const hourLabel = new Date(hour.time).toLocaleTimeString(undefined, { hour: 'numeric' });
  return `
    <div class="hourly-card">
      <div class="hc-hour">${hourLabel}</div>
      <div class="hc-icon" title="${hour.label}">${hour.icon}</div>
      <div class="hc-temp">${hour.tempC}°</div>
      <div class="hc-precip">💧${hour.precipProbability ?? 0}%</div>
    </div>`;
}

function renderWeather(section) {
  if (section.error) return `<div class="error-msg">${section.error}</div>`;
  if (!section.days.length) return `<div class="empty">No forecast available.</div>`;
  const hourlyHtml = section.hourly && section.hourly.length
    ? `
      <div class="section-title">Today, hour by hour</div>
      <div class="hourly-row">${section.hourly.map(hourlyCard).join('')}</div>`
    : '';
  return `
    <div class="weather-location">📍 ${section.location}</div>
    ${hourlyHtml}
    <div class="section-title">Next 5 days</div>
    <div class="weather-row">${section.days.map(weatherDayCard).join('')}</div>`;
}

function domainRow(item) {
  return `<div class="domain-row"><span class="domain-name">${item.domain}</span><span class="domain-count">${item.count.toLocaleString()}</span></div>`;
}

function renderPihole(section) {
  if (section.error) return `<div class="error-msg">${section.error}</div>`;
  if (section.percentBlocked == null) return `<div class="empty">No data available.</div>`;

  const blockedPct = section.percentBlocked;
  const allowedPct = Number((100 - blockedPct).toFixed(1));
  const topBlockedHtml = section.topBlocked.length ? section.topBlocked.map(domainRow).join('') : `<div class="empty">No blocked domains yet.</div>`;
  const topPermittedHtml = section.topPermitted.length ? section.topPermitted.map(domainRow).join('') : `<div class="empty">No permitted domains yet.</div>`;

  return `
    <div class="stat-card">
      <div class="stat-title">Pi-hole</div>
      <div class="stat-grid">
        ${statItem('Status', section.enabled ? 'Enabled' : 'Disabled', section.enabled ? '' : 'warning')}
        ${statItem('Queries today', section.queriesToday.toLocaleString())}
        ${statItem('Blocked today', section.blockedToday.toLocaleString())}
        ${statItem('% Blocked', `${blockedPct}%`)}
        ${statItem('Blocklist', `${section.domainsBlocked.toLocaleString()} domains`)}
        ${statItem('Active clients', section.activeClients ?? 'n/a')}
      </div>
    </div>
    <div class="pihole-proportion-wrap">
      <div class="pihole-proportion-bar">
        <div class="segment blocked" style="width: ${blockedPct}%"></div>
        <div class="segment allowed" style="width: ${allowedPct}%"></div>
      </div>
      <div class="pihole-proportion-legend">
        <span><i class="swatch blocked"></i>Blocked (${blockedPct}%)</span>
        <span><i class="swatch allowed"></i>Allowed (${allowedPct}%)</span>
      </div>
    </div>
    <div class="pihole-domain-columns">
      <div class="pihole-domain-list">
        <div class="section-title">Top Blocked Domains</div>
        ${topBlockedHtml}
      </div>
      <div class="pihole-domain-list">
        <div class="section-title">Top Permitted Domains</div>
        ${topPermittedHtml}
      </div>
    </div>`;
}

function renderPowerChart(history) {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const points = history.filter((h) => h.time >= cutoff);
  if (points.length < 2) return `<div class="empty">Not enough history yet - check back in a few minutes.</div>`;

  const height = 200;
  const pad = { top: 16, right: 8, bottom: 8, left: 56 };
  const plotW = 1000 - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const minTime = points[0].time;
  const maxTime = points[points.length - 1].time;
  const timeSpan = Math.max(maxTime - minTime, 1);
  const maxPower = Math.max(...points.map((p) => p.powerW));
  const minPower = Math.min(...points.map((p) => p.powerW));
  const powerRange = Math.max(maxPower - minPower, 1);

  const xFor = (t) => pad.left + ((t - minTime) / timeSpan) * plotW;
  const yFor = (w) => pad.top + plotH - ((w - minPower) / powerRange) * plotH;

  const linePoints = points.map((p) => `${xFor(p.time).toFixed(1)},${yFor(p.powerW).toFixed(1)}`).join(' ');
  const areaPoints = `${pad.left},${pad.top + plotH} ${linePoints} ${xFor(maxTime).toFixed(1)},${pad.top + plotH}`;

  // Two-tone split: blue above zero (importing from the grid), green below
  // (exporting solar surplus) - a hard color transition in the gradient at
  // zero's exact pixel position, applied to both the line and its fill.
  const zeroY = yFor(0);
  const zeroOffsetPct = Math.max(0, Math.min(100, (zeroY / height) * 100)).toFixed(1);

  // Axis gridlines: top (max), zero (only if the data actually crosses it),
  // bottom (min) - each with a labeled value, like the Shelly app's chart.
  const gridlines = [{ y: pad.top, label: `${Math.round(maxPower)} W` }];
  if (minPower < 0 && maxPower > 0) gridlines.push({ y: zeroY, label: '0 W' });
  gridlines.push({ y: pad.top + plotH, label: `${Math.round(minPower)} W` });
  const gridHtml = gridlines
    .map((g) => `
      <line x1="${pad.left}" y1="${g.y.toFixed(1)}" x2="${1000 - pad.right}" y2="${g.y.toFixed(1)}" class="pc-grid" />
      <text x="${pad.left - 8}" y="${g.y.toFixed(1)}" class="pc-grid-label">${g.label}</text>`)
    .join('');

  const startLabel = new Date(minTime).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const endLabel = new Date(maxTime).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

  return `
    <svg viewBox="0 0 1000 ${height}" preserveAspectRatio="none" class="power-chart">
      <defs>
        <linearGradient id="powerGradient" x1="0" y1="0" x2="0" y2="${height}" gradientUnits="userSpaceOnUse">
          <stop offset="0%" class="pc-stop-import" />
          <stop offset="${zeroOffsetPct}%" class="pc-stop-import" />
          <stop offset="${zeroOffsetPct}%" class="pc-stop-export" />
          <stop offset="100%" class="pc-stop-export" />
        </linearGradient>
      </defs>
      ${gridHtml}
      <polygon points="${areaPoints}" class="pc-area"></polygon>
      <polyline points="${linePoints}" class="pc-line"></polyline>
    </svg>
    <div class="pc-labels">
      <span>${startLabel}</span>
      <span>${endLabel}</span>
    </div>`;
}

function renderShelly(section) {
  if (section.error) return `<div class="error-msg">${section.error}</div>`;
  if (section.currentPowerW == null) return `<div class="empty">No data available.</div>`;

  const co2Today = formatCo2(section.todayCo2Grams);
  const co2Lifetime = section.lifetimeCo2Grams >= 1e6
    ? `${(section.lifetimeCo2Grams / 1e6).toFixed(2)} t`
    : `${(section.lifetimeCo2Grams / 1000).toFixed(1)} kg`;
  const solarNote = section.lifetimeReturnedWh > 0
    ? statItem('Solar exported (lifetime)', `${(section.lifetimeReturnedWh / 1000).toFixed(0)} kWh`, '', true)
    : '';

  return `
    <div class="stat-card">
      <div class="stat-title">Shelly</div>
      <div class="stat-grid">
        ${statItem('Current power', `${section.currentPowerW} W`, section.overpower ? 'critical' : '')}
        ${statItem('Voltage', `${section.voltage} V`)}
        ${statItem('Today', `${(section.todayConsumedWh / 1000).toFixed(2)} kWh`)}
        ${statItem('Today CO₂', co2Today)}
        ${statItem('Lifetime net', `${(section.lifetimeConsumedWh / 1000).toFixed(0)} kWh`)}
        ${statItem('Lifetime CO₂', co2Lifetime)}
        ${solarNote}
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-title">Power, last 24h</div>
      ${renderPowerChart(section.history)}
    </div>`;
}

function setNavBadge(view, text, status) {
  const el = document.getElementById(`badge-${view}`);
  el.textContent = text;
  el.className = status && status !== 'good' ? status : '';
}

async function refresh() {
  try {
    const res = await fetch('/api/data');
    const data = await res.json();

    document.getElementById('view-overview').innerHTML = renderOverview(data);
    document.getElementById('view-docker').innerHTML = renderDocker(data.docker);
    document.getElementById('view-jenkins').innerHTML = renderJenkins(data.jenkins);
    document.getElementById('view-sonarqube').innerHTML = renderSonarQube(data.sonarqube);
    document.getElementById('view-weather').innerHTML = renderWeather(data.weather);
    document.getElementById('view-pihole').innerHTML = renderPihole(data.pihole);
    document.getElementById('view-system').innerHTML = renderSystemTab(data);
    document.getElementById('view-shelly').innerHTML = renderShelly(data.shelly);

    latestBluetooth = data.bluetooth || latestBluetooth;
    updateRadioUI();

    latestSpotify = data.spotify || latestSpotify;
    renderSpotifyTab();

    const order = ['good', 'warning', 'serious', 'critical'];
    const worst = (statuses) => statuses.reduce((w, s) => (order.indexOf(s) > order.indexOf(w) ? s : w), 'good');
    const overall = worst([data.overview.agent.status, data.docker.status, data.jenkins.status, data.sonarqube.status, data.postgres.status, data.pihole.status, data.shelly.status]);

    document.getElementById('overall-dot').className = `dot ${overall}`;
    document.getElementById('overall-text').textContent =
      overall === 'good' ? 'All systems operational' : `Attention needed (${overall})`;

    const agent = data.overview.agent;
    document.getElementById('agent-dot').className = `dot ${agent.status}`;
    document.getElementById('agent-text').textContent =
      agent.status === 'good' ? `${agent.latencyMs} ms` : agent.error || 'unreachable';

    setNavBadge('overview', overall === 'good' ? 'ok' : overall, overall);
    setNavBadge('docker', data.docker.summary, data.docker.status);
    setNavBadge('jenkins', data.jenkins.summary, data.jenkins.status);
    setNavBadge('sonarqube', data.sonarqube.summary, data.sonarqube.status);
    setNavBadge(
      'weather',
      data.weather.days.length ? `${data.weather.days[0].icon} ${data.weather.days[0].tempMax}°` : '',
      'good'
    );
    setNavBadge(
      'pihole',
      data.pihole.percentBlocked != null ? `${data.pihole.percentBlocked}% blocked` : '',
      data.pihole.status
    );
    const serverTemp = data.overview.serverSystem && data.overview.serverSystem.cpuTempC;
    setNavBadge('system', serverTemp != null ? `${serverTemp}°C` : '', tempStatus(serverTemp));
    setNavBadge('shelly', data.shelly.currentPowerW != null ? `${data.shelly.currentPowerW} W` : '', data.shelly.status);
    setNavBadge('spotify', data.spotify.isPlaying ? '▶ playing' : '', data.spotify.status);

    document.getElementById('updated-at').textContent = `Updated ${new Date(data.generatedAt).toLocaleTimeString()}`;
  } catch (err) {
    document.getElementById('updated-at').textContent = `Update failed: ${err.message}`;
  }
}

const THEME_KEY = 'raspy-dashboard-theme';

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  document.getElementById('theme-btn').textContent = theme === 'dark' ? '☀️' : '🌙';
}

applyTheme(document.documentElement.getAttribute('data-theme'));

document.getElementById('theme-btn').addEventListener('click', () => {
  const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  localStorage.setItem(THEME_KEY, next);
  applyTheme(next);
});

document.getElementById('refresh-btn').addEventListener('click', async (e) => {
  e.target.classList.add('spinning');
  try {
    await fetch('/api/refresh', { method: 'POST' });
  } catch {
    // fall through to a normal poll below
  }
  await refresh();
  e.target.classList.remove('spinning');
});

function switchView(view) {
  document.querySelectorAll('nav button').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${view}`));
}

document.querySelectorAll('nav button').forEach((btn) => {
  btn.addEventListener('click', () => switchView(btn.dataset.view));
});

// Overview's quick-glance tiles jump straight to the relevant tab when tapped.
document.getElementById('view-overview').addEventListener('click', (e) => {
  const tile = e.target.closest('[data-jump]');
  if (tile) switchView(tile.dataset.jump);
});

async function showLogModal(name, fetchUrl) {
  const modal = document.getElementById('log-modal');
  const title = document.getElementById('log-modal-title');
  const body = document.getElementById('log-modal-body');
  title.textContent = name;
  body.textContent = 'Loading…';
  modal.classList.remove('hidden');
  try {
    const res = await fetch(fetchUrl);
    const data = await res.json();
    body.textContent = data.lines && data.lines.length ? data.lines.join('\n') : (data.error || 'No log output.');
    body.scrollTop = body.scrollHeight;
  } catch (err) {
    body.textContent = `Failed to load logs: ${err.message}`;
  }
}

function closeLogModal() {
  document.getElementById('log-modal').classList.add('hidden');
}

document.getElementById('view-docker').addEventListener('click', (e) => {
  const row = e.target.closest('[data-container-id]');
  if (row) showLogModal(row.dataset.containerName, `/api/docker/${encodeURIComponent(row.dataset.containerId)}/logs?tail=200`);
});
document.getElementById('log-modal-close').addEventListener('click', closeLogModal);
document.getElementById('log-modal').addEventListener('click', (e) => {
  if (e.target.id === 'log-modal') closeLogModal(); // tap the backdrop to dismiss
});

// Jenkins: tap a job to view its last build's log; hold for 1.5s to trigger a
// new build. This is the only write action in the whole dashboard, so the
// long hold (with a visible fill so you can see it coming and back out early)
// is the deliberate safeguard against a stray touch on the kiosk screen.
const HOLD_MS = 1500;
let jenkinsHold = null; // { jobName, startedAt, timer, fillEl, triggered }

function startJenkinsHold(row) {
  const fillEl = row.querySelector('.hold-progress');
  if (fillEl) {
    fillEl.style.transition = 'none';
    fillEl.style.width = '0%';
    void fillEl.offsetWidth; // force reflow so the transition below starts from 0
    fillEl.style.transition = `width ${HOLD_MS}ms linear`;
    fillEl.style.width = '100%';
  }
  jenkinsHold = {
    jobName: row.dataset.jobName,
    startedAt: Date.now(),
    triggered: false,
    fillEl,
    timer: setTimeout(() => triggerJenkinsBuild(), HOLD_MS),
  };
}

function endJenkinsHold() {
  if (!jenkinsHold) return;
  const { jobName, triggered, fillEl, timer } = jenkinsHold;
  clearTimeout(timer);
  jenkinsHold = null;
  if (triggered) return; // full hold already fired the build - handled in triggerJenkinsBuild
  if (fillEl) {
    fillEl.style.transition = 'width 150ms ease-out';
    fillEl.style.width = '0%';
  }
  // Any release before the full HOLD_MS - whether a quick tap or a longer
  // press that didn't quite reach the trigger threshold - opens the logs.
  // The build-trigger safeguard comes entirely from requiring the full
  // sustained hold, not from timing how "tap-like" the release was.
  showLogModal(jobName, `/api/jenkins/${encodeURIComponent(jobName)}/log`);
}

async function triggerJenkinsBuild() {
  if (!jenkinsHold) return;
  jenkinsHold.triggered = true;
  const { jobName, fillEl } = jenkinsHold;
  try {
    const res = await fetch(`/api/jenkins/${encodeURIComponent(jobName)}/build`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
    if (fillEl) { fillEl.style.transition = 'none'; fillEl.style.background = 'var(--good)'; }
    setTimeout(refresh, 1000); // job should flip to "Building..." soon
  } catch (err) {
    if (fillEl) { fillEl.style.transition = 'width 150ms ease-out'; fillEl.style.width = '0%'; }
    alert(`Failed to trigger build for "${jobName}":\n${err.message}`);
  }
}

document.getElementById('view-jenkins').addEventListener('pointerdown', (e) => {
  const row = e.target.closest('[data-job-name]');
  if (row) startJenkinsHold(row);
});
document.addEventListener('pointerup', endJenkinsHold);
document.addEventListener('pointercancel', endJenkinsHold);

document.getElementById('view-radio').addEventListener('click', (e) => {
  const card = e.target.closest('[data-station-id]');
  if (!card) return;
  const station = RADIO_STATIONS.find((s) => s.id === card.dataset.stationId);
  if (station) playStation(station);
});
document.getElementById('radio-vol-down').addEventListener('click', () => changeVolume(-0.1));
document.getElementById('radio-vol-up').addEventListener('click', () => changeVolume(0.1));
document.getElementById('radio-mute-btn').addEventListener('click', toggleMute);
document.getElementById('radio-stop-btn').addEventListener('click', stopRadio);

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

renderRadioTab();
renderSpotifyTab();

refresh();
setInterval(refresh, POLL_MS);
