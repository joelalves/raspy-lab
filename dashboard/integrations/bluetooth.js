// Queries the local Bluetooth speaker's connection state and battery level
// (if the device reports one over BlueZ's Battery1 interface - not all
// speakers do). Runs `bluetoothctl info` directly since this only works on
// the same machine the speaker is paired to (the touchscreen Pi itself).
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);
const { logOnce } = require('../lib/log');

module.exports = function createBluetoothIntegration(config) {
  async function refreshBluetooth() {
    const mac = config.bluetooth && config.bluetooth.mac;
    const empty = { connected: false, name: null, batteryPct: null };
    if (!mac) return { status: 'warning', ...empty, error: 'not configured' };
    try {
      const { stdout } = await execFileAsync('bluetoothctl', ['info', mac], { timeout: 4000 });
      const connected = /Connected: yes/.test(stdout);
      const nameMatch = stdout.match(/^\s*Name: (.+)$/m);
      const batteryMatch = stdout.match(/Battery Percentage:.*\((\d+)\)/);
      logOnce('bluetooth', null);
      return {
        status: connected ? 'good' : 'warning',
        connected,
        name: nameMatch ? nameMatch[1].trim() : null,
        batteryPct: batteryMatch ? Number(batteryMatch[1]) : null,
        error: null,
      };
    } catch (err) {
      logOnce('bluetooth', err.message);
      return { status: 'warning', ...empty, error: err.message };
    }
  }

  return { refreshBluetooth };
};
