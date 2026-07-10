const fs = require('fs');
const path = require('path');
const express = require('express');
const { getSystemInfo } = require('./system-info');

const CONFIG_PATH = path.join(__dirname, 'config.json');
if (!fs.existsSync(CONFIG_PATH)) {
  console.error('Missing config.json - copy config.example.json to config.json and fill in your URLs/tokens.');
  process.exit(1);
}
const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

const PORT = process.env.PORT || 8080;
const REFRESH_MS = (config.refreshIntervalSeconds || 10) * 1000;

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
};

async function fetchJson(url, options = {}, timeoutMs = 5000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function worstStatus(statuses) {
  const order = ['good', 'warning', 'serious', 'critical'];
  return statuses.reduce((worst, s) => (order.indexOf(s) > order.indexOf(worst) ? s : worst), 'good');
}

// Logs to stdout (visible via `journalctl -u dashboard.service`), but only on
// change - so a persistent failure logs once instead of once per poll cycle.
const lastLogged = {};
function logOnce(source, message) {
  if (lastLogged[source] === message) return;
  lastLogged[source] = message;
  if (message) console.error(`[${source}] ${message}`);
  else console.log(`[${source}] recovered`);
}

async function refreshDocker() {
  const { url, apiKey } = config.dockerAgent || {};
  if (!url) return { status: 'warning', containers: [], summary: 'not configured', error: 'not configured' };
  try {
    const data = await fetchJson(`${url}/api/containers`, {
      headers: apiKey ? { 'x-api-key': apiKey } : {},
    });
    const containers = data.containers.map((c) => ({
      ...c,
      status:
        c.state === 'running'
          ? c.cpuPercent > 90 || c.memPercent > 90
            ? 'warning'
            : 'good'
          : c.state === 'restarting' || c.state === 'paused'
          ? 'warning'
          : 'critical',
    }));
    const healthy = containers.filter((c) => c.status === 'good').length;
    logOnce('docker', null);
    return {
      status: worstStatus(containers.map((c) => c.status)),
      containers,
      summary: `${healthy}/${containers.length} healthy`,
      error: null,
    };
  } catch (err) {
    logOnce('docker', err.message);
    return { status: 'critical', containers: [], summary: 'unreachable', error: err.message };
  }
}

function jenkinsColorToStatus(color) {
  if (!color) return 'warning';
  const base = color.replace('_anime', '');
  if (base === 'blue') return 'good';
  if (base === 'yellow') return 'warning';
  if (base === 'red') return 'critical';
  if (base === 'aborted') return 'serious';
  return 'warning'; // grey/disabled/notbuilt
}

async function refreshJenkins() {
  const { url, user, apiToken } = config.jenkins || {};
  if (!url) return { status: 'warning', jobs: [], summary: 'not configured', error: 'not configured' };
  try {
    const auth = Buffer.from(`${user}:${apiToken}`).toString('base64');
    const data = await fetchJson(
      `${url}/api/json?tree=jobs[name,color,url,lastBuild[number,result,timestamp,duration,building]]`,
      { headers: { Authorization: `Basic ${auth}` } }
    );
    const jobs = (data.jobs || []).map((j) => ({
      name: j.name,
      url: j.url,
      building: !!(j.lastBuild && j.lastBuild.building),
      lastBuildNumber: j.lastBuild ? j.lastBuild.number : null,
      lastBuildTimestamp: j.lastBuild ? j.lastBuild.timestamp : null,
      lastBuildDuration: j.lastBuild ? j.lastBuild.duration : null,
      status: jenkinsColorToStatus(j.color),
    }));
    const failing = jobs.filter((j) => j.status === 'critical' || j.status === 'serious').length;
    const building = jobs.filter((j) => j.building).length;
    const summary = `${jobs.length - failing}/${jobs.length} passing${building ? ` · ${building} building` : ''}`;
    logOnce('jenkins', null);
    return { status: worstStatus(jobs.map((j) => j.status)), jobs, summary, error: null };
  } catch (err) {
    logOnce('jenkins', err.message);
    return { status: 'critical', jobs: [], summary: 'unreachable', error: err.message };
  }
}

function sonarStatusToStatus(status) {
  if (status === 'OK') return 'good';
  if (status === 'WARN') return 'warning';
  if (status === 'ERROR') return 'critical';
  return 'warning'; // NONE / unknown
}

async function refreshSonarQube() {
  const { url, token } = config.sonarqube || {};
  if (!url) return { status: 'warning', projects: [], summary: 'not configured', error: 'not configured' };
  try {
    const auth = Buffer.from(`${token}:`).toString('base64');
    const headers = { Authorization: `Basic ${auth}` };
    const search = await fetchJson(`${url}/api/projects/search?ps=100`, { headers });
    const components = search.components || [];
    const projects = await Promise.all(
      components.map(async (p) => {
        try {
          const qg = await fetchJson(
            `${url}/api/qualitygates/project_status?projectKey=${encodeURIComponent(p.key)}`,
            { headers }
          );
          return {
            key: p.key,
            name: p.name,
            status: sonarStatusToStatus(qg.projectStatus.status),
            conditions: (qg.projectStatus.conditions || []).map((c) => ({
              metric: c.metricKey,
              status: sonarStatusToStatus(c.status),
              actual: c.actualValue,
            })),
          };
        } catch (err) {
          return { key: p.key, name: p.name, status: 'warning', conditions: [], error: err.message };
        }
      })
    );
    const failing = projects.filter((p) => p.status === 'critical' || p.status === 'warning').length;
    const summary = `${projects.length - failing}/${projects.length} passing`;
    logOnce('sonarqube', null);
    return { status: worstStatus(projects.map((p) => p.status)), projects, summary, error: null };
  } catch (err) {
    logOnce('sonarqube', err.message);
    return { status: 'critical', projects: [], summary: 'unreachable', error: err.message };
  }
}

// WMO weather codes -> [emoji, label]. https://open-meteo.com/en/docs
const WEATHER_CODES = {
  0: ['☀️', 'Clear'], 1: ['🌤️', 'Mostly clear'], 2: ['⛅', 'Partly cloudy'], 3: ['☁️', 'Overcast'],
  45: ['🌫️', 'Fog'], 48: ['🌫️', 'Fog'],
  51: ['🌦️', 'Light drizzle'], 53: ['🌦️', 'Drizzle'], 55: ['🌦️', 'Heavy drizzle'],
  56: ['🌧️', 'Freezing drizzle'], 57: ['🌧️', 'Freezing drizzle'],
  61: ['🌧️', 'Light rain'], 63: ['🌧️', 'Rain'], 65: ['🌧️', 'Heavy rain'],
  66: ['🌧️', 'Freezing rain'], 67: ['🌧️', 'Freezing rain'],
  71: ['🌨️', 'Light snow'], 73: ['🌨️', 'Snow'], 75: ['🌨️', 'Heavy snow'], 77: ['🌨️', 'Snow grains'],
  80: ['🌦️', 'Rain showers'], 81: ['🌦️', 'Rain showers'], 82: ['⛈️', 'Violent showers'],
  85: ['🌨️', 'Snow showers'], 86: ['🌨️', 'Snow showers'],
  95: ['⛈️', 'Thunderstorm'], 96: ['⛈️', 'Thunderstorm w/ hail'], 99: ['⛈️', 'Thunderstorm w/ hail'],
};

function weatherCodeInfo(code) {
  return WEATHER_CODES[code] || ['❓', 'Unknown'];
}

let resolvedLocation = null; // cached so we only geocode once per process

async function resolveLocation() {
  if (resolvedLocation) return resolvedLocation;
  const w = config.weather || {};
  if (w.latitude != null && w.longitude != null) {
    resolvedLocation = { latitude: w.latitude, longitude: w.longitude, name: w.locationName || `${w.latitude}, ${w.longitude}` };
    return resolvedLocation;
  }
  if (w.location) {
    const geo = await fetchJson(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(w.location)}&count=1`);
    if (!geo.results || !geo.results.length) throw new Error(`location "${w.location}" not found`);
    const r = geo.results[0];
    const parts = [r.name, r.admin1, r.country].filter(Boolean);
    resolvedLocation = { latitude: r.latitude, longitude: r.longitude, name: parts.join(', ') };
    return resolvedLocation;
  }
  throw new Error('not configured');
}

async function refreshWeather() {
  const w = config.weather || {};
  if (!w.location && (w.latitude == null || w.longitude == null)) {
    return { location: null, days: [], hourly: [], error: 'not configured' };
  }
  try {
    const loc = await resolveLocation();
    const data = await fetchJson(
      `https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}` +
        `&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
        `&hourly=temperature_2m,weathercode,precipitation_probability` +
        `&current_weather=true&timezone=auto&forecast_days=5`
    );
    const days = data.daily.time.map((date, i) => {
      const [icon, label] = weatherCodeInfo(data.daily.weathercode[i]);
      return {
        date,
        icon,
        label,
        tempMax: Math.round(data.daily.temperature_2m_max[i]),
        tempMin: Math.round(data.daily.temperature_2m_min[i]),
        precipProbability: data.daily.precipitation_probability_max[i],
      };
    });

    const today = data.daily.time[0];
    const nowLocal = data.current_weather.time; // e.g. "2026-07-10T14:00", same tz as hourly.time
    const hourly = data.hourly.time
      .map((time, i) => ({
        time,
        code: data.hourly.weathercode[i],
        tempC: Math.round(data.hourly.temperature_2m[i]),
        precipProbability: data.hourly.precipitation_probability[i],
      }))
      .filter((h) => h.time.startsWith(today) && h.time >= nowLocal)
      .map((h) => {
        const [icon, label] = weatherCodeInfo(h.code);
        return { time: h.time, icon, label, tempC: h.tempC, precipProbability: h.precipProbability };
      });

    logOnce('weather', null);
    return { location: loc.name, days, hourly, error: null };
  } catch (err) {
    logOnce('weather', err.message);
    return { location: null, days: [], hourly: [], error: err.message };
  }
}

async function refreshOverview() {
  const { url, apiKey } = config.dockerAgent || {};
  let agent = { status: 'warning', latencyMs: null, error: 'not configured' };
  let serverSystem = null;

  if (url) {
    const start = Date.now();
    try {
      const data = await fetchJson(`${url}/api/system`, {
        headers: apiKey ? { 'x-api-key': apiKey } : {},
      });
      agent = { status: 'good', latencyMs: Date.now() - start, error: null };
      serverSystem = data;
      logOnce('agent', null);
    } catch (err) {
      agent = { status: 'critical', latencyMs: null, error: err.message };
      logOnce('agent', err.message);
    }
  }

  let dashboardSystem = null;
  try {
    dashboardSystem = getSystemInfo();
  } catch (err) {
    dashboardSystem = null;
  }

  return { agent, serverSystem, dashboardSystem };
}

async function refreshPostgres() {
  const { url, apiKey } = config.dockerAgent || {};
  if (!url) return { status: 'warning', latencyMs: null, version: null, connections: null, databaseSizeBytes: null, error: 'not configured' };
  try {
    const data = await fetchJson(`${url}/api/postgres`, {
      headers: apiKey ? { 'x-api-key': apiKey } : {},
    });
    logOnce('postgres', data.error);
    return data;
  } catch (err) {
    logOnce('postgres', err.message);
    return { status: 'critical', latencyMs: null, version: null, connections: null, databaseSizeBytes: null, error: err.message };
  }
}

async function refreshAll() {
  const [overview, docker, jenkins, sonarqube, weather, postgres] = await Promise.all([
    refreshOverview(),
    refreshDocker(),
    refreshJenkins(),
    refreshSonarQube(),
    refreshWeather(),
    refreshPostgres(),
  ]);
  cache = { generatedAt: new Date().toISOString(), overview, docker, jenkins, sonarqube, weather, postgres };
}

refreshAll();
setInterval(refreshAll, REFRESH_MS);

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
app.get('/api/data', (req, res) => res.json(cache));
app.post('/api/refresh', async (req, res) => {
  await refreshAll();
  res.json(cache);
});

app.listen(PORT, () => {
  console.log(`dashboard listening on :${PORT}`);
});
