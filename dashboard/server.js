const fs = require('fs');
const path = require('path');
const express = require('express');
const { getSystemInfo } = require('./system-info');
const {
  worstStatus,
  jenkinsColorToStatus,
  sonarStatusToStatus,
  weatherCodeInfo,
  pruneHistory,
  sumEnergyForDay,
  co2Grams,
} = require('./lib/pure');

const CONFIG_PATH = path.join(__dirname, 'config.json');
if (!fs.existsSync(CONFIG_PATH)) {
  console.error('Missing config.json - copy config.example.json to config.json and fill in your URLs/tokens.');
  process.exit(1);
}
const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

const PORT = process.env.PORT || 8080;
const REFRESH_MS = (config.refreshIntervalSeconds || 10) * 1000;

// The kiosk browser talks to this app over localhost, so it's always trusted
// with no key needed (keeps the auto-launch kiosk experience seamless). Any
// other device on the LAN calling the API directly needs DASHBOARD_API_KEY,
// if one is set - matches server-agent's AGENT_API_KEY pattern. Unset = open,
// same as server-agent, for easy initial setup.
const DASHBOARD_API_KEY = process.env.DASHBOARD_API_KEY || '';
function isLoopback(req) {
  const ip = req.ip || (req.connection && req.connection.remoteAddress) || '';
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}
function requireApiKey(req, res, next) {
  if (!DASHBOARD_API_KEY || isLoopback(req)) return next();
  if (req.get('x-api-key') === DASHBOARD_API_KEY) return next();
  return res.status(401).json({ error: 'unauthorized' });
}

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
};

async function fetchJson(url, options = {}, timeoutMs = 5000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`${res.status} ${res.statusText}${body ? `: ${body.slice(0, 200)}` : ''}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
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
      lastBuildResult: j.lastBuild ? j.lastBuild.result : null,
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
        `&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max,windspeed_10m_max,uv_index_max` +
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
        windSpeedKmh: Math.round(data.daily.windspeed_10m_max[i]),
        uvIndex: Math.round(data.daily.uv_index_max[i]),
      };
    });

    const nowLocal = data.current_weather.time; // e.g. "2026-07-10T14:00", same tz as hourly.time
    const hourly = data.hourly.time
      .map((time, i) => ({
        time,
        code: data.hourly.weathercode[i],
        tempC: Math.round(data.hourly.temperature_2m[i]),
        precipProbability: data.hourly.precipitation_probability[i],
      }))
      .filter((h) => h.time >= nowLocal)
      .slice(0, 10) // next ~10 hours, crossing into tomorrow near midnight if needed
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

let piholeSession = null; // { sid, expiresAt } - cached across polls, Pi-hole sessions expire

async function piholeAuth() {
  const { url, password } = config.pihole || {};
  // Pi-hole returns HTTP 401 even for a wrong password (not 200 + valid:false),
  // so parse the body ourselves instead of going through fetchJson - its
  // !res.ok check would throw before we get a chance to read session.message.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  let data;
  try {
    const res = await fetch(`${url}/api/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
      signal: controller.signal,
    });
    data = await res.json();
  } finally {
    clearTimeout(timer);
  }
  if (!data.session || !data.session.valid) {
    throw new Error((data.session && data.session.message) || (data.error && data.error.message) || 'authentication failed');
  }
  piholeSession = {
    sid: data.session.sid,
    expiresAt: Date.now() + Math.max(data.session.validity - 30, 10) * 1000,
  };
  return piholeSession.sid;
}

async function getPiholeSid() {
  if (piholeSession && Date.now() < piholeSession.expiresAt) return piholeSession.sid;
  return piholeAuth();
}

async function refreshPihole() {
  const { url, password } = config.pihole || {};
  const empty = {
    enabled: null,
    queriesToday: null,
    blockedToday: null,
    percentBlocked: null,
    domainsBlocked: null,
    activeClients: null,
    topBlocked: [],
    topPermitted: [],
  };
  if (!url || !password) return { status: 'warning', ...empty, error: 'not configured' };
  try {
    const sid = await getPiholeSid();
    const headers = { 'X-FTL-SID': sid };
    const [blocking, summary, topBlockedData, topPermittedData] = await Promise.all([
      fetchJson(`${url}/api/dns/blocking`, { headers }),
      fetchJson(`${url}/api/stats/summary`, { headers }),
      fetchJson(`${url}/api/stats/top_domains?blocked=true&count=8`, { headers }),
      fetchJson(`${url}/api/stats/top_domains?count=8`, { headers }),
    ]);
    const enabled = blocking.blocking === 'enabled';
    const toList = (data) => (data.domains || []).map((d) => ({ domain: d.domain, count: d.count }));
    logOnce('pihole', null);
    return {
      status: enabled ? 'good' : 'warning',
      enabled,
      queriesToday: summary.queries.total,
      blockedToday: summary.queries.blocked,
      percentBlocked: Number((summary.queries.percent_blocked ?? 0).toFixed(1)),
      domainsBlocked: summary.gravity.domains_being_blocked,
      activeClients: summary.clients ? summary.clients.active : null,
      topBlocked: toList(topBlockedData),
      topPermitted: toList(topPermittedData),
      error: null,
    };
  } catch (err) {
    piholeSession = null; // force re-auth next cycle - session may be invalid/expired
    logOnce('pihole', err.message);
    return { status: 'critical', ...empty, error: err.message };
  }
}

const SHELLY_HISTORY_PATH = path.join(__dirname, 'data', 'shelly-history.json');
const SHELLY_PERSIST_INTERVAL_MS = 5 * 60 * 1000; // sample every cycle, but only persist every 5min (SD card wear)
const SHELLY_RETENTION_MS = 7 * 24 * 60 * 60 * 1000; // keep 7 days of 5-min samples

let shellyHistory = []; // [{ time: epochMs, powerW, energyWhDelta }]
let shellyLastPersist = null; // { at: epochMs, totalWh } - meter reading at the last persisted sample

function loadShellyHistory() {
  try {
    const parsed = JSON.parse(fs.readFileSync(SHELLY_HISTORY_PATH, 'utf8'));
    shellyHistory = Array.isArray(parsed.history) ? parsed.history : [];
    shellyLastPersist = parsed.lastPersist || null;
  } catch {
    shellyHistory = [];
    shellyLastPersist = null;
  }
}
loadShellyHistory();

function saveShellyHistory() {
  try {
    fs.mkdirSync(path.dirname(SHELLY_HISTORY_PATH), { recursive: true });
    fs.writeFileSync(SHELLY_HISTORY_PATH, JSON.stringify({ history: shellyHistory, lastPersist: shellyLastPersist }));
  } catch (err) {
    console.error('[shelly] failed to persist history:', err.message);
  }
}

async function refreshShelly() {
  const { url, carbonIntensityGramsPerKwh } = config.shelly || {};
  const empty = {
    currentPowerW: null, voltage: null, overpower: null,
    todayConsumedWh: null, todayCo2Grams: null,
    lifetimeConsumedWh: null, lifetimeReturnedWh: null, lifetimeCo2Grams: null,
    history: [],
  };
  if (!url) return { status: 'warning', ...empty, error: 'not configured' };
  try {
    const data = await fetchJson(`${url}/status`);
    const emeters = data.emeters || [];
    const currentPowerW = Number(emeters.reduce((sum, m) => sum + (m.power || 0), 0).toFixed(1));
    const voltage = emeters.length ? Number(emeters[0].voltage.toFixed(1)) : null;
    const lifetimeConsumedWh = emeters.reduce((sum, m) => sum + (m.total || 0), 0);
    const lifetimeReturnedWh = emeters.reduce((sum, m) => sum + (m.total_returned || 0), 0);
    const netLifetimeWh = lifetimeConsumedWh - lifetimeReturnedWh;
    const overpower = (data.relays || []).some((r) => r.overpower);
    const factor = carbonIntensityGramsPerKwh || 200; // gCO2/kWh, rough Portugal grid average

    const now = Date.now();
    if (!shellyLastPersist || now - shellyLastPersist.at >= SHELLY_PERSIST_INTERVAL_MS) {
      const energyWhDelta = shellyLastPersist ? Math.max(netLifetimeWh - shellyLastPersist.totalWh, 0) : 0;
      shellyHistory.push({ time: now, powerW: currentPowerW, energyWhDelta });
      shellyHistory = pruneHistory(shellyHistory, now - SHELLY_RETENTION_MS);
      shellyLastPersist = { at: now, totalWh: netLifetimeWh };
      saveShellyHistory();
    }

    const todayConsumedWh = sumEnergyForDay(shellyHistory, new Date());

    logOnce('shelly', null);
    return {
      status: overpower ? 'critical' : 'good',
      currentPowerW,
      voltage,
      overpower,
      todayConsumedWh: Number(todayConsumedWh.toFixed(1)),
      todayCo2Grams: Number(co2Grams(todayConsumedWh, factor).toFixed(1)),
      lifetimeConsumedWh: Number(netLifetimeWh.toFixed(1)),
      lifetimeReturnedWh: Number(lifetimeReturnedWh.toFixed(1)),
      lifetimeCo2Grams: Number(co2Grams(netLifetimeWh, factor).toFixed(1)),
      history: shellyHistory,
      error: null,
    };
  } catch (err) {
    logOnce('shelly', err.message);
    return { status: 'critical', ...empty, error: err.message };
  }
}

// Weather changes slowly and Open-Meteo doesn't need frequent polling, so it
// runs on its own longer cycle instead of the fast main refresh loop.
const WEATHER_REFRESH_MS = ((config.weather && config.weather.refreshIntervalMinutes) || 30) * 60 * 1000;
let weatherCache = { location: null, days: [], hourly: [], error: null };

async function refreshWeatherLoop() {
  weatherCache = await refreshWeather();
}

refreshWeatherLoop();
setInterval(refreshWeatherLoop, WEATHER_REFRESH_MS);

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
  const [overview, docker, jenkins, sonarqube, postgres, pihole, shelly] = await Promise.all([
    refreshOverview(),
    refreshDocker(),
    refreshJenkins(),
    refreshSonarQube(),
    refreshPostgres(),
    refreshPihole(),
    refreshShelly(),
  ]);
  cache = { generatedAt: new Date().toISOString(), overview, docker, jenkins, sonarqube, weather: weatherCache, postgres, pihole, shelly };

  const statuses = { agent: overview.agent.status, docker: docker.status, jenkins: jenkins.status, sonarqube: sonarqube.status, postgres: postgres.status, pihole: pihole.status, shelly: shelly.status };
  const overallStatus = worstStatus(Object.values(statuses));
  const criticalSources = Object.entries(statuses).filter(([, s]) => s === 'critical').map(([name]) => name);
  await notifyOnTransition(overallStatus, criticalSources);
}

refreshAll();
setInterval(refreshAll, REFRESH_MS);

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
app.get('/api/data', requireApiKey, (req, res) => res.json(cache));
app.post('/api/refresh', requireApiKey, async (req, res) => {
  await refreshAll();
  res.json(cache);
});

// Proxies to server-agent so the browser only ever needs to know about the
// dashboard's own (optional) key, not the agent's - fetched on-demand when a
// container row is tapped, not part of the regular poll cycle.
app.get('/api/docker/:id/logs', requireApiKey, async (req, res) => {
  const { url, apiKey } = config.dockerAgent || {};
  if (!url) return res.status(503).json({ error: 'not configured' });
  try {
    const tail = Math.min(parseInt(req.query.tail, 10) || 100, 500);
    const data = await fetchJson(`${url}/api/containers/${encodeURIComponent(req.params.id)}/logs?tail=${tail}`, {
      headers: apiKey ? { 'x-api-key': apiKey } : {},
    });
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`dashboard listening on :${PORT}`);
});

// Shelly history is only written to disk every 5 minutes (SD card wear), so
// a plain systemd stop/restart (e.g. every deploy) can silently drop the most
// recent unsaved samples. Flush on the way out instead.
function shutdown(signal) {
  console.log(`[shutdown] ${signal} received, flushing Shelly history...`);
  saveShellyHistory();
  process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
