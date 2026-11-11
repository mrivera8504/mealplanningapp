import { canonicalKey, normalizeName } from './grocery'
import { sectionFor } from './sections'

/**
 * Data for the Ingredients page: one row per ingredient the app knows,
 * joined by normalized name from three places -- Walmart matches, the
 * household's ingredient notes (sections, names, hand-added staples), and
 * every ingredient in My recipes and saved recipes. Merged ingredients fold
 * into the one they were merged under.
 */

export const STATUSES = [
  { value: 'all', label: 'All' },
  { value: 'matched', label: 'Matched' },
  { value: 'unmatched', label: 'Unmatched' },
  { value: 'skip', label: 'Not at Walmart' },
  { value: 'unavailable', label: 'Unavailable' },
]

export function statusOf(match) {
  if (match?.skip) return 'skip'
  if (match?.product) return match.unavailable ? 'unavailable' : 'matched'
  return 'unmatched'
}

const STATUS_RANK = { unavailable: 0, unmatched: 1, matched: 2, skip: 3 }

/**
 * matches: meta/walmart items. ingredients: { items, aliases }.
 * recipes: My recipes, saved recipes, and recently planned dinners (duplicates are fine).
 * Returns [{ key, name, recipes: [titles], section, match, status, mergedFrom: [{ key, name }] }]
 */
export function buildIngredientRows({ matches = {}, ingredients = {}, recipes = [] }) {
  const items = ingredients.items || {}
  const aliases = ingredients.aliases || {}
  const rows = new Map()
  const ownNames = new Map() // key -> first name seen for it, before merging

  const touch = (rawKey, name) => {
    if (!rawKey) return null
    if (!ownNames.has(rawKey)) ownNames.set(rawKey, items[rawKey]?.name || name || rawKey)
    const key = canonicalKey(rawKey, aliases)
    if (!rows.has(key)) rows.set(key, { key, name: null, recipes: new Set(), aisle: null })
    const row = rows.get(key)
    if (key === rawKey && !row.name) row.name = items[key]?.name || name || null
    return row
  }

  const seenRecipes = new Set()
  for (const recipe of recipes) {
    const id = recipe.id || recipe.title
    if (seenRecipes.has(id)) continue
    seenRecipes.add(id)
    for (const ing of recipe.ingredients || []) {
      const row = touch(normalizeName(ing.name), ing.name)
      if (!row) continue
      row.recipes.add(recipe.title)
      row.aisle ||= ing.aisle || null
    }
  }
  for (const key of Object.keys(matches)) touch(key, matches[key]?.product ? null : key)
  for (const [key, item] of Object.entries(items)) if (item.addedByHand || item.section) touch(key, item.name)

  // Who was merged into whom.
  const mergedFrom = new Map()
  for (const rawKey of Object.keys(aliases)) {
    const kept = canonicalKey(rawKey, aliases)
    if (kept === rawKey) continue
    if (!mergedFrom.has(kept)) mergedFrom.set(kept, [])
    mergedFrom.get(kept).push({ key: rawKey, name: ownNames.get(rawKey) || items[rawKey]?.name || rawKey })
  }

  return [...rows.values()].map((row) => {
    const name = row.name || ownNames.get(row.key) || row.key
    const match = matches[row.key] || null
    return {
      key: row.key,
      name,
      recipes: [...row.recipes].sort(),
      section: sectionFor({ chosen: items[row.key]?.section, aisle: row.aisle, name }),
      match,
      status: statusOf(match),
      mergedFrom: mergedFrom.get(row.key) || [],
    }
  })
}

/** Search, filter by status, and sort rows for display. */
export function viewRows(rows, { query = '', status = 'all', sort = 'name' } = {}) {
  const q = query.trim().toLowerCase()
  const shown = rows.filter((r) => {
    if (status !== 'all' && r.status !== status) return false
    if (!q) return true
    return (
      r.name.toLowerCase().includes(q) ||
      r.mergedFrom.some((m) => m.name.toLowerCase().includes(q)) ||
      (r.match?.product?.name || '').toLowerCase().includes(q)
    )
  })
  const byName = (a, b) => a.name.localeCompare(b.name)
  const compare =
    sort === 'section'
      ? (a, b) => a.section.localeCompare(b.section) || byName(a, b)
      : sort === 'status'
        ? (a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || byName(a, b)
        : byName
  return shown.sort(compare)
}

/**
 * Merge `keys` into `keptKey`, listed as `keptName`. Recipes aren't edited:
 * the merge is stored as aliases, so it can be split again. Returns the new
 * ingredients data and, when the kept ingredient has no Walmart match but a
 * merged one does, the entry to copy over.
 */
export function mergeIngredients(data, matches, keys, keptKey, keptName) {
  const others = keys.filter((k) => k !== keptKey)
  const aliases = { ...(data.aliases || {}) }
  delete aliases[keptKey]
  for (const k of others) aliases[k] = keptKey
  // Anything previously merged into one of the others now points at the kept key.
  for (const [k, target] of Object.entries(aliases)) if (others.includes(target)) aliases[k] = keptKey

  const items = { ...(data.items || {}) }
  const kept = { ...items[keptKey], name: keptName }
  if (!kept.section) {
    const withSection = others.find((k) => items[k]?.section)
    if (withSection) kept.section = items[withSection].section
  }
  items[keptKey] = kept

  let walmartCopy = null
  if (!matches[keptKey]) {
    const donor = others.find((k) => matches[k]?.product) || others.find((k) => matches[k]?.skip)
    if (donor) walmartCopy = matches[donor]
  }
  return { data: { ...data, items, aliases }, walmartCopy }
}

/** Undo one merge: the ingredient goes back to being its own line. */
export function splitIngredient(data, key) {
  const aliases = { ...(data.aliases || {}) }
  delete aliases[key]
  return { ...data, aliases }
}
