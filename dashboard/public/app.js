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

function statItem(label, value, statusCls) {
  return `<div class="stat-item"><span class="stat-label">${label}</span><span class="stat-value ${statusCls || ''}">${value}</span></div>`;
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
        ${statItem('CPU temp', tempVal, tempStatus(sys.cpuTempC))}
        ${statItem('Load (1m)', sys.loadAvg[0].toFixed(2))}
        ${statItem('Memory', `${sys.memory.percent}%`, pctStatus(sys.memory.percent))}
        ${statItem('Disk', diskVal, sys.disk ? pctStatus(sys.disk.percent) : '')}
        ${statItem('Uptime', formatUptime(sys.uptimeSeconds))}
        ${statItem('Host', sys.hostname)}
      </div>
    </div>`;
}

function renderOverview(data) {
  const ov = data.overview;
  const agentMeta = ov.agent.status === 'good' ? `${ov.agent.latencyMs} ms` : ov.agent.error || 'unreachable';
  return (
    card('Server agent', agentMeta, ov.agent.status) +
    renderSystemCard('Server Pi', ov.serverSystem) +
    renderSystemCard('This Pi (dashboard)', ov.dashboardSystem)
  );
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
      <div class="wc-temps">${day.tempMax}° <span class="min">${day.tempMin}°</span></div>
      <div class="wc-precip">💧 ${day.precipProbability ?? 0}%</div>
    </div>`;
}

function renderWeather(section) {
  if (section.error) return `<div class="error-msg">${section.error}</div>`;
  if (!section.days.length) return `<div class="empty">No forecast available.</div>`;
  return `
    <div class="weather-location">📍 ${section.location}</div>
    <div class="weather-row">${section.days.map(weatherDayCard).join('')}</div>`;
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

    const order = ['good', 'warning', 'serious', 'critical'];
    const worst = (statuses) => statuses.reduce((w, s) => (order.indexOf(s) > order.indexOf(w) ? s : w), 'good');
    const overall = worst([data.overview.agent.status, data.docker.status, data.jenkins.status, data.sonarqube.status]);

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

document.querySelectorAll('nav button').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('nav button').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`view-${btn.dataset.view}`).classList.add('active');
  });
});

refresh();
setInterval(refresh, POLL_MS);
