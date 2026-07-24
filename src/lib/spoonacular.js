/**
 * Client for the /api/recipes serverless proxy (see netlify/functions).
 * Normalizes Spoonacular's shapes into the app's single recipe format:
 * { id, spoonacularId, title, image, categories, cuisine, diets,
 *   readyInMinutes, servings, summary, ingredients, steps, nutrition, sourceUrl }
 */

const DISH_TYPE_TO_CATEGORY = {
  soup: 'soup',
  stew: 'stew',
  'main course': null,
  'main dish': null,
  salad: 'salad',
  'side dish': null,
}

function categoriesFrom(recipe) {
  const cats = new Set()
  for (const dt of recipe.dishTypes || []) {
    const mapped = DISH_TYPE_TO_CATEGORY[dt]
    if (mapped) cats.add(mapped)
  }
  const title = (recipe.title || '').toLowerCase()
  if (/\bsoup|chowder|bisque\b/.test(title)) cats.add('soup')
  if (/\bstew|chili|curry|dal\b/.test(title)) cats.add('stew')
  if (/\bbraise|braised|pot roast\b/.test(title)) cats.add('braise')
  if (/\bbaked|casserole|lasagna|gratin|pot pie\b/.test(title)) cats.add('baked')
  if (/\broast|roasted\b/.test(title)) cats.add('roast')
  if (/\bpasta|spaghetti|penne|rigatoni|orzo|noodle\b/.test(title)) cats.add('pasta')
  if (/\bgrill|grilled|bbq|barbecue|kebab|skewer|burger\b/.test(title)) cats.add('grill')
  if (/\bsalad|slaw\b/.test(title)) cats.add('salad')
  if (/\bcold|chilled|gazpacho|ceviche\b/.test(title)) cats.add('cold')
  if ((recipe.readyInMinutes || 99) <= 30) cats.add('quick')
  return [...cats]
}

function stripHtml(html) {
  return (html || '').replace(/<[^>]+>/g, '')
}

export function normalizeRecipe(raw) {
  const nutrients = raw.nutrition?.nutrients || []
  const grab = (name) => {
    const n = nutrients.find((x) => x.name === name)
    return n ? `${Math.round(n.amount)}${n.unit === 'kcal' ? '' : n.unit}` : null
  }
  return {
    id: `sp-${raw.id}`,
    spoonacularId: raw.id,
    title: raw.title,
    image: raw.image || null,
    categories: categoriesFrom(raw),
    cuisine: raw.cuisines?.[0] || null,
    diets: raw.diets || [],
    readyInMinutes: raw.readyInMinutes || null,
    servings: raw.servings || null,
    summary: stripHtml(raw.summary).split('. ').slice(0, 2).join('. '),
    sourceUrl: raw.sourceUrl || null,
    ingredients: (raw.extendedIngredients || []).map((ing) => ({
      name: ing.nameClean || ing.name || ing.originalName,
      amount: ing.measures?.us?.amount ?? ing.amount ?? null,
      unit: ing.measures?.us?.unitShort ?? ing.unit ?? '',
      original: ing.original,
    })),
    steps: (raw.analyzedInstructions?.[0]?.steps || []).map((s) => s.step),
    nutrition: nutrients.length
      ? { calories: grab('Calories'), protein: grab('Protein'), carbs: grab('Carbohydrates'), fat: grab('Fat') }
      : null,
  }
}

export class SpoonacularError extends Error {
  constructor(code) {
    super(code)
    this.code = code
  }
}

async function call(path, params) {
  const qs = params ? `?${new URLSearchParams(params)}` : ''
  const res = await fetch(`/api/recipes${path}${qs}`)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new SpoonacularError(data.error || 'upstream_error')
  return data
}

/** Search; params: {query, cuisine, diet, type, includeIngredients, maxReadyTime} */
export async function searchRecipes(params) {
  const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v))
  const data = await call('', clean)
  return (data.results || []).map(normalizeRecipe)
}

/** Full detail (nutrition + complete ingredients/steps). */
export async function getRecipeDetail(spoonacularId) {
  const data = await call(`/${spoonacularId}`)
  return normalizeRecipe(data)
}
