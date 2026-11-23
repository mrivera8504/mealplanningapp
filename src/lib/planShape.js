import { dessertsOf, limitsFor } from './courses'
import { addDays, toISODate } from './dates'

/**
 * The shape of a planned day and the pure operations on it:
 *   { dinner: recipe|null, sides: [recipe], desserts: [recipe], holiday?: { name } }
 * Days saved before sides and desserts existed have only `dinner`, and days
 * saved before holidays have a single `dessert`; read desserts through
 * dessertsOf(), and treat missing `sides` as [].
 */

export const TRIM_AFTER_DAYS = 60

/** Add a side to a day (no duplicates, at most the night's limit). */
export function withSide(day, side) {
  const sides = (day?.sides || []).filter((s) => s.id !== side.id)
  if (sides.length >= limitsFor(day).sides) return day
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

/** Desserts are always written as a list; the old single field is dropped. */
function setDesserts(day, desserts) {
  const { dessert, ...rest } = day || {}
  return { ...rest, desserts }
}

/**
 * Add a dessert. A regular night holds one, so a new one replaces it; a
 * holiday adds alongside, up to its limit.
 */
export function withDessert(day, dessert) {
  const others = dessertsOf(day).filter((d) => d.id !== dessert.id)
  const max = limitsFor(day).desserts
  if (max <= 1) return setDesserts(day, [dessert])
  if (others.length >= max) return day
  return setDesserts(day, [...others, dessert])
}

/** Swap one dessert for another in place, keeping its position. */
export function withDessertReplaced(day, oldId, dessert) {
  const list = dessertsOf(day)
  if (!list.some((d) => d.id === oldId)) return withDessert(day, dessert)
  return setDesserts(day, list.filter((d) => d.id === oldId || d.id !== dessert.id).map((d) => (d.id === oldId ? dessert : d)))
}

export function withoutDessert(day, dessertId) {
  return setDesserts(day, dessertsOf(day).filter((d) => d.id !== dessertId))
}

/**
 * Mark a night as a holiday, or back to a regular night. Turning it off
 * keeps every dish already planned -- nothing is thrown away -- it just
 * stops adding past the everyday limits.
 */
export function withHoliday(day, holiday) {
  if (holiday) return { ...day, holiday: { name: holiday.name || 'Holiday' } }
  const { holiday: _off, ...rest } = day || {}
  return rest
}

/** Thanksgiving (US): the fourth Thursday of November. */
export function holidayNameFor(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  const firstDow = new Date(y, 10, 1).getDay()
  const thanksgiving = 1 + ((4 - firstDow + 7) % 7) + 21
  if (m === 11 && d === thanksgiving) return 'Thanksgiving'
  if (m === 12 && d === 25) return 'Christmas'
  if (m === 12 && d === 24) return 'Christmas Eve'
  if (m === 12 && d === 31) return "New Year's Eve"
  if (m === 1 && d === 1) return "New Year's Day"
  if (m === 7 && d === 4) return 'Fourth of July'
  return 'Holiday'
}

/** Set the dinner. A takeout night has no sides, so they're cleared with it. */
export function withDinner(day, dinner) {
  return dinner?.takeout ? { ...day, dinner, sides: [] } : { ...day, dinner }
}

/**
 * Sides and desserts travel with the dinner: moving a night swaps the two
 * days' dishes whole. A holiday belongs to its date, so it stays put.
 */
export function swapDays(days, fromIso, toIso) {
  const pick = (d) => ({ dinner: d?.dinner || null, sides: d?.sides || [], desserts: dessertsOf(d) })
  const strip = (d) => {
    const { dessert, ...rest } = d || {}
    return rest
  }
  return {
    ...days,
    [fromIso]: { ...strip(days[fromIso]), ...pick(days[toIso]) },
    [toIso]: { ...strip(days[toIso]), ...pick(days[fromIso]) },
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
    const dishes = [day.dinner, ...(day.sides || []), ...dessertsOf(day)].filter(Boolean)
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
      ...(day.desserts?.length ? { desserts: day.desserts.map(slim) } : {}),
    }
  }
  return changed ? { plan: { ...plan, days }, changed } : { plan, changed }
}
