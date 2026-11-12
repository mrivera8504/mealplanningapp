import { fmtTemp } from '../lib/weather'

/** The day's sky as a small line icon, colored by kind. */
function SkyIcon({ kind }) {
  const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' }
  const cloud = 'M7 15.5h10.2a3.6 3.6 0 0 0 .7-7.1 5 5 0 0 0-9.7-1.2A4.2 4.2 0 0 0 7 15.5z'
  switch (kind) {
    case 'sun':
      return (
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" {...stroke}>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2.5v2.4M12 19.1v2.4M2.5 12h2.4M19.1 12h2.4M5.2 5.2l1.7 1.7M17.1 17.1l1.7 1.7M18.8 5.2l-1.7 1.7M6.9 17.1l-1.7 1.7" />
        </svg>
      )
    case 'partly':
      return (
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" {...stroke}>
          <circle cx="9" cy="9" r="3.2" />
          <path d="M9 2.8v1.4M2.8 9h1.4M4.6 4.6l1 1M13.4 4.6l-1 1" />
          <path d="M8.5 19.5h8.7a3.3 3.3 0 0 0 .6-6.6 4.6 4.6 0 0 0-8.9-1.1 3.9 3.9 0 0 0-.4 7.7z" />
        </svg>
      )
    case 'cloud':
    case 'fog':
      return (
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" {...stroke}>
          <path d={cloud} />
          {kind === 'fog' && <path d="M6 19.5h7M10 21.7h8" />}
        </svg>
      )
    case 'rain':
      return (
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" {...stroke}>
          <path d={cloud} />
          <path d="M9 18.2l-.8 2.2M13 18.2l-.8 2.2M17 18.2l-.8 2.2" />
        </svg>
      )
    case 'snow':
      return (
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" {...stroke}>
          <path d={cloud} />
          <path d="M9 19h.01M13 20.5h.01M17 19h.01" strokeWidth="2.6" />
        </svg>
      )
    case 'storm':
      return (
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" {...stroke}>
          <path d={cloud} />
          <path d="M12.8 15.5l-2.3 3.4h2.6l-1.9 3.4" />
        </svg>
      )
    default:
      return null
  }
}

const KIND_CLASS = { sun: 'wx-sun', partly: 'wx-sun', cloud: 'wx-cloud', fog: 'wx-cloud', rain: 'wx-rain', storm: 'wx-rain', snow: 'wx-snow' }

/** Temperature and sky for one night. Shown for information; it only shapes a pick when asked. */
export default function WeatherBadge({ day, mood, unit }) {
  if (!day || !mood) return <span className="weather weather-none">No forecast</span>
  const temp = fmtTemp(day.tMax, unit)
  return (
    <div className="weather" title={`${mood.sky.label}, high ${temp}`}>
      <span className={`weather-icon ${KIND_CLASS[mood.sky.kind] || 'wx-cloud'}`}>
        <SkyIcon kind={mood.sky.kind} />
      </span>
      <span className="weather-text">
        <span className="weather-temp mono">{temp}</span>
        <span className="weather-sky">{mood.sky.label}</span>
      </span>
    </div>
  )
}
