import { HOUSE_RECIPES } from './houseRecipes'
import { moodForDay } from './weather'

const RECENT_KEY = 'wfd:recent-meals'
const MAX_RECENT = 14

export function loadRecentIds() {
  try { return new Set(JSON.parse(localStorage.getItem(RECENT_KEY)) || []) } catch { return new Set() }
}

export function recordRecentId(id) {
  try {
    const arr = JSON.parse(localStorage.getItem(RECENT_KEY)) || []
    localStorage.setItem(RECENT_KEY, JSON.stringify([id, ...arr.filter((x) => x !== id)].slice(0, MAX_RECENT)))
  } catch {}
}

/**
 * Score a recipe against a weather mood: earlier categories in the mood list
 * carry more weight, so a "soup weather" day prefers soup over baked.
 */
function scoreRecipe(recipe, mood) {
  if (!mood) return 0
  let score = 0
  const cats = recipe.categories || []
  mood.categories.forEach((cat, i) => {
    if (cats.includes(cat)) score += mood.categories.length - i
  })
  return score
}

/**
 * Pick a suggestion for one day.
 * pool: recipes to draw from. exclude: ids already planned this week.
 * recentIds: ids used in recent weeks -- deprioritised but not blocked.
 */
export function suggestForDay(weatherDay, pool, exclude = new Set(), recentIds = new Set()) {
  const mood = moodForDay(weatherDay)
  const candidates = pool.filter((r) => !exclude.has(r.id))
  if (candidates.length === 0) return null

  const scored = candidates
    .map((recipe) => ({ recipe, score: scoreRecipe(recipe, mood) }))
    .sort((a, b) => b.score - a.score)

  const best = scored[0].score
  // Cast a wider net so swapping feels varied: include anything within 2 points
  // of the best score, which typically adds 2-3 more candidates per weather mood.
  const top = scored.filter((s) => s.score >= Math.max(0, best - 2))

  // Prefer recipes not used recently; fall back to all top scorers if needed.
  const fresh = top.filter((s) => !recentIds.has(s.recipe.id))
  const pool_to_pick = fresh.length > 0 ? fresh : top
  const pick = pool_to_pick[Math.floor(Math.random() * pool_to_pick.length)]
  return { recipe: pick.recipe, mood, matched: pick.score > 0 }
}

/** Suggestion pool: personal recipes first, then saved, then the house collection. */
export function buildPool(savedRecipes, myRecipes) {
  const seen = new Set()
  const pool = []
  for (const r of [...(myRecipes || []), ...(savedRecipes || []), ...HOUSE_RECIPES]) {
    if (!seen.has(r.id)) {
      seen.add(r.id)
      pool.push(r)
    }
  }
  return pool
}
