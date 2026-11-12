import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { useAuth } from './AuthContext'

const DEFAULTS = {
  location: null, // { name, region, lat, lon }
  unit: 'F',
  dinnerTime: '18:30',
  calendarId: 'primary',
  calendarName: null,
  newIdeasPerWeek: 2, // Spoonacular discovery recipes mixed into a week; 0 turns discovery off
  grocerySort: 'name', // 'section' | 'name' | 'manual'
  theme: null, // 'system' | 'light' | 'dark'; null = whatever this device last used
}

const SettingsContext = createContext(null)

const THEME_KEY = 'wfd:theme-mode'

function readDeviceTheme() {
  try {
    return localStorage.getItem(THEME_KEY) || 'system'
  } catch {
    return 'system'
  }
}

const prefersDark = () => typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches

/**
 * Light or dark: the setting is synced with the account, and also kept on
 * the device so index.html can apply it before the first paint.
 */
function useTheme(mode) {
  const [systemDark, setSystemDark] = useState(prefersDark)

  useEffect(() => {
    if (typeof matchMedia !== 'function') return undefined
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const onChange = (e) => setSystemDark(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const resolved = mode === 'dark' || (mode === 'system' && systemDark) ? 'dark' : 'light'

  useEffect(() => {
    document.documentElement.dataset.theme = resolved
    try {
      localStorage.setItem(THEME_KEY, mode)
    } catch {
      /* storage blocked */
    }
  }, [mode, resolved])

  return resolved
}

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

  const themeMode = settings.theme || readDeviceTheme()
  const theme = useTheme(themeMode)
  const toggleTheme = useCallback(() => update({ theme: theme === 'dark' ? 'light' : 'dark' }), [theme]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <SettingsContext.Provider value={{ settings, update, loaded, theme, themeMode, toggleTheme }}>
      {children}
    </SettingsContext.Provider>
  )
}

export function useSettings() {
  return useContext(SettingsContext)
}
