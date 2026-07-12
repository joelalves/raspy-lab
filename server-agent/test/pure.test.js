const test = require('node:test');
const assert = require('node:assert/strict');
const { cpuPercent, memPercent, demuxDockerLogs } = require('../lib/pure');

test('cpuPercent', async (t) => {
  await t.test('computes percent from the delta between two samples', () => {
    const stats = {
      cpu_stats: { cpu_usage: { total_usage: 300 }, system_cpu_usage: 1000, online_cpus: 2 },
      precpu_stats: { cpu_usage: { total_usage: 100 }, system_cpu_usage: 800 },
    };
    // cpuDelta=200, systemDelta=200, cpuCount=2 -> (200/200)*2*100 = 200
    assert.equal(cpuPercent(stats), 200);
  });
  await t.test('falls back to counting percpu_usage entries when online_cpus is missing', () => {
    const stats = {
      cpu_stats: { cpu_usage: { total_usage: 300, percpu_usage: [1, 2] }, system_cpu_usage: 1000 },
      precpu_stats: { cpu_usage: { total_usage: 100 }, system_cpu_usage: 800 },
    };
    assert.equal(cpuPercent(stats), 200); // same math, cpuCount=2 from percpu_usage.length
  });
  await t.test('returns 0 when the container is idle or stats have not advanced', () => {
    const stats = {
      cpu_stats: { cpu_usage: { total_usage: 100 }, system_cpu_usage: 800, online_cpus: 1 },
      precpu_stats: { cpu_usage: { total_usage: 100 }, system_cpu_usage: 800 },
    };
    assert.equal(cpuPercent(stats), 0);
  });
});

test('memPercent', async (t) => {
  await t.test('subtracts page cache from usage before dividing by the limit', () => {
    const stats = { memory_stats: { usage: 500, stats: { cache: 100 }, limit: 1000 } };
    assert.equal(memPercent(stats), 40); // (500-100)/1000 * 100
  });
  await t.test('handles missing cache/stats gracefully', () => {
    const stats = { memory_stats: { usage: 250, limit: 1000 } };
    assert.equal(memPercent(stats), 25);
  });
});

// Builds a Docker multiplexed log frame: 8-byte header (1 byte stream type,
// 3 reserved, 4-byte big-endian payload length) + payload.
function frame(text) {
  const payload = Buffer.from(text, 'utf8');
  const header = Buffer.alloc(8);
  header.writeUInt32BE(payload.length, 4);
  return Buffer.concat([header, payload]);
}

test('demuxDockerLogs', async (t) => {
  await t.test('strips framing and splits into lines', () => {
    const buffer = Buffer.concat([frame('line one\n'), frame('line two\n')]);
    assert.deepEqual(demuxDockerLogs(buffer), ['line one', 'line two']);
  });
  await t.test('drops empty trailing lines', () => {
    const buffer = frame('only line\n\n');
    assert.deepEqual(demuxDockerLogs(buffer), ['only line']);
  });
  await t.test('empty buffer yields no lines', () => {
    assert.deepEqual(demuxDockerLogs(Buffer.alloc(0)), []);
  });
});
