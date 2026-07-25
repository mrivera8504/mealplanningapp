import { createContext, useContext, useEffect, useState } from 'react'
import { useAuth } from './AuthContext'

const DEFAULTS = {
  location: null, // { name, region, lat, lon }
  unit: 'F',
  dinnerTime: '18:30',
  calendarId: 'primary',
  calendarName: null,
}

const SettingsContext = createContext(null)

export function SettingsProvider({ children }) {
  const { repo } = useAuth()
  const [settings, setSettings] = useState(DEFAULTS)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let alive = true
    repo.loadSettings().then((s) => {
      if (!alive) return
      setSettings({ ...DEFAULTS, ...(s || {}) })
      setLoaded(true)
    })
    return () => {
      alive = false
    }
  }, [repo])

  const update = (patch) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch }
      repo.saveSettings(next)
      return next
    })
  }

  return (
    <SettingsContext.Provider value={{ settings, update, loaded }}>
      {children}
    </SettingsContext.Provider>
  )
}

export function useSettings() {
  return useContext(SettingsContext)
}
