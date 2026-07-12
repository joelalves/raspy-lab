// Intentionally near-identical to dashboard/system-info.js (same logic, this
// header comment aside). This runs on the server Pi as part of server-agent;
// the twin runs on the touchscreen Pi as part of the dashboard - two
// completely separate deployed processes with no shared package/monorepo
// tooling between them, so duplication is the pragmatic choice here - just
// keep both copies' logic in sync if you change this file.
const os = require('os');
const fs = require('fs');
const { execSync } = require('child_process');

function readCpuTempC() {
  try {
    const raw = fs.readFileSync('/sys/class/thermal/thermal_zone0/temp', 'utf8');
    return Math.round(parseInt(raw, 10) / 100) / 10;
  } catch {
    return null; // not a Raspberry Pi / thermal zone unavailable
  }
}

function readModelFromCpuinfo() {
  try {
    const content = fs.readFileSync('/proc/cpuinfo', 'utf8');
    const match = content.match(/^Model\s*:\s*(.+)$/m);
    return match ? match[1].trim() : null;
  } catch {
    return null;
  }
}

function readModel() {
  // /proc/cpuinfo is standard procfs - it reflects the real host CPU/hardware
  // even inside a container, no bind mount needed, and Raspberry Pi kernels
  // append a human-readable "Model" line to it directly. Try that first.
  const fromCpuinfo = readModelFromCpuinfo();
  if (fromCpuinfo) return fromCpuinfo;

  // Fallback: device-tree firmware string, e.g. "Raspberry Pi 4 Model B Rev
  // 1.4" (null-terminated, not a real line). /proc/device-tree is usually a
  // symlink to /sys/firmware/devicetree/base - bind-mounting a symlink path
  // doesn't reliably carry the target into a container - try both.
  for (const p of ['/proc/device-tree/model', '/sys/firmware/devicetree/base/model']) {
    try {
      return fs.readFileSync(p, 'utf8').replace(/\0/g, '').trim();
    } catch {
      // try the next candidate
    }
  }
  return null; // not a Raspberry Pi, or nothing is mounted/available
}

function readOsPrettyName() {
  try {
    const content = fs.readFileSync('/etc/os-release', 'utf8');
    const match = content.match(/^PRETTY_NAME="?([^"\n]+)"?/m);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

function readDiskUsage(mount = '/') {
  try {
    const out = execSync(`df -Pk ${mount}`, { encoding: 'utf8' });
    const parts = out.trim().split('\n')[1].trim().split(/\s+/);
    const totalKb = parseInt(parts[1], 10);
    const usedKb = parseInt(parts[2], 10);
    return {
      totalBytes: totalKb * 1024,
      usedBytes: usedKb * 1024,
      percent: Number(((usedKb / totalKb) * 100).toFixed(1)),
    };
  } catch {
    return null;
  }
}

function getSystemInfo() {
  const totalMem = os.totalmem();
  const usedMem = totalMem - os.freemem();
  return {
    hostname: os.hostname(),
    model: readModel(),
    osName: readOsPrettyName(),
    kernel: os.release(),
    uptimeSeconds: os.uptime(),
    loadAvg: os.loadavg(),
    cpuCount: os.cpus().length,
    cpuTempC: readCpuTempC(),
    memory: {
      totalBytes: totalMem,
      usedBytes: usedMem,
      percent: Number(((usedMem / totalMem) * 100).toFixed(1)),
    },
    disk: readDiskUsage('/'),
  };
}

module.exports = { getSystemInfo };
