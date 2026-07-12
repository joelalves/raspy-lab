// Postgres health, proxied from server-agent (same as Docker - the dashboard
// itself has no DB credentials or network path to the server Pi's database).
const { fetchJson } = require('../lib/http');
const { logOnce } = require('../lib/log');

module.exports = function createPostgresIntegration(config) {
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

  return { refreshPostgres };
};
