// IPTV: live TV channels via HLS.js (Chromium/Firefox can't play .m3u8
// natively through a plain <video> tag, unlike Safari - hls.js is loaded as
// a classic <script> in index.html and used here as the global `Hls`).
//
// Every channel below was individually verified against the broadcaster's
// own domain (not an aggregator list) before being added - see the project
// notes on this feature for which countries/channels had a clean
// verification path. Portugal's are all RTP (the public broadcaster, one
// domain for every channel); Spain's are regional public broadcasters, each
// confirmed on their own domain.
const IPTV_CHANNELS = [
  { id: 'rtp1', name: 'RTP1', country: 'Portugal', url: 'https://streaming-live.rtp.pt/liverepeater/smil:rtp1HD.smil/playlist.m3u8', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/ec/RTP1_-_Logo_2016.svg/640px-RTP1_-_Logo_2016.svg.png' },
  { id: 'rtp2', name: 'RTP2', country: 'Portugal', url: 'https://streaming-live.rtp.pt/liverepeater/rtp2HD.smil/playlist.m3u8', logo: 'https://upload.wikimedia.org/wikipedia/en/4/4d/Rtp2_2016_logo.png' },
  { id: 'rtp3', name: 'RTP3', country: 'Portugal', url: 'https://streaming-live.rtp.pt/livetvhlsDVR/rtpnHDdvr.smil/playlist.m3u8', logo: 'https://upload.wikimedia.org/wikipedia/commons/b/b9/Rtp3.png' },
  { id: 'rtp-acores', name: 'RTP Açores', country: 'Portugal', url: 'https://streaming-live.rtp.pt/liverepeater/smil:rtpacoresHD.smil/playlist.m3u8', logo: 'https://upload.wikimedia.org/wikipedia/commons/a/aa/RTP_A%C3%A7ores_%282016%29.svg' },
  { id: 'rtp-madeira', name: 'RTP Madeira', country: 'Portugal', url: 'https://streaming-live.rtp.pt/liverepeater/smil:rtpmadeira.smil/playlist.m3u8', logo: 'https://upload.wikimedia.org/wikipedia/en/a/ac/RTP_Madeira_2016.png' },
  { id: 'rtp-noticias', name: 'RTP Notícias', country: 'Portugal', url: 'https://streaming-live.rtp.pt/liverepeater/smil:rtpnHD.smil/playlist.m3u8', logo: 'https://upload.wikimedia.org/wikipedia/commons/b/b9/Rtp3.png' },
  { id: 'rtp-mundo', name: 'RTP Mundo', country: 'Portugal', url: 'https://streaming-live.rtp.pt/liverepeater/smil:rtpi.smil/playlist.m3u8', logo: 'https://upload.wikimedia.org/wikipedia/commons/1/17/RTP_Mundo.svg' },
  { id: 'rtp-africa', name: 'RTP África', country: 'Portugal', url: 'https://streaming-live.rtp.pt/liverepeater/smil:rtpafrica.smil/playlist.m3u8', logo: 'https://upload.wikimedia.org/wikipedia/commons/8/85/RTP_%C3%81frica_2016.png' },
  { id: 'etb1', name: 'ETB1', country: 'Spain', url: 'https://multimedia.eitb.eus/live-content/etb1hd-hls/master.m3u8', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f4/ETB1_2022_logo.svg/500px-ETB1_2022_logo.svg.png' },
  { id: 'etb2', name: 'ETB2', country: 'Spain', url: 'https://multimedia.eitb.eus/live-content/etb2hd-hls/master.m3u8', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c4/ETB2_2022_logo.svg/500px-ETB2_2022_logo.svg.png' },
  { id: 'tv3cat', name: 'TV3CAT', country: 'Spain', url: 'https://directes3-tv-int.3catdirectes.cat/live-content/tvi-hls/master.m3u8', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/97/TV3CAT.svg/500px-TV3CAT.svg.png' },
  { id: '3-24', name: '3/24', country: 'Spain', url: 'https://directes-tv-int.3catdirectes.cat/live-origin/canal324-hls/master.m3u8', logo: 'https://raw.githubusercontent.com/tv-logo/tv-logos/refs/heads/main/countries/spain/3-24-es.png' },
  { id: 'aragontv', name: 'Aragón TV', country: 'Spain', url: 'https://cartv.streaming.aranova.es/hls/live/aragontv_canal1.m3u8', logo: 'https://i.imgur.com/8H3Q07b.png' },
];

const iptvVideo = document.getElementById('iptv-video');
let iptvHls = null;
let currentIptvChannel = null;
let iptvFullscreen = false;

function stopIptv() {
  if (iptvHls) {
    iptvHls.destroy();
    iptvHls = null;
  }
  iptvVideo.removeAttribute('src');
  iptvVideo.load();
  currentIptvChannel = null;
  renderIptvTab();
}

function playIptvChannel(channel) {
  if (currentIptvChannel && currentIptvChannel.id === channel.id) {
    stopIptv();
    return;
  }
  if (iptvHls) {
    iptvHls.destroy();
    iptvHls = null;
  }
  currentIptvChannel = channel;
  renderIptvTab();
  // renderIptvTab() just rebuilt the DOM around the persistent <video>
  // element - grab it fresh rather than relying on the closed-over
  // reference, since innerHTML replacement elsewhere doesn't touch this
  // element (it lives outside any replaced section) but the surrounding
  // wrapper markup does get rebuilt.
  const video = document.getElementById('iptv-video');
  if (window.Hls && window.Hls.isSupported()) {
    iptvHls = new window.Hls();
    iptvHls.loadSource(channel.url);
    iptvHls.attachMedia(video);
    iptvHls.on(window.Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}));
    iptvHls.on(window.Hls.Events.ERROR, (event, data) => {
      if (data.fatal) {
        console.error('[iptv] fatal hls error:', data.type, data.details);
        alert(`Couldn't play ${channel.name} - the stream may be temporarily down.`);
        stopIptv();
      }
    });
  } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
    // Safari (or any browser with native HLS support) doesn't need hls.js.
    video.src = channel.url;
    video.addEventListener('loadedmetadata', () => video.play().catch(() => {}), { once: true });
  } else {
    alert("This browser can't play live TV streams.");
    currentIptvChannel = null;
    renderIptvTab();
  }
}

function toggleIptvFullscreen() {
  const video = document.getElementById('iptv-video');
  if (document.fullscreenElement) {
    document.exitFullscreen();
  } else {
    video.requestFullscreen();
  }
}

document.addEventListener('fullscreenchange', () => {
  iptvFullscreen = !!document.fullscreenElement;
  // Only re-render if the IPTV tab is what's actually on screen - avoids
  // clobbering another tab's DOM if fullscreen exits while elsewhere.
  if (document.getElementById('view-iptv').classList.contains('active')) renderIptvTab();
});

function iptvChannelCard(channel) {
  const playing = currentIptvChannel && currentIptvChannel.id === channel.id;
  const img = channel.logo
    ? `<img class="iptv-card-logo" src="${channel.logo}" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'iptv-card-logo iptv-card-logo-fallback',textContent:'📺'}))">`
    : '<div class="iptv-card-logo iptv-card-logo-fallback">📺</div>';
  return `
    <div class="iptv-card${playing ? ' playing' : ''}" data-channel-id="${channel.id}">
      ${img}
      <div class="iptv-card-name">${channel.name}</div>
      ${playing ? '<div class="iptv-card-status">▶ Playing</div>' : ''}
    </div>`;
}

function renderIptvTab() {
  const view = document.getElementById('view-iptv');
  if (!view) return;

  const player = `
    <div class="iptv-player">
      <div class="iptv-player-video-wrap"></div>
      <div class="iptv-player-info">
        <div class="iptv-player-name">${currentIptvChannel ? currentIptvChannel.name : 'Select a channel'}</div>
        ${currentIptvChannel ? `
          <div class="iptv-player-controls">
            <button id="iptv-fullscreen-btn" class="spotify-btn-primary">${iptvFullscreen ? '⤢ Exit Fullscreen' : '⛶ Fullscreen'}</button>
            <button id="iptv-stop-btn" class="radio-btn" title="Stop">⏹</button>
          </div>` : ''}
      </div>
    </div>`;

  const countries = [...new Set(IPTV_CHANNELS.map((c) => c.country))];
  const grid = countries.map((country) => `
    <div class="spotify-lib-section">
      <div class="spotify-lib-title">${country}</div>
      <div class="iptv-grid">
        ${IPTV_CHANNELS.filter((c) => c.country === country).map(iptvChannelCard).join('')}
      </div>
    </div>`).join('');

  view.innerHTML = player + grid;

  // The persistent <video> element lives outside any replaced section (see
  // index.html) - move it into the wrapper we just rendered rather than
  // recreating it, so playback isn't interrupted by this re-render.
  const wrap = view.querySelector('.iptv-player-video-wrap');
  if (wrap) wrap.appendChild(iptvVideo);
}

export function initIptv() {
  document.getElementById('view-iptv').addEventListener('click', (e) => {
    if (e.target.id === 'iptv-fullscreen-btn') return toggleIptvFullscreen();
    if (e.target.id === 'iptv-stop-btn') return stopIptv();
    const card = e.target.closest('[data-channel-id]');
    if (card) {
      const channel = IPTV_CHANNELS.find((c) => c.id === card.dataset.channelId);
      if (channel) playIptvChannel(channel);
    }
  });
  renderIptvTab();
}
