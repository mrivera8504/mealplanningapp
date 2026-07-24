import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'

const EMPTY_PLAN = { days: {} }

/**
 * The week's plan: { days: { 'YYYY-MM-DD': { dinner: recipe } } }.
 * Mutations persist automatically (debounced) so nothing is lost, and
 * `save` performs an explicit, confirmed write for the "Save plan" action.
 */
export function usePlan(weekId) {
  const { repo } = useAuth()
  const [plan, setPlan] = useState(EMPTY_PLAN)
  const [loading, setLoading] = useState(true)
  const timer = useRef(null)
  const planRef = useRef(plan)
  planRef.current = plan

  useEffect(() => {
    let alive = true
    setLoading(true)
    repo.loadPlan(weekId).then((p) => {
      if (!alive) return
      setPlan(p || EMPTY_PLAN)
      setLoading(false)
    })
    return () => {
      alive = false
      clearTimeout(timer.current)
    }
  }, [repo, weekId])

  const persistSoon = useCallback(() => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      repo.savePlan(weekId, planRef.current)
    }, 800)
  }, [repo, weekId])

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
    await repo.savePlan(weekId, planRef.current)
  }, [repo, weekId])

  return { plan, loading, setMeal, removeMeal, moveMeal, save }
}
