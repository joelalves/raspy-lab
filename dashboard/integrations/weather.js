// Local weather via Open-Meteo (free, no API key). Owns its own refresh
// cadence rather than participating in the main poll cycle - weather changes
// slowly and Open-Meteo doesn't need frequent polling - so it exposes
// startWeatherLoop()/getWeatherCache() instead of a plain refresh function.
const { fetchJson } = require('../lib/http');
const { logOnce } = require('../lib/log');
const { weatherCodeInfo } = require('../lib/pure');

module.exports = function createWeatherIntegration(config) {
  let resolvedLocation = null; // cached so we only geocode once per process

  async function resolveLocation() {
    if (resolvedLocation) return resolvedLocation;
    const w = config.weather || {};
    if (w.latitude != null && w.longitude != null) {
      resolvedLocation = { latitude: w.latitude, longitude: w.longitude, name: w.locationName || `${w.latitude}, ${w.longitude}` };
      return resolvedLocation;
    }
    if (w.location) {
      const geo = await fetchJson(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(w.location)}&count=1`);
      if (!geo.results || !geo.results.length) throw new Error(`location "${w.location}" not found`);
      const r = geo.results[0];
      const parts = [r.name, r.admin1, r.country].filter(Boolean);
      resolvedLocation = { latitude: r.latitude, longitude: r.longitude, name: parts.join(', ') };
      return resolvedLocation;
    }
    throw new Error('not configured');
  }

  async function refreshWeather() {
    const w = config.weather || {};
    if (!w.location && (w.latitude == null || w.longitude == null)) {
      return { location: null, days: [], hourly: [], error: 'not configured' };
    }
    try {
      const loc = await resolveLocation();
      const data = await fetchJson(
        `https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}` +
          `&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max,windspeed_10m_max,uv_index_max` +
          `&hourly=temperature_2m,weathercode,precipitation_probability` +
          `&current_weather=true&timezone=auto&forecast_days=5`
      );
      const days = data.daily.time.map((date, i) => {
        const [icon, label] = weatherCodeInfo(data.daily.weathercode[i]);
        return {
          date,
          icon,
          label,
          tempMax: Math.round(data.daily.temperature_2m_max[i]),
          tempMin: Math.round(data.daily.temperature_2m_min[i]),
          precipProbability: data.daily.precipitation_probability_max[i],
          windSpeedKmh: Math.round(data.daily.windspeed_10m_max[i]),
          uvIndex: Math.round(data.daily.uv_index_max[i]),
        };
      });

      const nowLocal = data.current_weather.time; // e.g. "2026-07-10T14:00", same tz as hourly.time
      const hourly = data.hourly.time
        .map((time, i) => ({
          time,
          code: data.hourly.weathercode[i],
          tempC: Math.round(data.hourly.temperature_2m[i]),
          precipProbability: data.hourly.precipitation_probability[i],
        }))
        .filter((h) => h.time >= nowLocal)
        .slice(0, 10) // next ~10 hours, crossing into tomorrow near midnight if needed
        .map((h) => {
          const [icon, label] = weatherCodeInfo(h.code);
          return { time: h.time, icon, label, tempC: h.tempC, precipProbability: h.precipProbability };
        });

      logOnce('weather', null);
      return { location: loc.name, days, hourly, error: null };
    } catch (err) {
      logOnce('weather', err.message);
      return { location: null, days: [], hourly: [], error: err.message };
    }
  }

  const WEATHER_REFRESH_MS = ((config.weather && config.weather.refreshIntervalMinutes) || 30) * 60 * 1000;
  let weatherCache = { location: null, days: [], hourly: [], error: null };

  async function refreshWeatherLoop() {
    weatherCache = await refreshWeather();
  }

  function startWeatherLoop() {
    refreshWeatherLoop();
    setInterval(refreshWeatherLoop, WEATHER_REFRESH_MS);
  }

  function getWeatherCache() {
    return weatherCache;
  }

  return { startWeatherLoop, getWeatherCache };
};
