import { describe, expect, it } from 'vitest'
import { buildGroceryItems } from './grocery'
import { buildIngredientRows, mergeIngredients, splitIngredient, viewRows } from './ingredientsPage'

const product = (itemId, name) => ({ itemId, name, price: 1.5, size: null, image: null })

const recipes = [
  { title: 'Chili', ingredients: [{ name: 'yellow onion', amount: 1, unit: '' }, { name: 'ground beef', amount: 1, unit: 'lb', aisle: 'Meat' }] },
  { title: 'Soup', ingredients: [{ name: 'onion', amount: 2, unit: '' }, { name: 'chicken stock', amount: 4, unit: 'cups' }] },
]
const matches = {
  onion: { product: product('1', 'Yellow Onions 3 lb'), qty: 1, updatedAt: 1 },
  'ground beef': { skip: true, updatedAt: 1 },
  coffee: { product: product('9', 'Coffee'), qty: 1, updatedAt: 1, unavailable: true },
}

describe('buildIngredientRows', () => {
  it('joins recipes, Walmart matches and hand-added staples', () => {
    const rows = buildIngredientRows({
      matches,
      ingredients: { items: { 'paper towels': { name: 'Paper towels', addedByHand: true } } },
      recipes,
    })
    const byKey = Object.fromEntries(rows.map((r) => [r.key, r]))
    expect(Object.keys(byKey).sort()).toEqual(['chicken stock', 'coffee', 'ground beef', 'onion', 'paper towels', 'yellow onion'])
    expect(byKey.onion.status).toBe('matched')
    expect(byKey['ground beef'].status).toBe('skip')
    expect(byKey['ground beef'].section).toBe('Meat and seafood')
    expect(byKey.coffee.status).toBe('unavailable')
    expect(byKey['yellow onion'].status).toBe('unmatched')
    expect(byKey['paper towels'].name).toBe('Paper towels')
  })

  it('folds merged ingredients into the kept one', () => {
    const rows = buildIngredientRows({
      matches,
      ingredients: { items: { onion: { name: 'Onions' } }, aliases: { 'yellow onion': 'onion' } },
      recipes,
    })
    const onion = rows.find((r) => r.key === 'onion')
    expect(rows.some((r) => r.key === 'yellow onion')).toBe(false)
    expect(onion.name).toBe('Onions')
    expect(onion.recipes).toEqual(['Chili', 'Soup'])
    expect(onion.mergedFrom).toEqual([{ key: 'yellow onion', name: 'yellow onion' }])
  })
})

describe('viewRows', () => {
  const rows = buildIngredientRows({ matches, ingredients: {}, recipes })
  it('searches names and product names', () => {
    expect(viewRows(rows, { query: 'yellow onions 3' }).map((r) => r.key)).toEqual(['onion'])
  })
  it('filters by status and sorts by status', () => {
    expect(viewRows(rows, { status: 'unmatched' }).map((r) => r.key)).toEqual(['chicken stock', 'yellow onion'])
    expect(viewRows(rows, { sort: 'status' })[0].key).toBe('coffee')
  })
})

describe('merging', () => {
  it('stores aliases, keeps the chosen name, and borrows a Walmart match when the kept one has none', () => {
    const { data, walmartCopy } = mergeIngredients(
      { items: { onion: { section: 'Produce' } }, aliases: { 'red onion': 'yellow onion' } },
      matches,
      ['yellow onion', 'onion'],
      'yellow onion',
      'Onion'
    )
    expect(data.aliases).toEqual({ onion: 'yellow onion', 'red onion': 'yellow onion' })
    expect(data.items['yellow onion']).toEqual({ name: 'Onion', section: 'Produce' })
    expect(walmartCopy).toBe(matches.onion)
  })

  it('makes the grocery list show one combined line, and splitting undoes it', () => {
    const merged = mergeIngredients({ items: {} }, matches, ['onion', 'yellow onion'], 'onion', 'Onions').data
    const names = { onion: 'Onions' }
    const combined = buildGroceryItems(recipes, {}, { aliases: merged.aliases, names })
    const onion = combined.find((i) => i.key === 'onion')
    expect(onion.name).toBe('Onions')
    expect(onion.quantities).toBe('3')
    expect(combined.some((i) => i.key === 'yellow onion')).toBe(false)

    const split = splitIngredient(merged, 'yellow onion')
    const apart = buildGroceryItems(recipes, {}, { aliases: split.aliases, names })
    expect(apart.map((i) => i.key)).toContain('yellow onion')
  })
})
