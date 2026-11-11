import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { searchRecipes } from '../lib/spoonacular'
import { evictions, filterNew, needsRefill, planRefill } from '../lib/library'
import { servedDates } from '../lib/suggestions'
import { courseOf } from '../lib/courses'
import { toISODate } from '../lib/dates'

// One refill at a time across mounts (StrictMode double-mounts effects), so a
// refill never spends quota twice.
let inFlight = null

/** Firestore rejects undefined fields; Spoonacular results sometimes carry them. */
const clean = (recipe) => JSON.parse(JSON.stringify(recipe))

async function refill(repo, library, meta, context) {
  const now = Date.now()
  const fetched = []
  let error = null
  // One after the other: the free plan allows a single request per second.
  let extra = meta?.lastExtra || null
  for (const search of planRefill(context, Math.random, extra)) {
    try {
      const { recipes } = await searchRecipes({ type: search.type, cuisine: search.cuisine, sort: 'random' }, search.course)
      fetched.push(...recipes.map((r) => clean({ ...r, addedAt: now, reason: search.reason })))
      if (search.course !== 'main') extra = search.course
    } catch (err) {
      error = err?.code || 'upstream_error'
      if (error !== 'upstream_error') break // no key or no quota: the second search would fail too
    }
  }

  const fresh = filterNew(fetched, {
    libraryIds: new Set(library.map((r) => r.id)),
    savedIds: new Set(context.saved.map((r) => r.id)),
    prefs: context.prefs,
  })
  let next = [...library, ...fresh]
  const everPlanned = new Set(['main', 'side', 'dessert'].flatMap((c) => [...servedDates(context.plan, c).keys()]))
  const drop = new Set(evictions(next, everPlanned))
  next = next.filter((r) => !drop.has(r.id))

  const nextMeta = {
    lastAttemptAt: now,
    lastFetchAt: error && !fresh.length ? meta?.lastFetchAt || null : now,
    lastError: error,
    lastExtra: extra,
  }
  await repo.saveLibraryRecipes(fresh.filter((r) => !drop.has(r.id)))
  await repo.removeLibraryRecipes(library.filter((r) => drop.has(r.id)).map((r) => r.id))
  await repo.saveDiscovery(nextMeta)
  return { library: next, meta: nextMeta }
}

/**
 * The library of outside recipes that suggestions can draw on, plus the state
 * of its last refill. Stored with the account; topped up about once a week
 * (three searches -- two for dinners, one for sides or desserts -- a few quota
 * points), sooner when stock runs low.
 *
 * `enabled` false (the "0 new ideas" setting) never fetches and offers none.
 * `ready` holds the first refill until the plan has loaded, so the searches
 * can be aimed using what's actually been cooked. Failures leave the library
 * as it was and are reported through `status.lastError`.
 */
export function useLibrary(enabled, { ready, saved, mine, prefs, plan }) {
  const { repo } = useAuth()
  const [recipes, setRecipes] = useState([])
  const [status, setStatus] = useState(null)
  const context = useRef(null)
  context.current = { saved, mine, prefs, plan, today: toISODate(new Date()) }

  useEffect(() => {
    let alive = true
    if (!enabled) {
      setRecipes([])
      return undefined
    }
    if (!ready) return undefined

    Promise.all([repo.loadLibrary(), repo.loadDiscovery()]).then(async ([stored, storedMeta]) => {
      let library = stored || []
      let meta = storedMeta

      // One-time move of the old weekly batch into the library.
      if (meta?.recipes) {
        const known = new Set(library.map((r) => r.id))
        const moved = meta.recipes
          .filter((r) => r?.id && !known.has(r.id))
          .map((r) => clean({ ...r, addedAt: meta.fetchedAt || Date.now(), reason: 'explore' }))
        meta = { lastAttemptAt: meta.fetchedAt || null, lastFetchAt: meta.fetchedAt || null, lastError: null }
        try {
          await repo.saveLibraryRecipes(moved)
          await repo.saveDiscovery(meta)
          library = [...library, ...moved]
        } catch {
          /* best-effort; the old batch is still there to move next time */
        }
      }

      if (!alive) return
      setRecipes(library)
      setStatus(meta || null)

      const planned = servedDates(context.current.plan)
      const unplanned = library.filter((r) => courseOf(r) === 'main' && !planned.has(r.id)).length
      if (!needsRefill(meta, unplanned)) return

      inFlight ||= refill(repo, library, meta, context.current).finally(() => {
        inFlight = null
      })
      inFlight
        .then((result) => {
          if (!alive) return
          setRecipes(result.library)
          setStatus(result.meta)
        })
        .catch(() => {})
    })

    return () => {
      alive = false
    }
  }, [repo, enabled, ready])

  /** Take a recipe out of the library for good (used when it's dismissed). */
  const remove = useCallback(
    (id) => {
      setRecipes((list) => list.filter((r) => r.id !== id))
      return repo.removeLibraryRecipes([id]).catch(() => {})
    },
    [repo]
  )

  return { recipes, status, remove }
}
