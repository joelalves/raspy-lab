// Docker container status, proxied from server-agent (the dashboard itself
// has no Docker socket access - server-agent runs on the server Pi, where
// the containers actually are).
const express = require('express');
const { fetchJson } = require('../lib/http');
const { logOnce } = require('../lib/log');
const { requireApiKey } = require('../lib/auth');
const { worstStatus } = require('../lib/pure');

module.exports = function createDockerIntegration(config) {
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

  // Proxies to server-agent so the browser only ever needs to know about the
  // dashboard's own (optional) key, not the agent's - fetched on-demand when
  // a container row is tapped, not part of the regular poll cycle.
  const router = express.Router();
  router.get('/api/docker/:id/logs', requireApiKey, async (req, res) => {
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

  return { refreshDocker, router };
};
