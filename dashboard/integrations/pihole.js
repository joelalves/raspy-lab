// Pi-hole v6 stats, via its own session-based API (the same one the web UI
// uses) - there's no long-lived API key to configure, just the admin
// password.
const { fetchJson } = require('../lib/http');
const { logOnce } = require('../lib/log');

module.exports = function createPiholeIntegration(config) {
  let piholeSession = null; // { sid, expiresAt } - cached across polls, Pi-hole sessions expire

  async function piholeAuth() {
    const { url, password } = config.pihole || {};
    // Pi-hole returns HTTP 401 even for a wrong password (not 200 +
    // valid:false), so parse the body ourselves instead of going through
    // fetchJson - its !res.ok check would throw before we get a chance to
    // read session.message.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    let data;
    try {
      const res = await fetch(`${url}/api/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
        signal: controller.signal,
      });
      data = await res.json();
    } finally {
      clearTimeout(timer);
    }
    if (!data.session || !data.session.valid) {
      throw new Error((data.session && data.session.message) || (data.error && data.error.message) || 'authentication failed');
    }
    piholeSession = {
      sid: data.session.sid,
      expiresAt: Date.now() + Math.max(data.session.validity - 30, 10) * 1000,
    };
    return piholeSession.sid;
  }

  async function getPiholeSid() {
    if (piholeSession && Date.now() < piholeSession.expiresAt) return piholeSession.sid;
    return piholeAuth();
  }

  async function refreshPihole() {
    const { url, password } = config.pihole || {};
    const empty = {
      enabled: null,
      queriesToday: null,
      blockedToday: null,
      percentBlocked: null,
      domainsBlocked: null,
      activeClients: null,
      topBlocked: [],
      topPermitted: [],
    };
    if (!url || !password) return { status: 'warning', ...empty, error: 'not configured' };
    try {
      const sid = await getPiholeSid();
      const headers = { 'X-FTL-SID': sid };
      const [blocking, summary, topBlockedData, topPermittedData] = await Promise.all([
        fetchJson(`${url}/api/dns/blocking`, { headers }),
        fetchJson(`${url}/api/stats/summary`, { headers }),
        fetchJson(`${url}/api/stats/top_domains?blocked=true&count=8`, { headers }),
        fetchJson(`${url}/api/stats/top_domains?count=8`, { headers }),
      ]);
      const enabled = blocking.blocking === 'enabled';
      const toList = (data) => (data.domains || []).map((d) => ({ domain: d.domain, count: d.count }));
      logOnce('pihole', null);
      return {
        status: enabled ? 'good' : 'warning',
        enabled,
        queriesToday: summary.queries.total,
        blockedToday: summary.queries.blocked,
        percentBlocked: Number((summary.queries.percent_blocked ?? 0).toFixed(1)),
        domainsBlocked: summary.gravity.domains_being_blocked,
        activeClients: summary.clients ? summary.clients.active : null,
        topBlocked: toList(topBlockedData),
        topPermitted: toList(topPermittedData),
        error: null,
      };
    } catch (err) {
      piholeSession = null; // force re-auth next cycle - session may be invalid/expired
      logOnce('pihole', err.message);
      return { status: 'critical', ...empty, error: err.message };
    }
  }

  return { refreshPihole };
};
