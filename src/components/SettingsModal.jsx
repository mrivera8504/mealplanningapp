import { useEffect, useRef, useState } from 'react'
import { geocodeCity } from '../lib/weather'
import { calendarConfigured, getAccessToken, listCalendars } from '../lib/calendar'
import { useSettings } from '../context/SettingsContext'
import { useToast } from '../context/ToastContext'

export default function SettingsModal({ onClose }) {
  const { settings, update } = useSettings()
  const toast = useToast()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [calendars, setCalendars] = useState(null)
  const [loadingCalendars, setLoadingCalendars] = useState(false)
  const firstField = useRef(null)

  useEffect(() => {
    firstField.current?.focus()
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const loadCalendars = async () => {
    setLoadingCalendars(true)
    try {
      const token = await getAccessToken()
      const list = await listCalendars(token)
      setCalendars(list)
    } catch {
      toast('Could not load your calendars -- try again.', 'warn')
    } finally {
      setLoadingCalendars(false)
    }
  }

  const search = async (e) => {
    e.preventDefault()
    if (!query.trim()) return
    setSearching(true)
    try {
      setResults(await geocodeCity(query.trim()))
    } catch {
      toast('Could not search locations -- check your connection.', 'warn')
    } finally {
      setSearching(false)
    }
  }

  return (
    <div className="modal-scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal settings-modal" role="dialog" aria-modal="true" aria-label="Settings">
        <button type="button" className="btn btn-ghost modal-close" onClick={onClose} aria-label="Close">
          ✕
        </button>
        <h2>Kitchen settings</h2>

        <section className="settings-section">
          <h3 className="overline">Weather location</h3>
          <p className="muted">
            {settings.location
              ? `Forecast for ${settings.location.name}${settings.location.region ? `, ${settings.location.region}` : ''}`
              : 'No location set -- search for your town so the forecast can pick your menu.'}
          </p>
          <form onSubmit={search} className="settings-search">
            <input
              ref={firstField}
              className="input"
              placeholder="City, e.g. Providence"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search for a city"
            />
            <button type="submit" className="btn btn-secondary" disabled={searching}>
              {searching ? 'Searching…' : 'Search'}
            </button>
          </form>
          {results.length > 0 && (
            <ul className="settings-results">
              {results.map((r, i) => (
                <li key={i}>
                  <button
                    type="button"
                    className="link-quiet"
                    onClick={() => {
                      update({ location: r })
                      setResults([])
                      setQuery('')
                      toast(`Forecast set to ${r.name}.`)
                    }}
                  >
                    {r.name} <span className="muted">{r.region}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="settings-section">
          <h3 className="overline">Temperature</h3>
          <div className="seg" role="radiogroup" aria-label="Temperature unit">
            {['F', 'C'].map((u) => (
              <button
                key={u}
                type="button"
                role="radio"
                aria-checked={settings.unit === u}
                className={`seg-btn${settings.unit === u ? ' seg-btn-on' : ''}`}
                onClick={() => update({ unit: u })}
              >
                °{u}
              </button>
            ))}
          </div>
        </section>

        <section className="settings-section">
          <h3 className="overline">Dinner time (for calendar events)</h3>
          <input
            className="input mono settings-time"
            type="time"
            value={settings.dinnerTime}
            onChange={(e) => update({ dinnerTime: e.target.value })}
            aria-label="Usual dinner time"
          />
        </section>

        {calendarConfigured && (
          <section className="settings-section">
            <h3 className="overline">Google Calendar</h3>
            <p className="muted">
              {settings.calendarName
                ? `Syncing to: ${settings.calendarName}`
                : 'Using your primary calendar.'}
            </p>
            {calendars ? (
              <ul className="settings-results">
                {calendars.map((cal) => (
                  <li key={cal.id}>
                    <button
                      type="button"
                      className={`link-quiet${settings.calendarId === cal.id ? ' settings-cal-active' : ''}`}
                      onClick={() => {
                        update({ calendarId: cal.id, calendarName: cal.name })
                        setCalendars(null)
                        toast(`Calendar set to ${cal.name}.`)
                      }}
                    >
                      {cal.name}
                      {cal.primary && <span className="muted"> (primary)</span>}
                      {settings.calendarId === cal.id && <span className="muted"> -- current</span>}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={loadCalendars}
                disabled={loadingCalendars}
              >
                {loadingCalendars ? 'Loading...' : 'Choose calendar'}
              </button>
            )}
          </section>
        )}
      </div>
    </div>
  )
}
