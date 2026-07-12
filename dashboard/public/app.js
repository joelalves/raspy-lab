const POLL_MS = 8000;

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

  return renderWeatherOverviewCard(data.weather) + shTile + phTile + pgTile + dockerTile;
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
const TAP_MS = 300;
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
  const { jobName, startedAt, triggered, fillEl, timer } = jenkinsHold;
  clearTimeout(timer);
  jenkinsHold = null;
  if (triggered) return; // already firing/fired - handled in triggerJenkinsBuild
  if (fillEl) {
    fillEl.style.transition = 'width 150ms ease-out';
    fillEl.style.width = '0%';
  }
  if (Date.now() - startedAt < TAP_MS) {
    showLogModal(jobName, `/api/jenkins/${encodeURIComponent(jobName)}/log`);
  }
  // released between TAP_MS and HOLD_MS: treated as an aborted hold, no action
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

refresh();
setInterval(refresh, POLL_MS);
