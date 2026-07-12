// SonarQube project quality gate status.
const { fetchJson } = require('../lib/http');
const { logOnce } = require('../lib/log');
const { sonarStatusToStatus, worstStatus } = require('../lib/pure');

module.exports = function createSonarQubeIntegration(config) {
  async function refreshSonarQube() {
    const { url, token } = config.sonarqube || {};
    if (!url) return { status: 'warning', projects: [], summary: 'not configured', error: 'not configured' };
    try {
      const auth = Buffer.from(`${token}:`).toString('base64');
      const headers = { Authorization: `Basic ${auth}` };
      const search = await fetchJson(`${url}/api/projects/search?ps=100`, { headers });
      const components = search.components || [];
      const projects = await Promise.all(
        components.map(async (p) => {
          try {
            const qg = await fetchJson(
              `${url}/api/qualitygates/project_status?projectKey=${encodeURIComponent(p.key)}`,
              { headers }
            );
            return {
              key: p.key,
              name: p.name,
              status: sonarStatusToStatus(qg.projectStatus.status),
              conditions: (qg.projectStatus.conditions || []).map((c) => ({
                metric: c.metricKey,
                status: sonarStatusToStatus(c.status),
                actual: c.actualValue,
              })),
            };
          } catch (err) {
            return { key: p.key, name: p.name, status: 'warning', conditions: [], error: err.message };
          }
        })
      );
      const failing = projects.filter((p) => p.status === 'critical' || p.status === 'warning').length;
      const summary = `${projects.length - failing}/${projects.length} passing`;
      logOnce('sonarqube', null);
      return { status: worstStatus(projects.map((p) => p.status)), projects, summary, error: null };
    } catch (err) {
      logOnce('sonarqube', err.message);
      return { status: 'critical', projects: [], summary: 'unreachable', error: err.message };
    }
  }

  return { refreshSonarQube };
};
