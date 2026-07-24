/**
 * Open-Meteo integration: 7-day forecast + geocoding, and the mapping from
 * a day's weather to a cooking "mood" that biases meal suggestions.
 */

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast'
const GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search'

/** Fetch daily forecast keyed by ISO date. Temperatures are Celsius. */
export async function fetchForecast(lat, lon) {
  const params = new URLSearchParams({
    latitude: lat,
    longitude: lon,
    daily: 'weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
    timezone: 'auto',
    forecast_days: '14',
  })
  const res = await fetch(`${FORECAST_URL}?${params}`)
  if (!res.ok) throw new Error(`Forecast request failed (${res.status})`)
  const data = await res.json()
  const out = {}
  const { time, weathercode, temperature_2m_max, temperature_2m_min, precipitation_probability_max } = data.daily
  time.forEach((iso, i) => {
    out[iso] = {
      code: weathercode[i],
      tMax: temperature_2m_max[i],
      tMin: temperature_2m_min[i],
      precipProb: precipitation_probability_max?.[i] ?? 0,
    }
  })
  return out
}

/** City-name search → [{name, admin1, country, latitude, longitude}] */
export async function geocodeCity(query) {
  const params = new URLSearchParams({ name: query, count: '5', language: 'en', format: 'json' })
  const res = await fetch(`${GEOCODE_URL}?${params}`)
  if (!res.ok) throw new Error(`Geocoding failed (${res.status})`)
  const data = await res.json()
  return (data.results || []).map((r) => ({
    name: r.name,
    region: [r.admin1, r.country_code].filter(Boolean).join(', '),
    lat: r.latitude,
    lon: r.longitude,
  }))
}

/** WMO weather code → sky descriptor. */
export function describeCode(code) {
  if (code === 0) return { label: 'clear', kind: 'sun' }
  if (code === 1) return { label: 'mostly clear', kind: 'sun' }
  if (code === 2) return { label: 'partly cloudy', kind: 'partly' }
  if (code === 3) return { label: 'overcast', kind: 'cloud' }
  if (code === 45 || code === 48) return { label: 'foggy', kind: 'fog' }
  if (code >= 51 && code <= 57) return { label: 'drizzly', kind: 'rain' }
  if (code >= 61 && code <= 67) return { label: 'rainy', kind: 'rain' }
  if (code >= 71 && code <= 77) return { label: 'snowy', kind: 'snow' }
  if (code >= 80 && code <= 82) return { label: 'showers', kind: 'rain' }
  if (code === 85 || code === 86) return { label: 'snow showers', kind: 'snow' }
  if (code >= 95) return { label: 'stormy', kind: 'storm' }
  return { label: 'mixed', kind: 'cloud' }
}

const WET_KINDS = new Set(['rain', 'snow', 'storm'])

/**
 * The heart of the app: a day's weather → a cooking mood.
 * Returns { key, note, categories, tone } where categories bias recipe
 * scoring and `note` is the human-readable why ("soup weather").
 * tone picks the badge palette: 'warm' | 'cool' | 'mild'.
 */
export function moodForDay(day) {
  if (!day) return null
  const sky = describeCode(day.code)
  const wet = WET_KINDS.has(sky.kind) || day.precipProb >= 50
  const cold = day.tMax < 12
  const hot = day.tMax >= 26

  if (cold && wet) {
    return { key: 'soup', note: 'soup weather', categories: ['soup', 'stew', 'braise', 'baked'], sky, tone: 'cool' }
  }
  if (cold) {
    return { key: 'braise', note: 'braising weather', categories: ['braise', 'stew', 'baked', 'roast'], sky, tone: 'cool' }
  }
  if (hot && !wet) {
    return { key: 'grill', note: 'grill weather', categories: ['grill', 'salad', 'cold', 'quick'], sky, tone: 'warm' }
  }
  if (hot) {
    return { key: 'no-oven', note: 'keep-the-oven-off weather', categories: ['salad', 'cold', 'quick', 'grill'], sky, tone: 'warm' }
  }
  if (wet) {
    return { key: 'cozy', note: 'cozy-night weather', categories: ['baked', 'pasta', 'soup', 'stew'], sky, tone: 'cool' }
  }
  return { key: 'open', note: "cook's choice", categories: ['pasta', 'roast', 'quick', 'grill'], sky, tone: 'mild' }
}

export function fmtTemp(celsius, unit) {
  if (celsius == null) return '—'
  const v = unit === 'F' ? celsius * 9 / 5 + 32 : celsius
  return `${Math.round(v)}°`
}
