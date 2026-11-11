import { describe, expect, it } from 'vitest'
import { arrangeRows, moveInOrder, shiftSection } from './groceryOrder'
import { SECTIONS, orderedSections, sectionFor, sectionFromAisle, sectionFromKeywords } from './sections'

const row = (name, aisle = null) => ({ key: name, matchKey: name, name, aisle })

describe('sections', () => {
  it('maps Spoonacular aisles, including multi-aisle values', () => {
    expect(sectionFromAisle('Produce')).toBe('Produce')
    expect(sectionFromAisle('Milk, Eggs, Other Dairy')).toBe('Dairy and eggs')
    expect(sectionFromAisle('Spices and Seasonings;Baking')).toBe('Spices and baking')
    expect(sectionFromAisle('Something new')).toBeNull()
  })

  it('falls back to keywords in priority order', () => {
    expect(sectionFromKeywords('yellow onion')).toBe('Produce')
    expect(sectionFromKeywords('chicken thighs')).toBe('Meat and seafood')
    expect(sectionFromKeywords('chicken broth')).toBe('Canned and jarred')
    expect(sectionFromKeywords('frozen peas')).toBe('Frozen')
    expect(sectionFromKeywords('sharp cheddar')).toBe('Dairy and eggs')
    expect(sectionFromKeywords('kosher salt')).toBe('Spices and baking')
    expect(sectionFromKeywords('sourdough bread')).toBe('Bakery')
    expect(sectionFromKeywords('xanthan')).toBeNull()
  })

  it('prefers the household choice, then the aisle, then keywords, then Other', () => {
    expect(sectionFor({ chosen: 'Frozen', aisle: 'Produce', name: 'peas' })).toBe('Frozen')
    expect(sectionFor({ aisle: 'Produce', name: 'chicken' })).toBe('Produce')
    expect(sectionFor({ name: 'chicken' })).toBe('Meat and seafood')
    expect(sectionFor({ name: 'mystery item' })).toBe('Other')
  })

  it('keeps a saved section order and appends the rest', () => {
    const order = orderedSections(['Frozen', 'Produce', 'Not a section'])
    expect(order.slice(0, 2)).toEqual(['Frozen', 'Produce'])
    expect(order).toHaveLength(SECTIONS.length)
  })
})

describe('arrangeRows', () => {
  const rows = [row('onion'), row('chicken thighs'), row('apples'), row('mystery item')]

  it('sorts by name in one group', () => {
    const groups = arrangeRows(rows, 'name')
    expect(groups).toHaveLength(1)
    expect(groups[0].section).toBeNull()
    expect(groups[0].rows.map((r) => r.name)).toEqual(['apples', 'chicken thighs', 'mystery item', 'onion'])
  })

  it('groups by section in the household order, alphabetical inside', () => {
    const groups = arrangeRows(rows, 'section', { sectionOrder: ['Meat and seafood'] })
    expect(groups.map((g) => g.section)).toEqual(['Meat and seafood', 'Produce', 'Other'])
    expect(groups[1].rows.map((r) => r.name)).toEqual(['apples', 'onion'])
  })

  it('uses a chosen section over the automatic one', () => {
    const groups = arrangeRows(rows, 'section', { items: { onion: { section: 'Pantry' } } })
    expect(groups.find((g) => g.section === 'Pantry').rows.map((r) => r.name)).toEqual(['onion'])
  })

  it('follows the manual order and puts unplaced items last', () => {
    const groups = arrangeRows(rows, 'manual', { manualOrder: ['onion', 'ghost', 'apples'] })
    expect(groups[0].rows.map((r) => r.name)).toEqual(['onion', 'apples', 'chicken thighs', 'mystery item'])
  })
})

describe('moveInOrder', () => {
  it('moves an item without disturbing items not on this week’s list', () => {
    const stored = ['a', 'x', 'b', 'c']
    expect(moveInOrder(stored, ['a', 'b', 'c'], 'c', 'a', 'before')).toEqual(['c', 'a', 'x', 'b'])
    expect(moveInOrder(stored, ['a', 'b', 'c'], 'a', 'b', 'after')).toEqual(['x', 'b', 'a', 'c'])
  })

  it('adds new items before moving', () => {
    expect(moveInOrder([], ['a', 'b', 'c'], 'c', 'a', 'before')).toEqual(['c', 'a', 'b'])
  })
})

describe('shiftSection', () => {
  it('swaps a section with its neighbor and stops at the ends', () => {
    expect(shiftSection([], 'Meat and seafood', -1).slice(0, 2)).toEqual(['Meat and seafood', 'Produce'])
    expect(shiftSection([], 'Produce', -1)[0]).toBe('Produce')
  })
})
