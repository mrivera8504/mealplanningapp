import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'

const EMPTY_PLAN = { days: {} }

function hasMeals(plan) {
  return Object.values(plan?.days || {}).some((d) => d?.dinner)
}

/**
 * The full meal plan: { days: { 'YYYY-MM-DD': { dinner: recipe } } }.
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

  const setMeal = useCallback(
    (iso, recipe) =>
      mutate((prev) => ({
        ...prev,
        days: { ...prev.days, [iso]: { ...prev.days[iso], dinner: recipe } },
      })),
    [mutate]
  )

  const removeMeal = useCallback(
    (iso) =>
      mutate((prev) => {
        const days = { ...prev.days }
        if (days[iso]) days[iso] = { ...days[iso], dinner: null }
        return { ...prev, days }
      }),
    [mutate]
  )

  const moveMeal = useCallback(
    (fromIso, toIso) =>
      mutate((prev) => {
        const fromMeal = prev.days[fromIso]?.dinner || null
        const toMeal = prev.days[toIso]?.dinner || null
        return {
          ...prev,
          days: {
            ...prev.days,
            [fromIso]: { ...prev.days[fromIso], dinner: toMeal },
            [toIso]: { ...prev.days[toIso], dinner: fromMeal },
          },
        }
      }),
    [mutate]
  )

  const save = useCallback(async () => {
    clearTimeout(timer.current)
    timer.current = null
    await repo.savePlan(planRef.current)
  }, [repo])

  return { plan, loading, setMeal, removeMeal, moveMeal, save }
}
