const express = require('express');
const Docker = require('dockerode');
const { Client } = require('pg');
const { getSystemInfo } = require('./system-info');

const PORT = process.env.PORT || 9090;
const API_KEY = process.env.AGENT_API_KEY || '';

const docker = new Docker({ socketPath: '/var/run/docker.sock' });
const app = express();

app.use((req, res, next) => {
  if (!API_KEY) return next();
  if (req.get('x-api-key') === API_KEY) return next();
  return res.status(401).json({ error: 'unauthorized' });
});

function cpuPercent(stats) {
  const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
  const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
  const cpuCount = stats.cpu_stats.online_cpus || (stats.cpu_stats.cpu_usage.percpu_usage || []).length || 1;
  if (systemDelta <= 0 || cpuDelta <= 0) return 0;
  return (cpuDelta / systemDelta) * cpuCount * 100;
}

function memPercent(stats) {
  const cache = (stats.memory_stats.stats && stats.memory_stats.stats.cache) || 0;
  const usage = (stats.memory_stats.usage || 0) - cache;
  const limit = stats.memory_stats.limit || 1;
  return (usage / limit) * 100;
}

app.get('/api/containers', async (req, res) => {
  try {
    const containers = await docker.listContainers({ all: true });
    const results = await Promise.all(containers.map(async (c) => {
      const name = (c.Names[0] || '').replace(/^\//, '');
      const base = {
        id: c.Id.slice(0, 12),
        name,
        image: c.Image,
        state: c.State,
        status: c.Status,
        createdAt: c.Created,
      };
      if (c.State !== 'running') {
        return { ...base, cpuPercent: 0, memPercent: 0, memUsage: 0, memLimit: 0 };
      }
      try {
        const container = docker.getContainer(c.Id);
        const stats = await container.stats({ stream: false });
        const cache = (stats.memory_stats.stats && stats.memory_stats.stats.cache) || 0;
        return {
          ...base,
          cpuPercent: Number(cpuPercent(stats).toFixed(1)),
          memPercent: Number(memPercent(stats).toFixed(1)),
          memUsage: (stats.memory_stats.usage || 0) - cache,
          memLimit: stats.memory_stats.limit || 0,
        };
      } catch (err) {
        return { ...base, cpuPercent: 0, memPercent: 0, memUsage: 0, memLimit: 0, error: err.message };
      }
    }));
    res.json({ generatedAt: new Date().toISOString(), containers: results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Connection details come from standard PG* env vars (PGHOST, PGPORT, PGUSER,
// PGPASSWORD, PGDATABASE), which `pg` reads automatically, or DATABASE_URL if
// set. Not the app's own DB credentials - a dedicated read-only monitoring
// user is recommended (see server-agent/docker-compose.snippet.yml).
async function checkPostgres() {
  const client = new Client(
    process.env.DATABASE_URL
      ? { connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 3000 }
      : { connectionTimeoutMillis: 3000 }
  );
  const start = Date.now();
  try {
    await client.connect();
    const [versionResult, connResult, sizeResult] = await Promise.all([
      client.query('SELECT version()'),
      client.query('SELECT count(*)::int AS count FROM pg_stat_activity'),
      client.query('SELECT pg_database_size(current_database()) AS size'),
    ]);
    await client.end();
    return {
      status: 'good',
      latencyMs: Date.now() - start,
      version: versionResult.rows[0].version.split(' ').slice(0, 2).join(' '),
      connections: connResult.rows[0].count,
      databaseSizeBytes: Number(sizeResult.rows[0].size),
      error: null,
    };
  } catch (err) {
    try { await client.end(); } catch { /* already closed/never opened */ }
    return { status: 'critical', latencyMs: null, version: null, connections: null, databaseSizeBytes: null, error: err.message };
  }
}

app.get('/api/postgres', async (req, res) => {
  res.json(await checkPostgres());
});

app.get('/api/system', (req, res) => {
  try {
    res.json(getSystemInfo());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/healthz', (req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`server-agent listening on :${PORT}`);
});
