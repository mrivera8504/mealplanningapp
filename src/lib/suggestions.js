import { HOUSE_RECIPES } from './houseRecipes'
import { moodForDay } from './weather'
import { fromISODate, toISODate } from './dates'

/**
 * Rotation: which dinner to suggest for a given night.
 *
 * History comes from the plan itself (every dinner it holds, past and
 * future, with its date) -- not a separate "recent" list -- so it syncs
 * across devices and only counts meals that actually stayed on the plan.
 *
 * Each eligible recipe is scored:
 *  - freshness: days since (or until) its nearest other night on the plan,
 *    on a curve that climbs steeply over the first couple of weeks and
 *    flattens out -- the backbone, so the whole book rotates
 *  - passed over: a recipe swapped away with "Another idea" is pushed down
 *    for two weeks (prefs.passedOn), so it doesn't bounce straight back
 *  - variety: loses points for sharing a cuisine or cooking style with the
 *    dinners planned around that night
 *  - favorite: a small bonus once it has rested
 *  - weather: only when the caller asks (`useWeather`) -- weather never
 *    shapes an ordinary suggestion
 *
 * Then, instead of taking the top score, one recipe is drawn at random from
 * the best few (weighted by score), so the same inputs don't always give the
 * same dinner. Recipes that have rested REST_DAYS are always preferred over
 * ones that haven't, so nothing repeats inside two weeks while the pool is
 * big enough to avoid it. A recipe pinned to a weekday wins that weekday
 * outright.
 */

export const REST_DAYS = 14 // a recipe isn't repeated inside this window if anything else is available
const FRESH_DAYS = 10 // freshness curve's time constant: ~63% fresh after 10 days, ~95% after a month
const FRESH_WEIGHT = 10
const TOO_SOON = 4 // days; anything closer than this is heavily penalised (only matters once the pool runs dry)
const PASSED_DAYS = 14 // how long a "not that one" is remembered
const PASSED_PENALTY = 8
const NEAR_NIGHTS = 2 // nights either side that count as "next to" this one
const WEEK_NIGHTS = 6
const NEAR_PENALTY = 3 // per match (cuisine, style) with a neighbouring night
const WEEK_PENALTY = 1 // per match with another night that week
const FAVORITE_BONUS = 2
const WEATHER_WEIGHT = 6 // only applied when the caller asks for a weather pick
const SHORTLIST_MARGIN = 1.5 // how far below the best score a recipe can be and still be drawn
const SHORTLIST_MAX = 6

const DAY_MS = 24 * 60 * 60 * 1000

const daysBetween = (isoA, isoB) =>
  Math.round(Math.abs(fromISODate(isoA).getTime() - fromISODate(isoB).getTime()) / DAY_MS)

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

/** The cooking style variety is judged on: a recipe's first category that isn't just "quick". */
export function styleOf(recipe) {
  return (recipe?.categories || []).find((c) => c !== 'quick' && c !== 'takeout') || null
}

/** Map of ISO date -> { id, cuisine, style } for every planned dinner; takeout nights are left out. */
export function plannedNights(plan) {
  const out = new Map()
  for (const [iso, day] of Object.entries(plan?.days || {})) {
    const meal = day?.dinner
    if (!meal?.id || meal.takeout) continue
    out.set(iso, { id: meal.id, cuisine: meal.cuisine || null, style: styleOf(meal) })
  }
  return out
}

/** Days between `iso` and the nearest other night the recipe is planned; Infinity if never. */
export function gapDays(dates, iso) {
  if (!dates?.length) return Infinity
  let best = Infinity
  for (const d of dates) {
    if (d === iso) continue
    best = Math.min(best, daysBetween(d, iso))
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

/** Points lost for echoing the cuisine or style of the dinners around `iso`. */
function varietyPenalty(recipe, iso, nights) {
  if (!nights?.size) return 0
  const cuisine = recipe.cuisine || null
  const style = styleOf(recipe)
  let nearCuisine = false
  let nearStyle = false
  let weekCuisine = false
  let weekStyle = false
  for (const [otherIso, other] of nights) {
    if (otherIso === iso || other.id === recipe.id) continue
    const d = daysBetween(otherIso, iso)
    if (d > WEEK_NIGHTS) continue
    const sameCuisine = cuisine && other.cuisine === cuisine
    const sameStyle = style && other.style === style
    if (d <= NEAR_NIGHTS) {
      nearCuisine ||= sameCuisine
      nearStyle ||= sameStyle
    } else {
      weekCuisine ||= sameCuisine
      weekStyle ||= sameStyle
    }
  }
  return (
    (nearCuisine ? NEAR_PENALTY : weekCuisine ? WEEK_PENALTY : 0) +
    (nearStyle ? NEAR_PENALTY : weekStyle ? WEEK_PENALTY : 0)
  )
}

/** How much a recent "Another idea" still counts against a recipe; fades to 0 over PASSED_DAYS. */
function passedPenalty(passedOn, today) {
  if (!passedOn) return 0
  const days = daysBetween(passedOn, today)
  return days >= PASSED_DAYS ? 0 : PASSED_PENALTY * (1 - days / PASSED_DAYS)
}

/** Draw one entry at random, weighted by how far it clears the shortlist floor. */
function drawWeighted(shortlist, floor, rng) {
  const weights = shortlist.map((c) => c.score - floor + 0.5)
  let roll = rng() * weights.reduce((a, b) => a + b, 0)
  for (let i = 0; i < shortlist.length; i++) {
    roll -= weights[i]
    if (roll <= 0) return shortlist[i]
  }
  return shortlist[shortlist.length - 1]
}

/**
 * Pick a suggestion for one night.
 *
 * pool: recipes to draw from.
 * exclude: ids that must not be picked (already planned this week, or just swapped away).
 * history: from servedDates(). nights: from plannedNights().
 * prefs: per-recipe rotation preferences (see RotationContext).
 * useWeather: let the forecast shape the pick. Off unless the caller asks.
 * restedOnly: return null rather than repeat something from the last REST_DAYS.
 * today / rng: injectable for tests.
 *
 * Returns { recipe, mood, matched, repeat } or null. `repeat` is true when
 * the pick had to come from recipes that haven't rested REST_DAYS.
 */
export function suggestForDay(
  weatherDay,
  iso,
  pool,
  {
    exclude = new Set(),
    history = new Map(),
    nights = new Map(),
    prefs = {},
    useWeather = false,
    restedOnly = false,
    today = toISODate(new Date()),
    rng = Math.random,
  } = {}
) {
  const mood = useWeather ? moodForDay(weatherDay) : null
  const weekday = fromISODate(iso).getDay()

  const candidates = []
  for (const recipe of pool) {
    if (exclude.has(recipe.id) || !isEligible(recipe, iso, prefs)) continue
    const p = prefs[recipe.id] || {}
    const gap = gapDays(history.get(recipe.id), iso)
    const rested = gap >= REST_DAYS
    const fit = weatherFit(recipe, mood)

    let score = (1 - Math.exp(-gap / FRESH_DAYS)) * FRESH_WEIGHT
    if (gap < TOO_SOON) score -= FRESH_WEIGHT
    score -= passedPenalty(p.passedOn, today)
    score -= varietyPenalty(recipe, iso, nights)
    if (p.favorite && rested) score += FAVORITE_BONUS
    score += fit * WEATHER_WEIGHT

    candidates.push({ recipe, score, fit, rested, pinned: p.night === weekday })
  }
  if (!candidates.length) return null

  // Rested recipes always come before ones that would repeat inside REST_DAYS.
  let field = candidates.filter((c) => c.rested)
  const repeat = field.length === 0
  if (repeat) {
    if (restedOnly) return null
    field = candidates
  }

  // A recipe pinned to this weekday wins it outright.
  const pinned = field.filter((c) => c.pinned)
  if (pinned.length) field = pinned

  field.sort((a, b) => b.score - a.score)
  const floor = field[0].score - SHORTLIST_MARGIN
  const shortlist = field.filter((c) => c.score >= floor).slice(0, SHORTLIST_MAX)
  const pick = drawWeighted(shortlist, floor, rng)

  return { recipe: pick.recipe, mood, matched: pick.fit > 0, repeat }
}

/**
 * Suggestion pool: personal recipes first, then saved, then the house
 * collection and the library of outside recipes. House and library entries
 * are tagged (`isHouseRecipe` / `isDiscovery`) so callers can offer to save
 * them -- if one has since been saved, its saved copy wins the dedupe below
 * and the tag drops off. Dismissed/snoozed recipes are filtered per night by
 * suggestForDay, not here.
 */
export function buildPool(savedRecipes, myRecipes, libraryRecipes = []) {
  const seen = new Set()
  const pool = []
  const house = HOUSE_RECIPES.map((r) => ({ ...r, isHouseRecipe: true }))
  const library = (libraryRecipes || []).map((r) => ({ ...r, isDiscovery: true }))
  for (const r of [...(myRecipes || []), ...(savedRecipes || []), ...house, ...library]) {
    if (!seen.has(r.id)) {
      seen.add(r.id)
      pool.push(r)
    }
  }
  return pool
}
