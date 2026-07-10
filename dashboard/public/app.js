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

function statItem(label, value, statusCls, wide) {
  return `<div class="stat-item${wide ? ' wide' : ''}"><span class="stat-label">${label}</span><span class="stat-value ${statusCls || ''}">${value}</span></div>`;
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
        ${statItem('CPU temp', tempVal, tempStatus(sys.cpuTempC))}
        ${statItem('Load (1m)', sys.loadAvg[0].toFixed(2))}
        ${statItem('Memory', `${sys.memory.percent}%`, pctStatus(sys.memory.percent))}
        ${statItem('Disk', diskVal, sys.disk ? pctStatus(sys.disk.percent) : '')}
        ${statItem('Uptime', formatUptime(sys.uptimeSeconds))}
      </div>
    </div>`;
}

function quickTile(view, title, meta, status) {
  return `<div class="card quick-tile" data-jump="${view}"><span class="dot ${status}"></span><span class="name">${title}</span><span class="meta">${meta}</span></div>`;
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
  const ov = data.overview;
  const agentMeta = ov.agent.status === 'good' ? `${ov.agent.latencyMs} ms` : ov.agent.error || 'unreachable';
  const pg = data.postgres;
  const pgMeta = pg.status === 'good'
    ? `${pg.connections} conn · ${formatBytes(pg.databaseSizeBytes)} · ${pg.version}`
    : pg.error || 'unreachable';
  const ph = data.pihole;
  const phMeta = ph.percentBlocked != null
    ? `${ph.enabled ? 'enabled' : 'disabled'} · ${ph.percentBlocked}% blocked · ${ph.queriesToday} queries`
    : ph.error || 'unreachable';
  return (
    card('Server agent', agentMeta, ov.agent.status) +
    quickTile('docker', 'Docker', data.docker.summary, data.docker.status) +
    card('PostgreSQL', pgMeta, pg.status) +
    quickTile('pihole', 'Pi-hole', phMeta, ph.status) +
    renderWeatherOverviewCard(data.weather)
  );
}

function renderSystemTab(data) {
  const ov = data.overview;
  return renderSystemCard('Server Pi', ov.serverSystem) + renderSystemCard('This Pi (dashboard)', ov.dashboardSystem);
}

function renderDocker(section) {
  if (section.error) return `<div class="error-msg">${section.error}</div>`;
  if (!section.containers.length) return `<div class="empty">No containers found.</div>`;
  return section.containers
    .map((c) =>
      card(
        c.name,
        c.state === 'running'
          ? `CPU ${c.cpuPercent}% · Mem ${c.memPercent}% (${formatBytes(c.memUsage)})`
          : c.state,
        c.status
      )
    )
    .join('');
}

function renderJenkins(section) {
  if (section.error) return `<div class="error-msg">${section.error}</div>`;
  if (!section.jobs.length) return `<div class="empty">No Jenkins jobs found.</div>`;
  return section.jobs
    .map((j) =>
      card(
        j.name,
        j.building ? 'building…' : `#${j.lastBuildNumber ?? '—'} · ${formatAgo(j.lastBuildTimestamp)} · ${formatDuration(j.lastBuildDuration)}`,
        j.status
      )
    )
    .join('');
}

function renderSonarQube(section) {
  if (section.error) return `<div class="error-msg">${section.error}</div>`;
  if (!section.projects.length) return `<div class="empty">No SonarQube projects found.</div>`;
  return section.projects
    .map((p) => {
      const failing = (p.conditions || []).filter((c) => c.status !== 'good');
      const meta = failing.length ? failing.map((c) => `${c.metric}: ${c.actual}`).join(', ') : 'quality gate passed';
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

    const order = ['good', 'warning', 'serious', 'critical'];
    const worst = (statuses) => statuses.reduce((w, s) => (order.indexOf(s) > order.indexOf(w) ? s : w), 'good');
    const overall = worst([data.overview.agent.status, data.docker.status, data.jenkins.status, data.sonarqube.status, data.postgres.status, data.pihole.status]);

    const badgeDot = document.querySelector('#overall-badge .dot');
    badgeDot.className = `dot ${overall}`;
    document.getElementById('overall-text').textContent =
      overall === 'good' ? 'All systems operational' : `Attention needed (${overall})`;

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

refresh();
setInterval(refresh, POLL_MS);
