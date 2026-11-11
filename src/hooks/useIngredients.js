import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'

const EMPTY = { items: {}, manualOrder: [], sectionOrder: [] }

/**
 * What the household has told the app about its ingredients, keyed by
 * normalized ingredient name (normalizeName in lib/grocery) -- the same key
 * Walmart matches and grocery renames use. One doc, meta/ingredients:
 *   { items: { [key]: { section? } }, manualOrder: [key], sectionOrder: [section] }
 */
export function useIngredients() {
  const { repo } = useAuth()
  const [data, setData] = useState(EMPTY)
  const [loaded, setLoaded] = useState(false)
  const ref = useRef(data)
  ref.current = data

  useEffect(() => {
    let alive = true
    repo.loadIngredients().then((doc) => {
      if (!alive) return
      setData({ ...EMPTY, ...(doc || {}), items: { ...(doc?.items || {}) } })
      setLoaded(true)
    })
    return () => {
      alive = false
    }
  }, [repo])

  /** Apply `fn` to the current data, store it, and save it. */
  const write = useCallback(
    (fn) => {
      const next = fn(ref.current)
      ref.current = next
      setData(next)
      return repo.saveIngredients(next).catch(() => {})
    },
    [repo]
  )

  /** Merge `patch` into one ingredient's entry; null/undefined values are removed. */
  const setItem = useCallback(
    (key, patch) =>
      write((d) => {
        const merged = { ...d.items[key], ...patch }
        for (const k of Object.keys(merged)) if (merged[k] == null) delete merged[k]
        const items = { ...d.items }
        if (Object.keys(merged).length) items[key] = merged
        else delete items[key]
        return { ...d, items }
      }),
    [write]
  )

  const setSection = useCallback((key, section) => setItem(key, { section: section || null }), [setItem])
  const setManualOrder = useCallback((manualOrder) => write((d) => ({ ...d, manualOrder })), [write])
  const setSectionOrder = useCallback((sectionOrder) => write((d) => ({ ...d, sectionOrder })), [write])

  return { ...data, loaded, write, setItem, setSection, setManualOrder, setSectionOrder }
}
