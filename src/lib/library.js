import { fromISODate } from './dates'

/**
 * The library: outside (Spoonacular) recipes the app has collected for
 * suggestions. Unlike the old weekly batch it accumulates -- each refill adds
 * to it -- so the pool of new ideas keeps growing instead of resetting.
 *
 * A refill is two searches: one aimed at what the household already cooks
 * ("taste"), one at a cuisine that hasn't been on the plan lately ("explore").
 * Everything here is pure; the fetching and storing live in useLibrary.
 */

export const LIBRARY_CAP = 150
export const REFILL_EVERY_DAYS = 7
export const RETRY_AFTER_DAYS = 1 // after a failed or low-stock refill, don't try again sooner than this
export const LOW_STOCK = 10 // refill early when fewer than this many library recipes are still unplanned
const TASTE_WINDOW_DAYS = 56
const EXPLORE_WINDOW_DAYS = 28

const DAY_MS = 24 * 60 * 60 * 1000

/** Cuisines Spoonacular search accepts that the app offers -- keep in step with RecipesView. */
export const CUISINES = [
  'American', 'Chinese', 'French', 'Greek', 'Indian', 'Italian', 'Japanese',
  'Mediterranean', 'Mexican', 'Middle Eastern', 'Spanish', 'Thai', 'Vietnamese',
]

const daysAgo = (iso, todayIso) =>
  Math.round((fromISODate(todayIso).getTime() - fromISODate(iso).getTime()) / DAY_MS)

/** Dinners on the plan within `windowDays` before (or after) today. */
function recentDinners(plan, todayIso, windowDays) {
  const out = []
  for (const [iso, day] of Object.entries(plan?.days || {})) {
    const meal = day?.dinner
    if (!meal?.id || meal.takeout) continue
    if (Math.abs(daysAgo(iso, todayIso)) <= windowDays) out.push(meal)
  }
  return out
}

/**
 * Cuisines the household leans toward, best first: favorites count triple,
 * saved and personal recipes once, and every dinner planned in the last
 * eight weeks once. Only cuisines Spoonacular can search by are returned.
 */
export function tasteCuisines({ saved = [], mine = [], prefs = {}, plan, today }) {
  const tally = new Map()
  const add = (cuisine, weight) => {
    if (!cuisine || !CUISINES.includes(cuisine)) return
    tally.set(cuisine, (tally.get(cuisine) || 0) + weight)
  }
  for (const r of [...saved, ...mine]) add(r.cuisine, prefs[r.id]?.favorite ? 3 : 1)
  for (const meal of recentDinners(plan, today, TASTE_WINDOW_DAYS)) add(meal.cuisine, 1)
  return [...tally.entries()].sort((a, b) => b[1] - a[1]).map(([cuisine]) => cuisine)
}

/** Cuisines that haven't been on the plan in the last four weeks. */
export function exploreCuisines({ plan, today }) {
  const recent = new Set(recentDinners(plan, today, EXPLORE_WINDOW_DAYS).map((m) => m.cuisine))
  return CUISINES.filter((c) => !recent.has(c))
}

const pickOne = (list, rng) => list[Math.floor(rng() * list.length)]

/**
 * The searches for one refill: [{ reason, cuisine, type, course }]. The taste
 * search draws from the top three leanings (or any cuisine when there's no
 * history yet); the explore search takes a cuisine that's been absent, and
 * never the same one as the taste search. A third search tops up sides or
 * desserts, alternating week to week (`lastExtra` is what the last refill
 * fetched), so those pools grow too.
 */
export function planRefill(context, rng = Math.random, lastExtra = null) {
  const taste = tasteCuisines(context).slice(0, 3)
  const tasteCuisine = taste.length ? pickOne(taste, rng) : null
  let explore = exploreCuisines(context).filter((c) => c !== tasteCuisine)
  if (!explore.length) explore = CUISINES.filter((c) => c !== tasteCuisine)
  const extra = lastExtra === 'side' ? 'dessert' : 'side'
  return [
    { reason: 'taste', cuisine: tasteCuisine, type: 'main course', course: 'main' },
    { reason: 'explore', cuisine: pickOne(explore, rng), type: 'main course', course: 'main' },
    { reason: extra, cuisine: null, type: extra === 'side' ? 'side dish' : 'dessert', course: extra },
  ]
}

/** Drop results the library shouldn't take: duplicates, already saved, dismissed, or unusable. */
export function filterNew(recipes, { libraryIds, savedIds, prefs = {} }) {
  const seen = new Set()
  return recipes.filter((r) => {
    if (!r?.id || seen.has(r.id)) return false
    seen.add(r.id)
    if (libraryIds.has(r.id) || savedIds.has(r.id)) return false
    if (prefs[r.id]?.dismissed) return false
    return r.ingredients?.length > 0
  })
}

/**
 * Ids to drop so the library fits LIBRARY_CAP: oldest first, and only
 * recipes that were never planned -- anything that made it onto the plan stays.
 */
export function evictions(library, plannedIds, cap = LIBRARY_CAP) {
  const over = library.length - cap
  if (over <= 0) return []
  return library
    .filter((r) => !plannedIds.has(r.id))
    .sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0))
    .slice(0, over)
    .map((r) => r.id)
}

/**
 * Whether to fetch now. Weekly as a rule; sooner when stock is low; and never
 * more than once a day, so a failing key or spent quota isn't hammered.
 */
export function needsRefill(meta, unplannedCount, now = Date.now()) {
  const lastAttempt = meta?.lastAttemptAt || meta?.lastFetchAt || 0
  const sinceAttempt = (now - lastAttempt) / DAY_MS
  if (sinceAttempt < RETRY_AFTER_DAYS) return false
  if (meta?.lastError) return true
  const sinceFetch = (now - (meta?.lastFetchAt || 0)) / DAY_MS
  return sinceFetch >= REFILL_EVERY_DAYS || unplannedCount < LOW_STOCK
}

/** Plain-language cause for a failed refill, for Settings and the warning toast. */
export function describeRefillError(code) {
  if (code === 'not_configured') return 'no Spoonacular API key is set up'
  if (code === 'quota_exceeded') return "today's Spoonacular quota is used up"
  return 'the recipe service did not respond'
}
