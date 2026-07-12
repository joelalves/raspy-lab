// Composition root: loads config, wires up each integration in
// dashboard/integrations/ (one third-party service each), assembles their
// results into the single `cache` object the frontend polls, and mounts
// each integration's routes (if it has any) alongside the dashboard's own
// couple of generic routes. See dashboard/integrations/*.js for the actual
// per-service logic - this file should stay a thin composition layer.
const fs = require('fs');
const path = require('path');
const express = require('express');
const { worstStatus } = require('./lib/pure');
const { requireApiKey } = require('./lib/auth');

const CONFIG_PATH = path.join(__dirname, 'config.json');
if (!fs.existsSync(CONFIG_PATH)) {
  console.error('Missing config.json - copy config.example.json to config.json and fill in your URLs/tokens.');
  process.exit(1);
}
const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

const PORT = process.env.PORT || 8080;
const REFRESH_MS = (config.refreshIntervalSeconds || 10) * 1000;

const docker = require('./integrations/docker')(config);
const jenkins = require('./integrations/jenkins')(config);
const sonarqube = require('./integrations/sonarqube')(config);
const weather = require('./integrations/weather')(config);
const pihole = require('./integrations/pihole')(config);
const shelly = require('./integrations/shelly')(config);
const bluetooth = require('./integrations/bluetooth')(config);
const spotify = require('./integrations/spotify')(config);
const postgres = require('./integrations/postgres')(config);
const overview = require('./integrations/overview')(config);

let cache = {
  generatedAt: null,
  overview: {
    agent: { status: 'warning', latencyMs: null, error: null },
    serverSystem: null,
    dashboardSystem: null,
  },
  docker: { status: 'warning', containers: [], summary: '', error: null },
  jenkins: { status: 'warning', jobs: [], summary: '', error: null },
  sonarqube: { status: 'warning', projects: [], summary: '', error: null },
  weather: { location: null, days: [], hourly: [], error: null },
  postgres: { status: 'warning', latencyMs: null, version: null, connections: null, databaseSizeBytes: null, error: null },
  pihole: { status: 'warning', enabled: null, queriesToday: null, blockedToday: null, percentBlocked: null, domainsBlocked: null, activeClients: null, topBlocked: [], topPermitted: [], error: null },
  shelly: {
    status: 'warning',
    currentPowerW: null,
    voltage: null,
    overpower: null,
    todayConsumedWh: null,
    todayCo2Grams: null,
    lifetimeConsumedWh: null,
    lifetimeReturnedWh: null,
    lifetimeCo2Grams: null,
    history: [],
    error: null,
  },
  bluetooth: { status: 'warning', connected: false, name: null, batteryPct: null, error: null },
  spotify: {
    status: 'warning',
    linked: false,
    isPlaying: false,
    trackName: null,
    artistName: null,
    albumArt: null,
    deviceName: null,
    deviceId: null,
    itemType: null,
    currentlyPlayingType: null,
    volumePercent: null,
    progressMs: null,
    durationMs: null,
    error: null,
  },
};

weather.startWeatherLoop();

// Push notification on transitions into/out of 'critical' only - not every
// 'warning' (e.g. "not configured" for an optional integration isn't worth
// interrupting someone for). Edge-triggered so it fires once per transition,
// not once per poll cycle. Uses ntfy.sh: free, no account, just a POST.
let lastOverallStatus = 'good';
async function notifyOnTransition(overallStatus, criticalSources) {
  const ntfyUrl = config.notifications && config.notifications.ntfyUrl;
  const wasCritical = lastOverallStatus === 'critical';
  const isCritical = overallStatus === 'critical';
  lastOverallStatus = overallStatus;
  if (!ntfyUrl || wasCritical === isCritical) return;
  try {
    await fetch(ntfyUrl, {
      method: 'POST',
      headers: {
        Title: 'Server Dashboard',
        Priority: isCritical ? 'high' : 'default',
        Tags: isCritical ? 'rotating_light' : 'white_check_mark',
      },
      body: isCritical ? `Attention needed: ${criticalSources.join(', ')}` : 'All systems recovered.',
    });
  } catch (err) {
    console.error('[notify] failed to send ntfy notification:', err.message);
  }
}

async function refreshAll() {
  const [overviewData, dockerData, jenkinsData, sonarqubeData, postgresData, piholeData, shellyData, bluetoothData, spotifyData] = await Promise.all([
    overview.refreshOverview(),
    docker.refreshDocker(),
    jenkins.refreshJenkins(),
    sonarqube.refreshSonarQube(),
    postgres.refreshPostgres(),
    pihole.refreshPihole(),
    shelly.refreshShelly(),
    bluetooth.refreshBluetooth(),
    spotify.refreshSpotify(),
  ]);
  cache = {
    generatedAt: new Date().toISOString(),
    overview: overviewData,
    docker: dockerData,
    jenkins: jenkinsData,
    sonarqube: sonarqubeData,
    weather: weather.getWeatherCache(),
    postgres: postgresData,
    pihole: piholeData,
    shelly: shellyData,
    bluetooth: bluetoothData,
    spotify: spotifyData,
  };

  const statuses = {
    agent: overviewData.agent.status,
    docker: dockerData.status,
    jenkins: jenkinsData.status,
    sonarqube: sonarqubeData.status,
    postgres: postgresData.status,
    pihole: piholeData.status,
    shelly: shellyData.status,
  };
  const overallStatus = worstStatus(Object.values(statuses));
  const criticalSources = Object.entries(statuses).filter(([, s]) => s === 'critical').map(([name]) => name);
  await notifyOnTransition(overallStatus, criticalSources);
}

refreshAll();
setInterval(refreshAll, REFRESH_MS);

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.get('/api/data', requireApiKey, (req, res) => res.json(cache));
app.post('/api/refresh', requireApiKey, async (req, res) => {
  await refreshAll();
  res.json(cache);
});

// The kiosk has no accessible devtools console, so the frontend posts
// Spotify (and any other client-side) errors here instead - they show up
// in `journalctl -u dashboard.service` alongside everything else.
app.post('/api/client-log', (req, res) => {
  const { context, message, detail } = req.body || {};
  console.error(`[client${context ? `:${context}` : ''}] ${message || ''}${detail ? ` - ${detail}` : ''}`);
  res.json({ ok: true });
});

app.use(docker.router);
app.use(jenkins.router);
app.use(spotify.router);

app.listen(PORT, () => {
  console.log(`dashboard listening on :${PORT}`);
});

// Shelly history is only written to disk every 5 minutes (SD card wear), so
// a plain systemd stop/restart (e.g. every deploy) can silently drop the most
// recent unsaved samples. Flush on the way out instead.
function shutdown(signal) {
  console.log(`[shutdown] ${signal} received, flushing Shelly history...`);
  shelly.saveShellyHistory();
  process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
