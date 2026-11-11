import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { swapDays, trimOldDays, withDinner, withSide, withSideReplaced, withoutSide } from '../lib/planShape'

const EMPTY_PLAN = { days: {} }

function hasMeals(plan) {
  return Object.values(plan?.days || {}).some((d) => d?.dinner || d?.sides?.length || d?.dessert)
}

/**
 * The full meal plan:
 *   { days: { 'YYYY-MM-DD': { dinner: recipe, sides: [recipe], dessert: recipe } } }
 * `sides` and `dessert` are optional; days planned before they existed have only `dinner`.
 *
 * Stored as a single Firestore document ('current') that accumulates meals
 * indexed by date — no key rotation, no data loss across day boundaries.
 * The rolling display window is controlled by the caller (WeekView/GroceryView).
 */
export function usePlan() {
  const { repo } = useAuth()
  const [plan, setPlan] = useState(EMPTY_PLAN)
  const [loading, setLoading] = useState(true)
  const timer = useRef(null)
  const planRef = useRef(plan)
  planRef.current = plan

  useEffect(() => {
    let alive = true
    setLoading(true)

    repo.loadPlan().then(async (p) => {
      if (!alive) return

      // One-time migration from previous storage schemes, which keyed the plan
      // document by date (per-day or per-Monday) so meals were stranded whenever
      // the key rolled over. Enumerate every legacy plan document and merge them
      // all — newer documents win on conflict, and anything already in 'current'
      // wins over legacy.
      if (!hasMeals(p)) {
        try {
          const legacy = await repo.loadLegacyPlans()
          const merged = { days: {} }
          for (const { data } of legacy.sort((a, b) => a.key.localeCompare(b.key))) {
            if (data?.days) Object.assign(merged.days, data.days)
          }
          Object.assign(merged.days, p?.days || {})
          if (hasMeals(merged)) {
            p = merged
            repo.savePlan(merged)
          }
        } catch {
          /* migration is best-effort; an empty plan is still usable */
        }
      }

      // Keep the document small: days more than two months back are cut down
      // to what rotation history needs.
      if (p) {
        const trimmed = trimOldDays(p)
        if (trimmed.changed) {
          p = trimmed.plan
          repo.savePlan(p).catch(() => {})
        }
      }

      if (!alive) return
      setPlan(p || EMPTY_PLAN)
      setLoading(false)
    })

    return () => {
      alive = false
      // Flush (don't drop) an edit still waiting on the debounce timer.
      if (timer.current) {
        clearTimeout(timer.current)
        timer.current = null
        repo.savePlan(planRef.current)
      }
    }
  }, [repo])

  const persistSoon = useCallback(() => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      timer.current = null
      repo.savePlan(planRef.current)
    }, 800)
  }, [repo])

  const mutate = useCallback(
    (fn) => {
      setPlan((prev) => {
        const next = fn(prev)
        planRef.current = next
        return next
      })
      persistSoon()
    },
    [persistSoon]
  )

  /** Change one day with `fn(day) -> day`. */
  const mutateDay = useCallback(
    (iso, fn) => mutate((prev) => ({ ...prev, days: { ...prev.days, [iso]: fn(prev.days[iso] || {}) } })),
    [mutate]
  )

  const setMeal = useCallback((iso, recipe) => mutateDay(iso, (day) => withDinner(day, recipe)), [mutateDay])
  const removeMeal = useCallback((iso) => mutateDay(iso, (day) => ({ ...day, dinner: null })), [mutateDay])

  const addSide = useCallback((iso, side) => mutateDay(iso, (day) => withSide(day, side)), [mutateDay])
  const replaceSide = useCallback((iso, oldId, side) => mutateDay(iso, (day) => withSideReplaced(day, oldId, side)), [mutateDay])
  const removeSide = useCallback((iso, sideId) => mutateDay(iso, (day) => withoutSide(day, sideId)), [mutateDay])
  const setDessert = useCallback((iso, dessert) => mutateDay(iso, (day) => ({ ...day, dessert })), [mutateDay])
  const removeDessert = useCallback((iso) => mutateDay(iso, (day) => ({ ...day, dessert: null })), [mutateDay])

  /** Swap two nights whole: dinner, sides and dessert travel together. */
  const moveMeal = useCallback(
    (fromIso, toIso) => mutate((prev) => ({ ...prev, days: swapDays(prev.days, fromIso, toIso) })),
    [mutate]
  )

  const save = useCallback(async () => {
    clearTimeout(timer.current)
    timer.current = null
    await repo.savePlan(planRef.current)
  }, [repo])

  return { plan, loading, setMeal, removeMeal, moveMeal, addSide, replaceSide, removeSide, setDessert, removeDessert, save }
}
