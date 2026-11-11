import { HOUSE_RECIPES } from './houseRecipes'
import { HOUSE_DESSERTS, HOUSE_SIDES } from './houseExtras'
import { courseOf, mainBrings, sideKind } from './courses'
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

/** What a day holds for one course, as a list: its dinner, its sides, or its dessert. */
export function dishesOf(day, course = 'main') {
  if (course === 'side') return (day?.sides || []).filter(Boolean)
  const dish = course === 'dessert' ? day?.dessert : day?.dinner
  return dish ? [dish] : []
}

/**
 * Map of recipe id -> ISO dates it's planned for, taken from the whole plan.
 * Each course keeps its own history, so sides and desserts rotate on their own.
 */
export function servedDates(plan, course = 'main') {
  const out = new Map()
  for (const [iso, day] of Object.entries(plan?.days || {})) {
    for (const dish of dishesOf(day, course)) {
      if (!dish?.id || dish.takeout) continue
      if (!out.has(dish.id)) out.set(dish.id, [])
      out.get(dish.id).push(iso)
    }
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

/** The part of a score every course shares: freshness, less any recent "not that one". */
function baseScore(gap, passedOn, today) {
  let score = (1 - Math.exp(-gap / FRESH_DAYS)) * FRESH_WEIGHT
  if (gap < TOO_SOON) score -= FRESH_WEIGHT
  return score - passedPenalty(passedOn, today)
}

/**
 * Choose from scored candidates ({ score, rested, pinned? }): rested ones
 * first, a pinned one outright, otherwise a weighted draw from the best few.
 * Returns { pick, repeat }, or null when there's nothing (or nothing rested
 * and `restedOnly` is set).
 */
function choose(candidates, { restedOnly, rng }) {
  if (!candidates.length) return null
  let field = candidates.filter((c) => c.rested)
  const repeat = field.length === 0
  if (repeat) {
    if (restedOnly) return null
    field = candidates
  }
  const pinned = field.filter((c) => c.pinned)
  if (pinned.length) field = pinned

  field.sort((a, b) => b.score - a.score)
  const floor = field[0].score - SHORTLIST_MARGIN
  const shortlist = field.filter((c) => c.score >= floor).slice(0, SHORTLIST_MAX)
  return { pick: drawWeighted(shortlist, floor, rng), repeat }
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

    let score = baseScore(gap, p.passedOn, today)
    score -= varietyPenalty(recipe, iso, nights)
    if (p.favorite && rested) score += FAVORITE_BONUS
    score += fit * WEATHER_WEIGHT

    candidates.push({ recipe, score, fit, rested, pinned: p.night === weekday })
  }

  // Rested recipes come before ones that would repeat inside REST_DAYS, and a
  // recipe pinned to this weekday wins it outright.
  const chosen = choose(candidates, { restedOnly, rng })
  if (!chosen) return null
  return { recipe: chosen.pick.recipe, mood, matched: chosen.pick.fit > 0, repeat: chosen.repeat }
}

const PAIR_CUISINE_BONUS = 2 // a side from the same cuisine as the main
const PAIR_STYLE_PENALTY = 4 // a side cooked the same way as the main (pasta beside pasta)
const PAIR_STARCH_PENALTY = 4 // a second starch beside a main that brings its own
const PAIR_GREENS_BONUS = 2.5 // a vegetable or salad beside a main with neither
const PAIR_SAME_KIND_PENALTY = 5 // a second side of the same kind as one already there

/**
 * Pick a side or a dessert for one night. Sides and desserts rotate on their
 * own history (servedDates(plan, course)) with the same freshness, rest and
 * passed-over rules as dinners, and are never shaped by weather or weekday.
 *
 * Sides are also paired with the night: a bonus for matching the main's
 * cuisine and for bringing a vegetable or salad to a main with neither; a
 * penalty for repeating the main's cooking style, doubling up on starch, or
 * matching the kind of a side already planned. Desserts go on freshness alone.
 *
 * main: the night's dinner, if any. sides: sides already on that night.
 * Returns { recipe, repeat } or null.
 */
export function suggestExtra(
  course,
  iso,
  pool,
  {
    main = null,
    sides = [],
    exclude = new Set(),
    history = new Map(),
    prefs = {},
    restedOnly = false,
    today = toISODate(new Date()),
    rng = Math.random,
  } = {}
) {
  const brings = mainBrings(main)
  const mainStyle = styleOf(main)
  const kindsPlanned = new Set(sides.map(sideKind))
  const taken = new Set(sides.map((s) => s.id))

  const candidates = []
  for (const recipe of pool) {
    if (exclude.has(recipe.id) || taken.has(recipe.id)) continue
    const p = prefs[recipe.id] || {}
    if (p.dismissed || (p.snoozeUntil && iso < p.snoozeUntil)) continue
    const gap = gapDays(history.get(recipe.id), iso)
    const rested = gap >= REST_DAYS

    let score = baseScore(gap, p.passedOn, today)
    if (p.favorite && rested) score += FAVORITE_BONUS
    if (course === 'side') {
      const kind = sideKind(recipe)
      if (main?.cuisine && recipe.cuisine === main.cuisine) score += PAIR_CUISINE_BONUS
      if (mainStyle && styleOf(recipe) === mainStyle) score -= PAIR_STYLE_PENALTY
      if (kind === 'starch' && brings.starch) score -= PAIR_STARCH_PENALTY
      if ((kind === 'vegetable' || kind === 'salad') && !brings.greens) score += PAIR_GREENS_BONUS
      if (kind === 'salad' && brings.greens && (main?.categories || []).includes('salad')) score -= PAIR_STYLE_PENALTY
      if (kindsPlanned.has(kind)) score -= PAIR_SAME_KIND_PENALTY
    }
    candidates.push({ recipe, score, rested })
  }

  const chosen = choose(candidates, { restedOnly, rng })
  return chosen ? { recipe: chosen.pick.recipe, repeat: chosen.repeat } : null
}

/**
 * Suggestion pool for one course: personal recipes first, then saved, then
 * the house collection and the library of outside recipes. House and library
 * entries are tagged (`isHouseRecipe` / `isDiscovery`) so callers can offer to
 * save them -- if one has since been saved, its saved copy wins the dedupe
 * below and the tag drops off. Dismissed/snoozed recipes are filtered per
 * night by the suggest functions, not here.
 *
 * Only recipes of the asked-for course are returned, so a saved dessert can
 * never be suggested for dinner.
 */
export function buildPool(savedRecipes, myRecipes, libraryRecipes = [], course = 'main') {
  const seen = new Set()
  const pool = []
  const houseSet = course === 'side' ? HOUSE_SIDES : course === 'dessert' ? HOUSE_DESSERTS : HOUSE_RECIPES
  const house = houseSet.map((r) => ({ ...r, isHouseRecipe: true }))
  const library = (libraryRecipes || []).map((r) => ({ ...r, isDiscovery: true }))
  for (const r of [...(myRecipes || []), ...(savedRecipes || []), ...house, ...library]) {
    if (seen.has(r.id) || courseOf(r) !== course) continue
    seen.add(r.id)
    pool.push(r)
  }
  return pool
}
