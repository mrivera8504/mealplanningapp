import { useEffect, useState } from 'react'
import { fetchForecast } from '../lib/weather'
import { useSettings } from '../context/SettingsContext'
import { addDays, toISODate } from '../lib/dates'

/** ?demo=1 renders a varied canned forecast — for demos and visual QA. */
function demoForecast() {
  const shapes = [
    { code: 61, tMax: 9, tMin: 4, precipProb: 85 },   // cold rain → soup
    { code: 3, tMax: 11, tMin: 5, precipProb: 20 },   // cold overcast → braise
    { code: 0, tMax: 31, tMin: 19, precipProb: 5 },   // hot sun → grill
    { code: 2, tMax: 22, tMin: 13, precipProb: 10 },  // mild → open
    { code: 80, tMax: 18, tMin: 11, precipProb: 70 }, // mild showers → cozy
    { code: 0, tMax: 27, tMin: 16, precipProb: 0 },   // hot → grill
    { code: 71, tMax: 2, tMin: -3, precipProb: 60 },  // snow → soup
  ]
  const out = {}
  const monday = new Date()
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
  for (let i = 0; i < 14; i++) {
    out[toISODate(addDays(monday, i))] = shapes[i % shapes.length]
  }
  return out
}

/**
 * Forecast keyed by ISO date for the configured location.
 * If no location is set yet, tries browser geolocation once and stores it.
 */
export function useWeather() {
  const { settings, update, loaded } = useSettings()
  const [forecast, setForecast] = useState(null)
  const [status, setStatus] = useState('idle') // idle | locating | loading | ready | error | no-location

  useEffect(() => {
    if (!loaded) return
    let cancelled = false

    if (new URLSearchParams(window.location.search).get('demo')) {
      setForecast(demoForecast())
      setStatus('ready')
      return undefined
    }

    async function run() {
      let loc = settings.location
      if (!loc) {
        if (!navigator.geolocation) {
          setStatus('no-location')
          return
        }
        setStatus('locating')
        try {
          const pos = await new Promise((resolve, reject) =>
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 8000 })
          )
          loc = {
            name: 'My location',
            region: '',
            lat: Math.round(pos.coords.latitude * 100) / 100,
            lon: Math.round(pos.coords.longitude * 100) / 100,
          }
          if (!cancelled) update({ location: loc })
        } catch {
          if (!cancelled) setStatus('no-location')
          return
        }
      }
      if (cancelled) return
      setStatus('loading')
      try {
        const data = await fetchForecast(loc.lat, loc.lon)
        if (!cancelled) {
          setForecast(data)
          setStatus('ready')
        }
      } catch {
        if (!cancelled) setStatus('error')
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [loaded, settings.location, update])

  return { forecast, status, location: settings.location, unit: settings.unit }
}
