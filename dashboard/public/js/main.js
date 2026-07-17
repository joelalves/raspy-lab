// Entry point: wires up the poll loop, nav/theme controls, the log-viewer
// modal, and the Jenkins hold-to-build gesture, then hands off to each
// feature module's own init function. The Jenkins gesture and log modal live
// here (not in views.js, despite being Docker/Jenkins-triggered) because
// triggerJenkinsBuild() needs to call refresh() after a build starts -
// putting it in views.js would make views.js and main.js import each other.
import { worstStatus, tempStatus } from './format.js';
import { renderOverview, renderSystemTab, renderDocker, renderJenkins, renderSonarQube, renderWeather, renderPihole, renderShelly } from './views.js';
import { updateRadioUI, ingestBluetooth, initRadio } from './radio.js';
import { ingestSpotifyPoll, initSpotify } from './spotify.js';
import { initIptv } from './iptv.js';
import { switchView, applyTheme, setNavBadge, THEME_KEY } from './nav.js';

const POLL_MS = 8000;

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

    // updateRadioUI() does a surgical outerHTML swap on #radio-overview-card,
    // which only exists once renderOverview()'s HTML above has been injected
    // - keep this after the view-overview assignment.
    ingestBluetooth(data.bluetooth);
    updateRadioUI();

    ingestSpotifyPoll(data.spotify);

    const overall = worstStatus([data.overview.agent.status, data.docker.status, data.jenkins.status, data.sonarqube.status, data.postgres.status, data.pihole.status, data.shelly.status]);

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

initRadio();
initSpotify();
initIptv();

refresh();
setInterval(refresh, POLL_MS);
