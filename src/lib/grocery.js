/**
 * Grocery list builder: merges ingredients across the week's planned meals,
 * summing quantities where units match and listing them side by side where
 * they don't.
 */

const UNIT_ALIASES = {
  tablespoon: 'tbsp', tablespoons: 'tbsp', tbsps: 'tbsp', T: 'tbsp',
  teaspoon: 'tsp', teaspoons: 'tsp', tsps: 'tsp',
  cups: 'cup', c: 'cup',
  ounce: 'oz', ounces: 'oz',
  pound: 'lb', pounds: 'lb', lbs: 'lb',
  grams: 'g', gram: 'g',
  kilogram: 'kg', kilograms: 'kg',
  milliliter: 'ml', milliliters: 'ml',
  liter: 'l', liters: 'l',
  cloves: 'clove', slices: 'slice', cans: 'can', bunches: 'bunch',
  sprigs: 'sprig', handfuls: 'handful', pints: 'pint', squares: 'square',
}

function normalizeUnit(unit) {
  const u = (unit || '').trim().toLowerCase()
  return UNIT_ALIASES[u] || u
}

/** Also the key Walmart product matches are remembered under. */
export function normalizeName(name) {
  return (name || '')
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/\b(fresh|large|small|medium|ripe|baby|boneless|skinless|chopped|diced|minced|sliced)\b/g, '')
    .replace(/[^a-z\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function fmtAmount(n) {
  if (n == null || Number.isNaN(n)) return ''
  const rounded = Math.round(n * 100) / 100
  const frac = { 0.25: '¼', 0.33: '⅓', 0.5: '½', 0.66: '⅔', 0.67: '⅔', 0.75: '¾' }
  const whole = Math.floor(rounded)
  const rem = Math.round((rounded - whole) * 100) / 100
  if (frac[rem]) return whole ? `${whole}${frac[rem]}` : frac[rem]
  return String(rounded)
}

/**
 * Where a rename is remembered: one recipe's one ingredient, so renaming
 * "cream" to "sour cream" for a dip leaves real cream in a soup alone.
 */
export const renameSource = (meal, ingredientName) => `${meal.id || meal.title}::${normalizeName(ingredientName)}`

/**
 * plannedMeals: [{id, title, ingredients: [{name, amount, unit}]}]
 * renames: { [renameSource]: 'new name' } — applied before merging, so a
 *   renamed ingredient joins any existing item of that name.
 * Returns [{key, name, quantities: 'text', recipes: [titles], sources: [renameSource],
 *   renamedFrom: [original names]}] sorted by name.
 */
export function buildGroceryItems(plannedMeals, renames = {}) {
  const merged = new Map()
  for (const meal of plannedMeals) {
    for (const ing of meal.ingredients || []) {
      if (!normalizeName(ing.name)) continue
      const source = renameSource(meal, ing.name)
      const renamed = renames[source]
      const name = renamed || ing.name
      const key = normalizeName(name)
      if (!key) continue
      if (!merged.has(key)) {
        merged.set(key, { key, name, units: new Map(), recipes: new Set(), sources: new Set(), renamedFrom: new Set() })
      }
      const item = merged.get(key)
      item.recipes.add(meal.title)
      item.sources.add(source)
      if (renamed) item.renamedFrom.add(ing.name)
      const unit = normalizeUnit(ing.unit)
      const amount = typeof ing.amount === 'number' ? ing.amount : parseFloat(ing.amount)
      if (!Number.isNaN(amount)) {
        item.units.set(unit, (item.units.get(unit) || 0) + amount)
      } else if (!item.units.has(unit)) {
        item.units.set(unit, null)
      }
    }
  }

  return [...merged.values()]
    .map((item) => ({
      key: item.key,
      name: item.name,
      quantities: [...item.units.entries()]
        .filter(([, amt]) => amt != null)
        .map(([unit, amt]) => (unit ? `${fmtAmount(amt)} ${unit}` : fmtAmount(amt)))
        .join(' + '),
      recipes: [...item.recipes],
      sources: [...item.sources],
      renamedFrom: [...item.renamedFrom],
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}
