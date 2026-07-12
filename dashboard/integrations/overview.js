// The "Agent" status shown in the header: pings server-agent (round-trip
// latency doubles as the health check) and reports this Pi's own system
// stats alongside whatever server-agent reports for the server Pi.
const { fetchJson } = require('../lib/http');
const { logOnce } = require('../lib/log');
const { getSystemInfo } = require('../system-info');

module.exports = function createOverviewIntegration(config) {
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

  return { refreshOverview };
};
