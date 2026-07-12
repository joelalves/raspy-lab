// Logs to stdout (visible via `journalctl -u dashboard.service`), but only on
// change - so a persistent failure logs once instead of once per poll cycle.
// Shared across all integrations, keyed by their own source name (e.g.
// 'docker', 'spotify') so each tracks its own change state independently.
const lastLogged = {};
function logOnce(source, message) {
  if (lastLogged[source] === message) return;
  lastLogged[source] = message;
  if (message) console.error(`[${source}] ${message}`);
  else console.log(`[${source}] recovered`);
}

module.exports = { logOnce };
