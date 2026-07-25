/**
 * Google Calendar sync via Google Identity Services (token flow).
 * - pushWeekToCalendar: writes each planned dinner as an event, replacing any
 *   events this app previously created for that week (tagged via
 *   extendedProperties.private.wfdWeek) so re-syncing never duplicates.
 * - fetchBusyNights: reads the week's existing events and flags evenings that
 *   already have plans.
 */

const GSI_SRC = 'https://accounts.google.com/gsi/client'
const SCOPES = 'https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events'

const GCAL_BASE = 'https://www.googleapis.com/calendar/v3'
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID

export const calendarConfigured = Boolean(CLIENT_ID)

let gsiPromise = null
let cachedToken = null // { token, expiresAt } -- in-memory cache

const TOKEN_STORAGE_KEY = 'wfd:cal-token'

function readPersistedToken() {
  try {
    const raw = sessionStorage.getItem(TOKEN_STORAGE_KEY)
    if (!raw) return null
    const t = JSON.parse(raw)
    return t.expiresAt > Date.now() + 30_000 ? t : null
  } catch { return null }
}

function writePersistedToken(t) {
  try { sessionStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(t)) } catch {}
}

function loadGsi() {
  if (window.google?.accounts?.oauth2) return Promise.resolve()
  if (!gsiPromise) {
    gsiPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script')
      s.src = GSI_SRC
      s.async = true
      s.onload = resolve
      s.onerror = () => reject(new Error('Could not load Google sign-in'))
      document.head.appendChild(s)
    })
  }
  return gsiPromise
}

export async function getAccessToken({ hintEmail } = {}) {
  if (!calendarConfigured) throw new Error('calendar_not_configured')

  // 1. In-memory (same module lifetime)
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) {
    return cachedToken.token
  }

  // 2. sessionStorage (survives page refreshes within the same browser tab)
  const persisted = readPersistedToken()
  if (persisted) {
    cachedToken = persisted
    return persisted.token
  }

  // 3. Full OAuth popup
  await loadGsi()
  return new Promise((resolve, reject) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      hint: hintEmail || undefined,
      callback: (resp) => {
        if (resp.error) {
          reject(new Error(resp.error))
          return
        }
        const t = { token: resp.access_token, expiresAt: Date.now() + (resp.expires_in || 3600) * 1000 }
        cachedToken = t
        writePersistedToken(t)
        resolve(resp.access_token)
      },
    })
    client.requestAccessToken()
  })
}

export async function listCalendars(token) {
  const res = await fetch(`${GCAL_BASE}/users/me/calendarList`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Failed to list calendars (${res.status})`)
  const data = await res.json()
  return (data.items || [])
    .filter((c) => c.accessRole === 'owner' || c.accessRole === 'writer')
    .map((c) => ({ id: c.id, name: c.summary, primary: c.primary || false }))
}

async function gcal(token, calendarId, path, { method = 'GET', body, params } = {}) {
  const base = `${GCAL_BASE}/calendars/${encodeURIComponent(calendarId)}`
  const qs = params ? `?${new URLSearchParams(params)}` : ''
  const res = await fetch(`${base}${path}${qs}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (res.status === 401) {
    cachedToken = null
    try { sessionStorage.removeItem(TOKEN_STORAGE_KEY) } catch {}
    throw new Error('calendar_auth_expired')
  }
  if (!res.ok && res.status !== 410) {
    throw new Error(`Calendar request failed (${res.status})`)
  }
  if (res.status === 204 || res.status === 410) return null
  return res.json()
}

/**
 * Push the week's dinners. days: [{iso, meal}] with meal.title.
 * dinnerTime "HH:MM"; prepMinutes sets a popup reminder that far ahead.
 * Returns count of events written.
 */
export async function pushWeekToCalendar(token, weekId, days, { dinnerTime = '18:30', durationMinutes = 60, calendarId = 'primary' } = {}) {
  // Delete all app-created events in this date range (matches regardless of
  // which weekId tagged them, so rolling-window re-syncs clean up correctly).
  const timeMin = new Date(`${days[0].iso}T00:00:00`).toISOString()
  const timeMax = new Date(`${days[days.length - 1].iso}T23:59:59`).toISOString()
  const existing = await gcal(token, calendarId, '/events', {
    params: { timeMin, timeMax, privateExtendedProperty: 'wfdApp=1', maxResults: '50' },
  })
  for (const ev of existing?.items || []) {
    await gcal(token, calendarId, `/events/${ev.id}`, { method: 'DELETE' })
  }

  const [h, m] = dinnerTime.split(':').map(Number)
  let written = 0
  for (const day of days) {
    if (!day.meal) continue
    const start = new Date(`${day.iso}T00:00:00`)
    start.setHours(h, m, 0, 0)
    const end = new Date(start.getTime() + durationMinutes * 60 * 1000)
    const prep = day.meal.readyInMinutes || 30
    await gcal(token, calendarId, '/events', {
      method: 'POST',
      body: {
        summary: `Dinner: ${day.meal.title}`,
        description: `Planned with What's for Dinner.${day.meal.sourceUrl ? `\nRecipe: ${day.meal.sourceUrl}` : ''}`,
        start: { dateTime: start.toISOString() },
        end: { dateTime: end.toISOString() },
        reminders: {
          useDefault: false,
          overrides: [{ method: 'popup', minutes: prep }],
        },
        extendedProperties: { private: { wfdWeek: weekId, wfdApp: '1' } },
      },
    })
    written += 1
  }
  return written
}

/**
 * Which evenings already have (non-app) plans?
 * Returns { 'YYYY-MM-DD': [event summaries…] } for events overlapping 5–9 pm.
 */
export async function fetchBusyNights(token, weekId, isoDates, calendarId = 'primary') {
  const timeMin = new Date(`${isoDates[0]}T00:00:00`).toISOString()
  const lastDay = new Date(`${isoDates[isoDates.length - 1]}T00:00:00`)
  lastDay.setDate(lastDay.getDate() + 1)

  const data = await gcal(token, calendarId, '/events', {
    params: {
      timeMin,
      timeMax: lastDay.toISOString(),
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '100',
    },
  })

  const busy = {}
  for (const ev of data?.items || []) {
    if (ev.extendedProperties?.private?.wfdApp) continue
    if (!ev.start?.dateTime || !ev.end?.dateTime) continue // skip all-day events
    const start = new Date(ev.start.dateTime)
    const end = new Date(ev.end.dateTime)
    const iso = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`
    if (!isoDates.includes(iso)) continue
    const eveStart = new Date(start); eveStart.setHours(17, 0, 0, 0)
    const eveEnd = new Date(start); eveEnd.setHours(21, 0, 0, 0)
    if (end > eveStart && start < eveEnd) {
      busy[iso] = [...(busy[iso] || []), ev.summary || 'Busy']
    }
  }
  return busy
}
