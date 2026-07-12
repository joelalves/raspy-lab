// Pure, deterministic logic pulled out of index.js so it can be unit-tested
// without a real Docker daemon or Postgres connection. Nothing in here does
// I/O. Mirrors the same pattern as dashboard/lib/pure.js.

// Docker's stats API reports cumulative CPU-nanosecond counters, not a
// percentage - has to be derived from the delta between two consecutive
// samples (which `container.stats()` already gives us: current + "pre").
function cpuPercent(stats) {
  const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
  const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
  const cpuCount = stats.cpu_stats.online_cpus || (stats.cpu_stats.cpu_usage.percpu_usage || []).length || 1;
  if (systemDelta <= 0 || cpuDelta <= 0) return 0;
  return (cpuDelta / systemDelta) * cpuCount * 100;
}

// Subtracts page cache from Docker's reported memory usage - otherwise
// containers that have merely read a lot of files (page cache, reclaimable
// under pressure) look like they're using far more memory than they are.
function memPercent(stats) {
  const cache = (stats.memory_stats.stats && stats.memory_stats.stats.cache) || 0;
  const usage = (stats.memory_stats.usage || 0) - cache;
  const limit = stats.memory_stats.limit || 1;
  return (usage / limit) * 100;
}

// Docker's log stream is multiplexed per-frame (8-byte header: 1 byte stream
// type, 3 reserved, 4 byte big-endian payload length) whenever the container
// wasn't started with a TTY - which is every container in a typical compose
// stack. Strip the framing to get plain text lines back.
function demuxDockerLogs(buffer) {
  const chunks = [];
  let offset = 0;
  while (offset + 8 <= buffer.length) {
    const size = buffer.readUInt32BE(offset + 4);
    chunks.push(buffer.slice(offset + 8, offset + 8 + size));
    offset += 8 + size;
  }
  return Buffer.concat(chunks).toString('utf8').split('\n').filter(Boolean);
}

module.exports = { cpuPercent, memPercent, demuxDockerLogs };
