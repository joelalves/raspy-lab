// Shelly energy monitor (Gen1 EM/1PM/Plug S/etc - unauthenticated local HTTP
// API by default). Keeps its own persisted power-history sample log on disk
// since the Shelly device itself doesn't retain history.
const fs = require('fs');
const path = require('path');
const { fetchJson } = require('../lib/http');
const { logOnce } = require('../lib/log');
const { pruneHistory, sumEnergyForDay, co2Grams } = require('../lib/pure');

const SHELLY_HISTORY_PATH = path.join(__dirname, '..', 'data', 'shelly-history.json');
const SHELLY_PERSIST_INTERVAL_MS = 5 * 60 * 1000; // sample every cycle, but only persist every 5min (SD card wear)
const SHELLY_RETENTION_MS = 7 * 24 * 60 * 60 * 1000; // keep 7 days of 5-min samples

module.exports = function createShellyIntegration(config) {
  let shellyHistory = []; // [{ time: epochMs, powerW, energyWhDelta }]
  let shellyLastPersist = null; // { at: epochMs, totalWh } - meter reading at the last persisted sample

  function loadShellyHistory() {
    try {
      const parsed = JSON.parse(fs.readFileSync(SHELLY_HISTORY_PATH, 'utf8'));
      shellyHistory = Array.isArray(parsed.history) ? parsed.history : [];
      shellyLastPersist = parsed.lastPersist || null;
    } catch {
      shellyHistory = [];
      shellyLastPersist = null;
    }
  }
  loadShellyHistory();

  function saveShellyHistory() {
    try {
      fs.mkdirSync(path.dirname(SHELLY_HISTORY_PATH), { recursive: true });
      fs.writeFileSync(SHELLY_HISTORY_PATH, JSON.stringify({ history: shellyHistory, lastPersist: shellyLastPersist }));
    } catch (err) {
      console.error('[shelly] failed to persist history:', err.message);
    }
  }

  async function refreshShelly() {
    const { url, carbonIntensityGramsPerKwh } = config.shelly || {};
    const empty = {
      currentPowerW: null, voltage: null, overpower: null,
      todayConsumedWh: null, todayCo2Grams: null,
      lifetimeConsumedWh: null, lifetimeReturnedWh: null, lifetimeCo2Grams: null,
      history: [],
    };
    if (!url) return { status: 'warning', ...empty, error: 'not configured' };
    try {
      const data = await fetchJson(`${url}/status`);
      const emeters = data.emeters || [];
      const currentPowerW = Number(emeters.reduce((sum, m) => sum + (m.power || 0), 0).toFixed(1));
      const voltage = emeters.length ? Number(emeters[0].voltage.toFixed(1)) : null;
      const lifetimeConsumedWh = emeters.reduce((sum, m) => sum + (m.total || 0), 0);
      const lifetimeReturnedWh = emeters.reduce((sum, m) => sum + (m.total_returned || 0), 0);
      const netLifetimeWh = lifetimeConsumedWh - lifetimeReturnedWh;
      const overpower = (data.relays || []).some((r) => r.overpower);
      const factor = carbonIntensityGramsPerKwh || 200; // gCO2/kWh, rough Portugal grid average

      const now = Date.now();
      if (!shellyLastPersist || now - shellyLastPersist.at >= SHELLY_PERSIST_INTERVAL_MS) {
        const energyWhDelta = shellyLastPersist ? Math.max(netLifetimeWh - shellyLastPersist.totalWh, 0) : 0;
        shellyHistory.push({ time: now, powerW: currentPowerW, energyWhDelta });
        shellyHistory = pruneHistory(shellyHistory, now - SHELLY_RETENTION_MS);
        shellyLastPersist = { at: now, totalWh: netLifetimeWh };
        saveShellyHistory();
      }

      const todayConsumedWh = sumEnergyForDay(shellyHistory, new Date());

      logOnce('shelly', null);
      return {
        status: overpower ? 'critical' : 'good',
        currentPowerW,
        voltage,
        overpower,
        todayConsumedWh: Number(todayConsumedWh.toFixed(1)),
        todayCo2Grams: Number(co2Grams(todayConsumedWh, factor).toFixed(1)),
        lifetimeConsumedWh: Number(netLifetimeWh.toFixed(1)),
        lifetimeReturnedWh: Number(lifetimeReturnedWh.toFixed(1)),
        lifetimeCo2Grams: Number(co2Grams(netLifetimeWh, factor).toFixed(1)),
        history: shellyHistory,
        error: null,
      };
    } catch (err) {
      logOnce('shelly', err.message);
      return { status: 'critical', ...empty, error: err.message };
    }
  }

  return { refreshShelly, saveShellyHistory };
};
