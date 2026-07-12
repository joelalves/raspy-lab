// Pure, DOM-free formatting/status helpers shared across the dashboard's
// view renderers. No imports, no side effects - safe to unit-test directly
// (see dashboard/test/format.test.js), unlike everything else in public/js/
// which touches the DOM.

export function formatBytes(bytes) {
  if (!bytes) return '0 MB';
  const mb = bytes / (1024 * 1024);
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(0)} MB`;
}

export function formatDuration(ms) {
  if (!ms) return '—';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

export function formatAgo(timestamp) {
  if (!timestamp) return '—';
  const diffMin = Math.round((Date.now() - timestamp) / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  return `${Math.round(diffH / 24)}d ago`;
}

export function formatUptime(seconds) {
  if (!seconds && seconds !== 0) return 'n/a';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function pctStatus(p) {
  if (p == null) return '';
  if (p >= 90) return 'critical';
  if (p >= 75) return 'warning';
  return '';
}

export function tempStatus(c) {
  if (c == null) return '';
  if (c >= 75) return 'critical';
  if (c >= 65) return 'warning';
  return '';
}

export function formatCo2(grams) {
  return grams >= 1000 ? `${(grams / 1000).toFixed(2)} kg` : `${Math.round(grams)} g`;
}

export function formatBuildResult(result) {
  if (!result) return null;
  return result.charAt(0) + result.slice(1).toLowerCase(); // SUCCESS -> Success
}

export function formatMs(ms) {
  if (ms == null || !Number.isFinite(ms)) return '0:00';
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

// Escalates a list of per-source statuses ('good'/'warning'/'serious'/
// 'critical') to the single worst one present - used for the header's
// overall dot and any tile that summarizes multiple sub-statuses.
export function worstStatus(statuses) {
  const order = ['good', 'warning', 'serious', 'critical'];
  return statuses.reduce((worst, s) => (order.indexOf(s) > order.indexOf(worst) ? s : worst), 'good');
}
