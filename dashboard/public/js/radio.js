// Internet radio: a client-side <audio> player (no backend involved beyond
// serving this JS) with a fixed list of Portuguese stations, a header
// now-playing badge, and an Overview card. Self-contained - imports nothing
// from the other view modules.

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

export function updateRadioUI() {
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

export function renderRadioOverviewCard() {
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

// Called from main.js's poll loop instead of assigning latestBluetooth
// directly - an imported binding can't be reassigned from outside this
// module, only mutated through an exported function like this one.
export function ingestBluetooth(data) {
  latestBluetooth = data || latestBluetooth;
}

// Wires up all of Radio's own DOM listeners - called once from main.js at
// startup, keeping main.js from needing to import RADIO_STATIONS/
// playStation/changeVolume/toggleMute/stopRadio just to wire buttons.
export function initRadio() {
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
  renderRadioTab();
}
