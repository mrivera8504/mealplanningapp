import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { fetchRandomRecipes } from '../lib/spoonacular'

const REFRESH_AFTER_MS = 7 * 24 * 60 * 60 * 1000

// One fetch at a time across mounts (StrictMode double-mounts effects), so a
// refresh never spends quota twice.
let inFlight = null

/**
 * This week's batch of new-to-you recipes from Spoonacular, stored with the
 * account and refreshed at most once a week -- one ~1.1-point call, well
 * inside the free plan. `enabled` false (the "0 new ideas" setting) never
 * fetches. Failures (no API key, quota spent) just leave the old batch.
 */
export function useDiscovery(enabled) {
  const { repo } = useAuth()
  const [recipes, setRecipes] = useState([])

  useEffect(() => {
    let alive = true
    if (!enabled) {
      setRecipes([])
      return undefined
    }
    repo.loadDiscovery().then((batch) => {
      if (!alive) return
      setRecipes(batch?.recipes || [])
      const fresh = batch?.fetchedAt && Date.now() - batch.fetchedAt < REFRESH_AFTER_MS
      if (fresh) return
      inFlight ||= fetchRandomRecipes()
        .then(async (list) => {
          if (list.length) await repo.saveDiscovery({ fetchedAt: Date.now(), recipes: list })
          return list
        })
        .finally(() => {
          inFlight = null
        })
      inFlight.then((list) => alive && list.length && setRecipes(list)).catch(() => {})
    })
    return () => {
      alive = false
    }
  }, [repo, enabled])

  return recipes
}
