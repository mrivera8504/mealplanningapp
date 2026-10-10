import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useAuth } from './AuthContext'

/**
 * Per-recipe rotation preferences, synced with the account:
 *   { [recipeId]: { favorite?, snoozeUntil?: 'YYYY-MM-DD', night?: 0-6, dismissed? } }
 * Works for any recipe -- personal, saved, house collection or discovery.
 */

// Older builds kept these per-browser in localStorage.
const LEGACY_DISMISSED_KEY = 'wfd:dismissed-recipes'
const LEGACY_RECENT_KEY = 'wfd:recent-meals'

function takeLegacyDismissed() {
  try {
    const ids = JSON.parse(localStorage.getItem(LEGACY_DISMISSED_KEY)) || []
    return Array.isArray(ids) ? ids : []
  } catch {
    return []
  }
}

function dropLegacyKeys() {
  try {
    localStorage.removeItem(LEGACY_DISMISSED_KEY)
    localStorage.removeItem(LEGACY_RECENT_KEY)
  } catch {
    /* storage blocked */
  }
}

const RotationContext = createContext(null)

export function RotationProvider({ children }) {
  const { repo } = useAuth()
  const [prefs, setPrefs] = useState({})
  const prefsRef = useRef(prefs)
  prefsRef.current = prefs

  useEffect(() => {
    let alive = true
    repo.loadRotation().then((doc) => {
      if (!alive) return
      const loaded = { ...(doc?.recipes || {}) }
      // Fold this device's old dismissals into the synced prefs, once.
      const legacy = takeLegacyDismissed().filter((id) => !loaded[id]?.dismissed)
      for (const id of legacy) loaded[id] = { ...loaded[id], dismissed: true }
      setPrefs(loaded)
      if (legacy.length) {
        repo.saveRotation({ recipes: loaded }).then(dropLegacyKeys, () => {})
      } else {
        dropLegacyKeys()
      }
    })
    return () => {
      alive = false
    }
  }, [repo])

  /** Merge `patch` into one recipe's prefs; null/undefined/false values are removed. */
  const setPref = useCallback(
    (id, patch) => {
      const merged = { ...prefsRef.current[id], ...patch }
      for (const k of Object.keys(merged)) {
        if (merged[k] == null || merged[k] === false) delete merged[k]
      }
      const next = { ...prefsRef.current }
      if (Object.keys(merged).length) next[id] = merged
      else delete next[id]
      prefsRef.current = next
      setPrefs(next)
      return repo.saveRotation({ recipes: next })
    },
    [repo]
  )

  return <RotationContext.Provider value={{ prefs, setPref }}>{children}</RotationContext.Provider>
}

export function useRotation() {
  return useContext(RotationContext)
}
