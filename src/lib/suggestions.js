import { HOUSE_RECIPES } from './houseRecipes'
import { moodForDay } from './weather'
import { fromISODate } from './dates'

/**
 * Rotation: which dinner to suggest for a given night.
 *
 * History comes from the plan itself (every dinner it holds, past and
 * future, with its date) -- not a separate "recent" list -- so it syncs
 * across devices and only counts meals that actually stayed on the plan,
 * never ideas that were swapped away.
 *
 * Each eligible recipe is scored, and the best score wins:
 *  - freshness: days since (or until) its nearest other appearance on the
 *    plan, on a curve that climbs steeply over the first couple of weeks and
 *    flattens out -- the backbone, so the whole book rotates before anything
 *    repeats
 *  - weather: multiplies freshness by up to WEATHER_BOOST -- it decides
 *    between similarly fresh recipes but can't bring back last week's dinner
 *  - favorite: comes back sooner than other recipes
 *  - fixed night: a recipe pinned to a weekday wins that weekday
 *  - a little jitter so ties don't always break the same way
 */

const FRESH_DAYS = 10 // freshness curve's time constant: ~63% fresh after 10 days, ~95% after a month
const FRESH_WEIGHT = 10
const WEATHER_BOOST = 0.3
const TOO_SOON = 4 // days; anything closer than this is heavily penalised
const FAVORITE_AFTER = 10 // days before a favorite starts getting its boost
const FAVORITE_BONUS = 3
const FIXED_NIGHT_BONUS = 20
const JITTER = 2

const DAY_MS = 24 * 60 * 60 * 1000

/** Map of recipe id -> ISO dates it's planned for, taken from the whole plan. */
export function servedDates(plan) {
  const out = new Map()
  for (const [iso, day] of Object.entries(plan?.days || {})) {
    const meal = day?.dinner
    if (!meal?.id || meal.takeout) continue
    if (!out.has(meal.id)) out.set(meal.id, [])
    out.get(meal.id).push(iso)
  }
  return out
}

/** Days between `iso` and the nearest other night the recipe is planned; Infinity if never. */
function gapDays(dates, iso) {
  if (!dates?.length) return Infinity
  const t = fromISODate(iso).getTime()
  let best = Infinity
  for (const d of dates) {
    if (d === iso) continue
    best = Math.min(best, Math.round(Math.abs(fromISODate(d).getTime() - t) / DAY_MS))
  }
  return best
}

/**
 * Whether a recipe may be suggested for `iso` at all: not dismissed, not
 * snoozed past that date, and -- if pinned to a weekday -- only on that weekday.
 */
export function isEligible(recipe, iso, prefs) {
  const p = prefs?.[recipe.id]
  if (!p) return true
  if (p.dismissed) return false
  if (p.snoozeUntil && iso < p.snoozeUntil) return false
  if (p.night != null && p.night !== fromISODate(iso).getDay()) return false
  return true
}

/**
 * Weather fit: earlier categories in the mood list carry more weight, so a
 * "soup weather" day prefers soup over baked. Returns 0..1.
 */
function weatherFit(recipe, mood) {
  if (!mood) return 0
  const n = mood.categories.length
  const cats = recipe.categories || []
  let score = 0
  mood.categories.forEach((cat, i) => {
    if (cats.includes(cat)) score += n - i
  })
  return score / ((n * (n + 1)) / 2)
}

/**
 * Pick a suggestion for one night.
 * pool: recipes to draw from. exclude: ids that must not be picked (already
 * planned this week, or just swapped away). history: from servedDates().
 * prefs: per-recipe rotation preferences (see RotationContext).
 */
export function suggestForDay(weatherDay, iso, pool, { exclude = new Set(), history = new Map(), prefs = {} } = {}) {
  const mood = moodForDay(weatherDay)
  const weekday = fromISODate(iso).getDay()

  let best = null
  for (const recipe of pool) {
    if (exclude.has(recipe.id) || !isEligible(recipe, iso, prefs)) continue
    const p = prefs[recipe.id] || {}
    const gap = gapDays(history.get(recipe.id), iso)
    const fit = weatherFit(recipe, mood)

    let score = (1 - Math.exp(-gap / FRESH_DAYS)) * FRESH_WEIGHT * (1 + fit * WEATHER_BOOST)
    if (gap < TOO_SOON) score -= FRESH_WEIGHT
    if (p.favorite && gap >= FAVORITE_AFTER) score += FAVORITE_BONUS
    if (p.night === weekday) score += FIXED_NIGHT_BONUS
    score += Math.random() * JITTER

    if (!best || score > best.score) best = { recipe, score, fit }
  }

  if (!best) return null
  return { recipe: best.recipe, mood, matched: best.fit > 0 }
}

/**
 * Suggestion pool: personal recipes first, then saved, then the house
 * collection and this week's discovery batch. House and discovery entries
 * are tagged (`isHouseRecipe` / `isDiscovery`) so callers can offer to save
 * them -- if one has since been saved, its saved copy wins the dedupe below
 * and the tag drops off. Dismissed/snoozed recipes are filtered per night by
 * suggestForDay, not here.
 */
export function buildPool(savedRecipes, myRecipes, discoveryRecipes = []) {
  const seen = new Set()
  const pool = []
  const house = HOUSE_RECIPES.map((r) => ({ ...r, isHouseRecipe: true }))
  const discovery = (discoveryRecipes || []).map((r) => ({ ...r, isDiscovery: true }))
  for (const r of [...(myRecipes || []), ...(savedRecipes || []), ...house, ...discovery]) {
    if (!seen.has(r.id)) {
      seen.add(r.id)
      pool.push(r)
    }
  }
  return pool
}
