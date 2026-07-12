// Tab switching, the light/dark theme toggle, and nav badge updates. No
// imports - purely DOM manipulation on elements main.js/views.js already
// rendered.
const THEME_KEY = 'raspy-dashboard-theme';

export function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  document.getElementById('theme-btn').textContent = theme === 'dark' ? '☀️' : '🌙';
}

export function switchView(view) {
  document.querySelectorAll('nav button').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${view}`));
}

export function setNavBadge(view, text, status) {
  const el = document.getElementById(`badge-${view}`);
  el.textContent = text;
  el.className = status && status !== 'good' ? status : '';
}

export { THEME_KEY };
