import { HOUSE_RECIPES } from './houseRecipes'
import { moodForDay } from './weather'

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
 * pool: recipes to draw from (saved + house). exclude: ids already planned
 * this week, so a whole week of suggestions doesn't repeat.
 */
export function suggestForDay(weatherDay, pool, exclude = new Set()) {
  const mood = moodForDay(weatherDay)
  const candidates = pool.filter((r) => !exclude.has(r.id))
  if (candidates.length === 0) return null

  const scored = candidates
    .map((recipe) => ({ recipe, score: scoreRecipe(recipe, mood) }))
    .sort((a, b) => b.score - a.score)

  // Choose randomly among the top scorers so repeat visits feel fresh.
  const best = scored[0].score
  const top = scored.filter((s) => s.score === best || s.score >= best - 1)
  const pick = top[Math.floor(Math.random() * top.length)]
  return { recipe: pick.recipe, mood, matched: pick.score > 0 }
}

/** Suggestion pool = user's saved recipes first, then the house collection. */
export function buildPool(savedRecipes) {
  const seen = new Set()
  const pool = []
  for (const r of [...(savedRecipes || []), ...HOUSE_RECIPES]) {
    if (!seen.has(r.id)) {
      seen.add(r.id)
      pool.push(r)
    }
  }
  return pool
}
