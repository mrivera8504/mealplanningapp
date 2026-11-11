import { MAX_SIDES } from './courses'
import { addDays, toISODate } from './dates'

/**
 * The shape of a planned day and the pure operations on it:
 *   { dinner: recipe|null, sides: [recipe], dessert: recipe|null }
 * Days saved before sides and desserts existed have only `dinner`; every
 * reader treats missing `sides` as [] and missing `dessert` as null.
 */

export const TRIM_AFTER_DAYS = 60

/** Add a side to a day (no duplicates, at most MAX_SIDES). */
export function withSide(day, side) {
  const sides = (day?.sides || []).filter((s) => s.id !== side.id)
  if (sides.length >= MAX_SIDES) return day
  return { ...day, sides: [...sides, side] }
}

/** Swap one side for another in place, keeping its position. */
export function withSideReplaced(day, oldId, side) {
  const sides = day?.sides || []
  if (!sides.some((s) => s.id === oldId)) return withSide(day, side)
  return { ...day, sides: sides.filter((s) => s.id === oldId || s.id !== side.id).map((s) => (s.id === oldId ? side : s)) }
}

export function withoutSide(day, sideId) {
  return { ...day, sides: (day?.sides || []).filter((s) => s.id !== sideId) }
}

/** Set the dinner. A takeout night has no sides, so they're cleared with it. */
export function withDinner(day, dinner) {
  return dinner?.takeout ? { ...day, dinner, sides: [] } : { ...day, dinner }
}

/** Sides and dessert travel with the dinner: moving a night swaps the two days whole. */
export function swapDays(days, fromIso, toIso) {
  const pick = (d) => ({ dinner: d?.dinner || null, sides: d?.sides || [], dessert: d?.dessert || null })
  return {
    ...days,
    [fromIso]: { ...days[fromIso], ...pick(days[toIso]) },
    [toIso]: { ...days[toIso], ...pick(days[fromIso]) },
  }
}

/** What history needs from an old dish: enough to count it and judge variety, nothing more. */
function slim(dish) {
  if (!dish || dish.trimmed) return dish
  const kept = { id: dish.id, title: dish.title, cuisine: dish.cuisine || null, categories: dish.categories || [], trimmed: true }
  for (const flag of ['takeout', 'course', 'mine', 'quick']) if (dish[flag]) kept[flag] = dish[flag]
  return kept
}

/**
 * The plan is one document that grows with every night planned, and each
 * dish on it carries its full recipe. Days older than TRIM_AFTER_DAYS are cut
 * down to what rotation history uses (id, title, cuisine, categories), which
 * keeps the document far inside Firestore's 1 MB limit. The recipes
 * themselves are untouched in the recipe lists.
 *
 * Returns { plan, changed }.
 */
export function trimOldDays(plan, today = new Date()) {
  const cutoff = toISODate(addDays(today, -TRIM_AFTER_DAYS))
  let changed = false
  const days = {}
  for (const [iso, day] of Object.entries(plan?.days || {})) {
    if (iso >= cutoff || !day) {
      days[iso] = day
      continue
    }
    const dishes = [day.dinner, ...(day.sides || []), day.dessert].filter(Boolean)
    if (dishes.every((d) => d.trimmed)) {
      days[iso] = day
      continue
    }
    changed = true
    days[iso] = {
      ...day,
      dinner: slim(day.dinner) || null,
      ...(day.sides?.length ? { sides: day.sides.map(slim) } : {}),
      ...(day.dessert ? { dessert: slim(day.dessert) } : {}),
    }
  }
  return changed ? { plan: { ...plan, days }, changed } : { plan, changed }
}
