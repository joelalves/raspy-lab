// Pure, deterministic logic pulled out of server.js so it can be unit-tested
// without spinning up the whole app (config.json, network calls, timers).
// Nothing in here does I/O.

function worstStatus(statuses) {
  const order = ['good', 'warning', 'serious', 'critical'];
  return statuses.reduce((worst, s) => (order.indexOf(s) > order.indexOf(worst) ? s : worst), 'good');
}

function jenkinsColorToStatus(color) {
  if (!color) return 'warning';
  const base = color.replace('_anime', '');
  if (base === 'blue') return 'good';
  if (base === 'yellow') return 'warning';
  if (base === 'red') return 'critical';
  if (base === 'aborted') return 'serious';
  return 'warning'; // grey/disabled/notbuilt
}

function sonarStatusToStatus(status) {
  if (status === 'OK') return 'good';
  if (status === 'WARN') return 'warning';
  if (status === 'ERROR') return 'critical';
  return 'warning'; // NONE / unknown
}

// WMO weather codes -> [emoji, label]. https://open-meteo.com/en/docs
const WEATHER_CODES = {
  0: ['☀️', 'Clear'], 1: ['🌤️', 'Mostly clear'], 2: ['⛅', 'Partly cloudy'], 3: ['☁️', 'Overcast'],
  45: ['🌫️', 'Fog'], 48: ['🌫️', 'Fog'],
  51: ['🌦️', 'Light drizzle'], 53: ['🌦️', 'Drizzle'], 55: ['🌦️', 'Heavy drizzle'],
  56: ['🌧️', 'Freezing drizzle'], 57: ['🌧️', 'Freezing drizzle'],
  61: ['🌧️', 'Light rain'], 63: ['🌧️', 'Rain'], 65: ['🌧️', 'Heavy rain'],
  66: ['🌧️', 'Freezing rain'], 67: ['🌧️', 'Freezing rain'],
  71: ['🌨️', 'Light snow'], 73: ['🌨️', 'Snow'], 75: ['🌨️', 'Heavy snow'], 77: ['🌨️', 'Snow grains'],
  80: ['🌦️', 'Rain showers'], 81: ['🌦️', 'Rain showers'], 82: ['⛈️', 'Violent showers'],
  85: ['🌨️', 'Snow showers'], 86: ['🌨️', 'Snow showers'],
  95: ['⛈️', 'Thunderstorm'], 96: ['⛈️', 'Thunderstorm w/ hail'], 99: ['⛈️', 'Thunderstorm w/ hail'],
};

function weatherCodeInfo(code) {
  return WEATHER_CODES[code] || ['❓', 'Unknown'];
}

function isSameLocalDay(epochMs, ref) {
  const a = new Date(epochMs);
  return a.getFullYear() === ref.getFullYear() && a.getMonth() === ref.getMonth() && a.getDate() === ref.getDate();
}

function pruneHistory(history, cutoffMs) {
  return history.filter((h) => h.time >= cutoffMs);
}

function sumEnergyForDay(history, dayRef) {
  return history.filter((h) => isSameLocalDay(h.time, dayRef)).reduce((sum, h) => sum + h.energyWhDelta, 0);
}

function co2Grams(wh, factorGramsPerKwh) {
  return (wh / 1000) * factorGramsPerKwh;
}

module.exports = {
  worstStatus,
  jenkinsColorToStatus,
  sonarStatusToStatus,
  weatherCodeInfo,
  isSameLocalDay,
  pruneHistory,
  sumEnergyForDay,
  co2Grams,
};
