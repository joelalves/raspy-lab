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
