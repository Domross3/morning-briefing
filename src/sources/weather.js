// Ann Arbor weather header for the top of the brief.
//
// Source: Open-Meteo (free, no API key, no rate limits). Returns four
// numbers the user asked for: high, peak wind, rain probability/window,
// 11 PM temp. All units in user-friendly formats (°F, mph).
import { fetchJson } from "../lib/fetch.js";

// Ann Arbor, Michigan.
const LAT = 42.281;
const LON = -83.748;
const TZ = "America/New_York";

const ENDPOINT =
  `https://api.open-meteo.com/v1/forecast` +
  `?latitude=${LAT}&longitude=${LON}` +
  `&hourly=temperature_2m,precipitation_probability,wind_speed_10m,wind_gusts_10m` +
  `&daily=temperature_2m_max,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max,weather_code` +
  `&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch` +
  `&timezone=${encodeURIComponent(TZ)}&forecast_days=1`;

export async function collectWeather({ userAgent }) {
  try {
    const data = await fetchJson(ENDPOINT, { userAgent, timeoutMs: 6000 });
    return buildSummary(data);
  } catch {
    return null; // graceful: brief still renders without the weather header
  }
}

function buildSummary(data) {
  if (!data?.hourly || !data?.daily) return null;

  const high = Math.round(data.daily.temperature_2m_max?.[0]);
  const peakWind = Math.round(data.daily.wind_speed_10m_max?.[0]);
  const peakGust = Math.round(data.daily.wind_gusts_10m_max?.[0]);
  const code = data.daily.weather_code?.[0];

  // 11 PM temp — index by matching the hourly time strings.
  const elevenPm = findHourlyValue(data.hourly, 23, "temperature_2m");
  const elevenPmTemp = elevenPm != null ? Math.round(elevenPm) : null;

  const rain = describeRainWindow(
    data.hourly.time || [],
    data.hourly.precipitation_probability || [],
  );

  return {
    high,
    peakWind,
    peakGust,
    elevenPmTemp,
    rain,
    conditions: weatherCodeToLabel(code),
  };
}

// Match a 24h-hour value in the hourly time array. Returns null if not found.
function findHourlyValue(hourly, targetHour, field) {
  const times = hourly.time || [];
  const values = hourly[field] || [];
  for (let i = 0; i < times.length; i++) {
    // Times are "2026-05-19T23:00" — last two digits before ":00" = hour.
    const m = times[i].match(/T(\d{2}):/);
    if (m && parseInt(m[1], 10) === targetHour) {
      return values[i];
    }
  }
  return null;
}

// Find the dominant rain window of the day. Returns null if the day is
// essentially dry (peak probability < 20%).
function describeRainWindow(times, probabilities) {
  if (!probabilities.length) return null;
  const peak = Math.max(...probabilities);
  if (peak < 20) return { peak, window: null };

  // Threshold for a "notable" rain window — half the peak, floor at 30%.
  const threshold = Math.max(30, peak / 2);
  const windows = [];
  let start = null;
  for (let i = 0; i < probabilities.length; i++) {
    if (probabilities[i] >= threshold) {
      if (start == null) start = i;
    } else if (start != null) {
      windows.push([start, i - 1]);
      start = null;
    }
  }
  if (start != null) windows.push([start, probabilities.length - 1]);

  // Take the longest window (or first if tied).
  if (!windows.length) return { peak, window: null };
  const longest = windows.reduce((best, w) =>
    w[1] - w[0] > best[1] - best[0] ? w : best,
  );

  const startHour = hourFromTime(times[longest[0]]);
  const endHour = hourFromTime(times[longest[1]]);
  return {
    peak,
    window: { startHour, endHour, label: hourRangeLabel(startHour, endHour + 1) },
  };
}

function hourFromTime(t) {
  const m = t.match(/T(\d{2}):/);
  return m ? parseInt(m[1], 10) : 0;
}

function hourRangeLabel(start, end) {
  return `${formatHour(start)}–${formatHour(end === 24 ? 0 : end)}`;
}

function formatHour(hour) {
  if (hour === 0) return "12 AM";
  if (hour === 12) return "12 PM";
  if (hour < 12) return `${hour} AM`;
  return `${hour - 12} PM`;
}

// WMO weather code → short human label.
// Reference: https://open-meteo.com/en/docs (weather_code table).
function weatherCodeToLabel(code) {
  if (code == null) return null;
  if (code === 0) return "Clear";
  if (code === 1) return "Mostly clear";
  if (code === 2) return "Partly cloudy";
  if (code === 3) return "Overcast";
  if (code >= 45 && code <= 48) return "Fog";
  if (code >= 51 && code <= 57) return "Drizzle";
  if (code >= 61 && code <= 67) return "Rain";
  if (code >= 71 && code <= 77) return "Snow";
  if (code >= 80 && code <= 82) return "Rain showers";
  if (code >= 85 && code <= 86) return "Snow showers";
  if (code >= 95) return "Thunderstorm";
  return null;
}
