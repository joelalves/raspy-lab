// Jenkins job status, plus the one real write action in this dashboard
// (triggering a build) and on-demand console log fetching.
const express = require('express');
const { fetchJson } = require('../lib/http');
const { logOnce } = require('../lib/log');
const { requireApiKey } = require('../lib/auth');
const { jenkinsColorToStatus, worstStatus } = require('../lib/pure');

module.exports = function createJenkinsIntegration(config) {
  async function refreshJenkins() {
    const { url, user, apiToken } = config.jenkins || {};
    if (!url) return { status: 'warning', jobs: [], summary: 'not configured', error: 'not configured' };
    try {
      const auth = Buffer.from(`${user}:${apiToken}`).toString('base64');
      const data = await fetchJson(
        `${url}/api/json?tree=jobs[name,color,url,lastBuild[number,result,timestamp,duration,building]]`,
        { headers: { Authorization: `Basic ${auth}` } }
      );
      const jobs = (data.jobs || []).map((j) => ({
        name: j.name,
        url: j.url,
        building: !!(j.lastBuild && j.lastBuild.building),
        lastBuildNumber: j.lastBuild ? j.lastBuild.number : null,
        lastBuildResult: j.lastBuild ? j.lastBuild.result : null,
        lastBuildTimestamp: j.lastBuild ? j.lastBuild.timestamp : null,
        lastBuildDuration: j.lastBuild ? j.lastBuild.duration : null,
        status: jenkinsColorToStatus(j.color),
      }));
      const failing = jobs.filter((j) => j.status === 'critical' || j.status === 'serious').length;
      const building = jobs.filter((j) => j.building).length;
      const summary = `${jobs.length - failing}/${jobs.length} passing${building ? ` · ${building} building` : ''}`;
      logOnce('jenkins', null);
      return { status: worstStatus(jobs.map((j) => j.status)), jobs, summary, error: null };
    } catch (err) {
      logOnce('jenkins', err.message);
      return { status: 'critical', jobs: [], summary: 'unreachable', error: err.message };
    }
  }

  // Jenkins requires a CSRF crumb on POST requests (build triggers) unless
  // CSRF protection is disabled on the instance - fetch one per trigger
  // rather than caching it, since crumbs can be tied to the session and
  // Jenkins is cheap to ask. Missing crumbIssuer (CSRF disabled) is not an
  // error - just skip it.
  async function getJenkinsCrumb(url, authHeader) {
    try {
      const data = await fetchJson(`${url}/crumbIssuer/api/json`, { headers: { Authorization: authHeader } });
      return { field: data.crumbRequestField, value: data.crumb };
    } catch {
      return null;
    }
  }

  const router = express.Router();

  // A real write action - the only one in this dashboard. Long-press-to-
  // confirm on the frontend is the safeguard against a stray tap on the
  // touchscreen.
  router.post('/api/jenkins/:jobName/build', requireApiKey, async (req, res) => {
    const { url, user, apiToken } = config.jenkins || {};
    if (!url) return res.status(503).json({ error: 'not configured' });
    try {
      const authHeader = `Basic ${Buffer.from(`${user}:${apiToken}`).toString('base64')}`;
      const headers = { Authorization: authHeader };
      const crumb = await getJenkinsCrumb(url, authHeader);
      if (crumb) headers[crumb.field] = crumb.value;
      const jobPath = encodeURIComponent(req.params.jobName);
      const buildRes = await fetch(`${url}/job/${jobPath}/build`, { method: 'POST', headers });
      if (!buildRes.ok) {
        const body = await buildRes.text().catch(() => '');
        throw new Error(`${buildRes.status} ${buildRes.statusText}${body ? `: ${body.slice(0, 200)}` : ''}`);
      }
      res.json({ ok: true });
    } catch (err) {
      res.status(502).json({ error: err.message });
    }
  });

  router.get('/api/jenkins/:jobName/log', requireApiKey, async (req, res) => {
    const { url, user, apiToken } = config.jenkins || {};
    if (!url) return res.status(503).json({ error: 'not configured' });
    try {
      const authHeader = `Basic ${Buffer.from(`${user}:${apiToken}`).toString('base64')}`;
      const jobPath = encodeURIComponent(req.params.jobName);
      const logRes = await fetch(`${url}/job/${jobPath}/lastBuild/consoleText`, { headers: { Authorization: authHeader } });
      if (!logRes.ok) throw new Error(`${logRes.status} ${logRes.statusText}`);
      const text = await logRes.text();
      res.json({ lines: text.split('\n').filter(Boolean) });
    } catch (err) {
      res.status(502).json({ error: err.message });
    }
  });

  return { refreshJenkins, router };
};
