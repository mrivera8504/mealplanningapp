import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'

/**
 * The household's remembered Walmart products, keyed by normalized ingredient
 * name (see normalizeName in lib/grocery). One doc: { items: { [key]: entry } }
 *   entry = { product: {itemId, name, price, size, image}, qty, updatedAt }
 *         | { skip: true, updatedAt }   — "not bought at Walmart / always on hand"
 */
export function useWalmartProducts() {
  const { repo } = useAuth()
  const [matches, setMatches] = useState({})
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let alive = true
    repo.loadWalmart().then((data) => {
      if (!alive) return
      setMatches(data?.items || {})
      setLoaded(true)
    })
    return () => {
      alive = false
    }
  }, [repo])

  const write = useCallback(
    (fn) => {
      setMatches((prev) => {
        const next = fn(prev)
        repo.saveWalmart({ items: next })
        return next
      })
    },
    [repo]
  )

  const choose = useCallback(
    (key, product) =>
      write((m) => ({ ...m, [key]: { product, qty: m[key]?.qty || 1, updatedAt: Date.now() } })),
    [write]
  )

  const skip = useCallback((key) => write((m) => ({ ...m, [key]: { skip: true, updatedAt: Date.now() } })), [write])

  const forget = useCallback(
    (key) =>
      write((m) => {
        const { [key]: _dropped, ...rest } = m
        return rest
      }),
    [write]
  )

  const setQty = useCallback(
    (key, qty) => write((m) => (m[key]?.product ? { ...m, [key]: { ...m[key], qty: Math.max(1, qty) } } : m)),
    [write]
  )

  return { matches, loaded, choose, skip, forget, setQty }
}
