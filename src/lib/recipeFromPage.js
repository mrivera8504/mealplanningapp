/**
 * Reading a recipe straight from a recipe web page, for free.
 *
 * Nearly every recipe site embeds a schema.org "Recipe" block (JSON-LD) so
 * search engines can show it; this finds that block and turns it into the
 * same shape Spoonacular's extract returns, so the app's normalizeRecipe can
 * take either. Used by the /api/recipes/extract function before it falls back
 * to Spoonacular (which costs quota). Pure functions, no network.
 */

const UNICODE_FRACTIONS = { '¼': 0.25, '½': 0.5, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875, '⅕': 0.2 }

const UNITS = {
  cup: 'cup', cups: 'cups', c: 'cup',
  tablespoon: 'tbsp', tablespoons: 'tbsp', tbsp: 'tbsp', tbs: 'tbsp', tbl: 'tbsp', T: 'tbsp',
  teaspoon: 'tsp', teaspoons: 'tsp', tsp: 'tsp', t: 'tsp',
  ounce: 'oz', ounces: 'oz', oz: 'oz',
  pound: 'lb', pounds: 'lb', lb: 'lb', lbs: 'lb',
  gram: 'g', grams: 'g', g: 'g', kilogram: 'kg', kilograms: 'kg', kg: 'kg',
  milliliter: 'ml', milliliters: 'ml', ml: 'ml', liter: 'l', liters: 'l', l: 'l',
  pint: 'pint', pints: 'pints', quart: 'quart', quarts: 'quarts', gallon: 'gallon',
  clove: 'cloves', cloves: 'cloves', can: 'can', cans: 'cans', package: 'package', packages: 'packages', pkg: 'package',
  slice: 'slices', slices: 'slices', stick: 'stick', sticks: 'sticks', pinch: 'pinch', dash: 'dash',
  bunch: 'bunch', bunches: 'bunches', head: 'head', heads: 'heads', sprig: 'sprigs', sprigs: 'sprigs',
  jar: 'jar', jars: 'jars', bag: 'bag', bags: 'bags', large: '', medium: '', small: '',
}

const decodeEntities = (s) =>
  String(s ?? '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')

const clean = (s) => decodeEntities(String(s ?? '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()

function parseNumber(token) {
  if (!token) return null
  let t = token
  let total = 0
  for (const [ch, v] of Object.entries(UNICODE_FRACTIONS)) {
    if (t.includes(ch)) {
      total += v
      t = t.replace(ch, '')
    }
  }
  t = t.trim()
  if (!t) return total || null
  if (/^\d+\/\d+$/.test(t)) {
    const [a, b] = t.split('/').map(Number)
    return b ? total + a / b : null
  }
  const n = Number(t)
  return Number.isFinite(n) ? total + n : null
}

/**
 * "1 1/2 cups all-purpose flour, sifted" → { amount: 1.5, unit: 'cups', name: 'all-purpose flour' }.
 * Ranges ("2-3 cloves") take the higher number. Anything it can't read stays in `name`.
 */
export function parseIngredientLine(line) {
  const original = clean(line)
  let rest = original.replace(/^[-•*]\s*/, '')
  const qty = rest.match(/^((?:\d+\s+)?\d+\/\d+|\d*[¼½¾⅓⅔⅛⅜⅝⅞⅕]|\d+(?:\.\d+)?)(?:\s*(?:-|–|to)\s*((?:\d+\s+)?\d+\/\d+|\d*[¼½¾⅓⅔⅛⅜⅝⅞⅕]|\d+(?:\.\d+)?))?\s*/)
  let amount = null
  if (qty) {
    const first = qty[1].split(/\s+/).reduce((sum, part) => sum + (parseNumber(part) || 0), 0)
    const second = qty[2] ? qty[2].split(/\s+/).reduce((sum, part) => sum + (parseNumber(part) || 0), 0) : null
    amount = second || first || null
    rest = rest.slice(qty[0].length)
  }
  // "(14 ounce)" package sizes and similar asides
  rest = rest.replace(/^\([^)]*\)\s*/, '')
  let unit = ''
  const word = rest.match(/^([A-Za-z]+)\.?\s+/)
  const has = (k) => Object.prototype.hasOwnProperty.call(UNITS, k)
  // Exact case first, so "T" (tablespoon) and "t" (teaspoon) stay distinct.
  const key = word && (has(word[1]) ? word[1] : has(word[1].toLowerCase()) ? word[1].toLowerCase() : null)
  if (key && (amount != null || UNITS[key] === 'pinch' || UNITS[key] === 'dash')) {
    unit = UNITS[key]
    rest = rest.slice(word[0].length)
  }
  rest = rest.replace(/^of\s+/i, '')
  // Drop prep notes after a comma and trailing parentheticals: "onion, diced (about 1 cup)" → "onion"
  const name = rest.replace(/\s*\([^)]*\)\s*/g, ' ').split(',')[0].replace(/\s+/g, ' ').trim() || original
  return { name, amount, unit, original }
}

/** ISO 8601 duration ("PT1H15M") → minutes. */
export function parseDuration(iso) {
  const m = String(iso || '').match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/i)
  if (!m) return null
  const minutes = (Number(m[1]) || 0) * 1440 + (Number(m[2]) || 0) * 60 + (Number(m[3]) || 0)
  return minutes || null
}

const asArray = (v) => (v == null ? [] : Array.isArray(v) ? v : [v])

const isRecipe = (node) => asArray(node?.['@type']).some((t) => String(t).toLowerCase() === 'recipe')

/** Every JSON-LD object on the page, including those nested in @graph or arrays. */
function jsonLdNodes(html) {
  const out = []
  const visit = (node) => {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) return node.forEach(visit)
    out.push(node)
    if (node['@graph']) visit(node['@graph'])
    if (node.mainEntity) visit(node.mainEntity)
  }
  for (const m of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      visit(JSON.parse(m[1].trim()))
    } catch {
      /* some sites ship invalid JSON-LD; skip it */
    }
  }
  return out
}

function steps(instructions) {
  const out = []
  const walk = (node) => {
    if (!node) return
    if (typeof node === 'string') {
      clean(node)
        .split(/\n+/)
        .map((s) => s.trim())
        .filter(Boolean)
        .forEach((s) => out.push(s))
      return
    }
    if (Array.isArray(node)) return node.forEach(walk)
    if (node.itemListElement) return walk(node.itemListElement)
    if (node.text || node.name) out.push(clean(node.text || node.name))
  }
  walk(instructions)
  return out.filter(Boolean)
}

function image(img) {
  const first = asArray(img)[0]
  if (!first) return null
  return typeof first === 'string' ? first : first.url || first.contentUrl || null
}

const words = (s) => new Set(clean(s).toLowerCase().match(/[a-z]{3,}/g) || [])

/** On a round-up page with several recipes, the one whose name shares most words with `hint`. */
function pickRecipe(nodes, hint) {
  if (nodes.length <= 1 || !hint) return nodes[0] || null
  const want = words(hint)
  let best = nodes[0]
  let bestScore = -1
  for (const node of nodes) {
    const score = [...words(node.name)].filter((w) => want.has(w)).length
    if (score > bestScore) {
      best = node
      bestScore = score
    }
  }
  return best
}

/**
 * The page's recipe, shaped like a Spoonacular extract result, or null when
 * the page has no usable Recipe block.
 */
export function recipeFromHtml(html, pageUrl, hint = '') {
  const node = pickRecipe(jsonLdNodes(html).filter(isRecipe), hint)
  if (!node) return null
  const ingredients = asArray(node.recipeIngredient || node.ingredients).map(parseIngredientLine).filter((i) => i.name)
  if (!ingredients.length) return null
  const category = asArray(node.recipeCategory).map((c) => clean(c).toLowerCase())
  const servings = parseInt(asArray(node.recipeYield).map(String).find((y) => /\d/.test(y)) || '', 10)
  return {
    id: null,
    title: clean(node.name) || 'Imported recipe',
    image: image(node.image),
    sourceUrl: pageUrl,
    readyInMinutes: parseDuration(node.totalTime) || (parseDuration(node.prepTime) || 0) + (parseDuration(node.cookTime) || 0) || null,
    servings: Number.isFinite(servings) ? servings : null,
    summary: clean(node.description),
    cuisines: asArray(node.recipeCuisine).map(clean).filter(Boolean),
    dishTypes: category.flatMap((c) =>
      /dessert|cookie|cake|pie|sweet/.test(c) ? ['dessert'] : /side/.test(c) ? ['side dish'] : /main|dinner|entree|entrée/.test(c) ? ['main course'] : []
    ),
    diets: [],
    extendedIngredients: ingredients.map((i) => ({ name: i.name, nameClean: i.name, amount: i.amount, unit: i.unit, original: i.original })),
    analyzedInstructions: [{ steps: steps(node.recipeInstructions).map((step, i) => ({ number: i + 1, step })) }],
  }
}
