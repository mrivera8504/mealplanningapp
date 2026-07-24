import { fmtTemp } from '../lib/weather'

/**
 * The signature element: a stamp-like badge that shows the day's sky and
 * temperature, colored by cooking mood (warm / cool / mild), with a gentle
 * animated detail (rays turn, rain falls, steam rises) — stilled under
 * prefers-reduced-motion via the global rule.
 */

function SkyIcon({ kind }) {
  const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round' }
  switch (kind) {
    case 'sun':
      return (
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <g className="anim-rays" {...stroke}>
            <path d="M12 2.5v2.4M12 19.1v2.4M2.5 12h2.4M19.1 12h2.4M5.2 5.2l1.7 1.7M17.1 17.1l1.7 1.7M18.8 5.2l-1.7 1.7M6.9 17.1l-1.7 1.7" />
          </g>
          <circle cx="12" cy="12" r="4.2" {...stroke} />
        </svg>
      )
    case 'partly':
      return (
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <g {...stroke}>
            <circle cx="9" cy="9" r="3.4" />
            <path className="anim-rays" d="M9 2.8v1.6M2.8 9h1.6M4.6 4.6l1.2 1.2M13.4 4.6l-1.2 1.2" />
            <path d="M8.5 19.5h8.7a3.3 3.3 0 0 0 .6-6.6 4.6 4.6 0 0 0-8.9-1.1 3.9 3.9 0 0 0-.4 7.7z" fill="currentColor" fillOpacity="0.12" />
          </g>
        </svg>
      )
    case 'cloud':
    case 'fog':
      return (
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <g {...stroke}>
            <path d="M7 17.5h10.2a3.6 3.6 0 0 0 .7-7.1 5 5 0 0 0-9.7-1.2A4.2 4.2 0 0 0 7 17.5z" fill="currentColor" fillOpacity="0.12" />
            {kind === 'fog' && <path d="M6 20.5h7M10 22.7h8" opacity="0.7" />}
          </g>
        </svg>
      )
    case 'rain':
      return (
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <g {...stroke}>
            <path d="M7 14.5h10.2a3.6 3.6 0 0 0 .7-7.1 5 5 0 0 0-9.7-1.2A4.2 4.2 0 0 0 7 14.5z" fill="currentColor" fillOpacity="0.12" />
            <g className="anim-rain">
              <path d="M9 17.2l-.8 2.2M13 17.2l-.8 2.2M17 17.2l-.8 2.2" />
            </g>
          </g>
        </svg>
      )
    case 'snow':
      return (
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <g {...stroke}>
            <path d="M7 14.5h10.2a3.6 3.6 0 0 0 .7-7.1 5 5 0 0 0-9.7-1.2A4.2 4.2 0 0 0 7 14.5z" fill="currentColor" fillOpacity="0.12" />
            <g className="anim-rain" fill="currentColor" stroke="none">
              <circle cx="9" cy="18.2" r="1" />
              <circle cx="13" cy="19.6" r="1" />
              <circle cx="17" cy="18.2" r="1" />
            </g>
          </g>
        </svg>
      )
    case 'storm':
      return (
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <g {...stroke}>
            <path d="M7 13.5h10.2a3.6 3.6 0 0 0 .7-7.1 5 5 0 0 0-9.7-1.2A4.2 4.2 0 0 0 7 13.5z" fill="currentColor" fillOpacity="0.12" />
            <path d="M12.8 14.5l-2.3 3.6h2.6l-1.9 3.6" fill="none" />
          </g>
        </svg>
      )
    default:
      return null
  }
}

export default function WeatherBadge({ day, mood, unit }) {
  if (!day || !mood) return null
  const label = `${mood.sky.label}, high ${fmtTemp(day.tMax, unit)} — ${mood.note}`
  return (
    <div className={`weather-badge tone-${mood.tone}`} title={label}>
      <span className="weather-badge-icon">
        <SkyIcon kind={mood.sky.kind} />
      </span>
      <span className="weather-badge-temp mono">{fmtTemp(day.tMax, unit)}</span>
      <span className="sr-only">{label}</span>
    </div>
  )
}
