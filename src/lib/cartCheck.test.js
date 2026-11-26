import { describe, expect, it } from 'vitest'
import { cartLinesFor, newCartCheck, toggleFound } from './cartCheck'
import { walmartCartUrl } from './walmart'

const product = (itemId, name) => ({ itemId, name, price: null, size: null, image: null })

describe('cartLinesFor', () => {
  const matches = {
    bananas: { product: product('44390948', 'Fresh Banana, Each'), qty: 6 },
    'bell pepper': { product: product('10450114', 'Fresh Green Bell Pepper, Each'), qty: 1 },
    'green bell pepper': { product: product('10450114', 'Fresh Green Bell Pepper, Each'), qty: 2 },
    salt: { skip: true },
    sugar: { product: product('10315162', 'Great Value Granulated Sugar, 4 lb') },
  }

  it('lists each product once, by product name, with the grocery items it covers', () => {
    const rows = [
      { matchKey: 'sugar', name: 'sugar' },
      { matchKey: 'bananas', name: 'bananas' },
      { matchKey: 'green bell pepper', name: 'green bell pepper' },
      { matchKey: 'bell pepper', name: 'bell pepper' },
      { matchKey: 'salt', name: 'salt' },
      { matchKey: 'thyme', name: 'thyme' },
    ]
    expect(cartLinesFor(rows, matches)).toEqual([
      { itemId: '44390948', product: 'Fresh Banana, Each', names: ['bananas'], qty: 6 },
      { itemId: '10450114', product: 'Fresh Green Bell Pepper, Each', names: ['green bell pepper', 'bell pepper'], qty: 3 },
      { itemId: '10315162', product: 'Great Value Granulated Sugar, 4 lb', names: ['sugar'], qty: 1 },
    ])
  })

  it('counts a grocery item once even when it shows up twice on the list', () => {
    const rows = [
      { matchKey: 'bananas', name: 'bananas' },
      { matchKey: 'bananas', name: 'Bananas' },
    ]
    expect(cartLinesFor(rows, matches)).toEqual([
      { itemId: '44390948', product: 'Fresh Banana, Each', names: ['bananas'], qty: 6 },
    ])
  })

  it('builds the same cart link as before', () => {
    const rows = [
      { matchKey: 'bell pepper', name: 'bell pepper' },
      { matchKey: 'green bell pepper', name: 'green bell pepper' },
    ]
    expect(walmartCartUrl(cartLinesFor(rows, matches))).toBe('https://affil.walmart.com/cart/addToCart?items=10450114|3')
  })

  it('handles an empty list', () => {
    expect(cartLinesFor([], matches)).toEqual([])
  })

  it('sends a count raised by hand, right after raising it', () => {
    // What the + button does to the remembered product (useWalmartProducts.setQty).
    const raised = { ...matches, sugar: { ...matches.sugar, qty: 3 } }
    const rows = [{ matchKey: 'sugar', name: 'sugar' }]
    expect(cartLinesFor(rows, raised)[0].qty).toBe(3)
    expect(walmartCartUrl(cartLinesFor(rows, raised))).toBe('https://affil.walmart.com/cart/addToCart?items=10315162|3')
  })
})

describe('newCartCheck', () => {
  const line = (itemId, qty) => ({ itemId, product: `Product ${itemId}`, names: [`item ${itemId}`], qty })

  it('keeps the count sent for every product', () => {
    const check = newCartCheck([line('1', 1), line('2', 4)], { unsent: 1, now: 5000 })
    expect(check).toEqual({ sentAt: 5000, lines: [line('1', 1), line('2', 4)], found: [], unsent: 1 })
  })

  it('points out a count that changed since the last send', () => {
    const previous = newCartCheck([line('jello', 1), line('milk', 2), line('eggs', 1)], { now: 1000 })
    const check = newCartCheck([line('jello', 2), line('milk', 2), line('bread', 1)], { previous, now: 2000 })
    expect(check.lines).toEqual([{ ...line('jello', 2), was: 1 }, line('milk', 2), line('bread', 1)])
    expect(check.found).toEqual([])
  })
})

describe('toggleFound', () => {
  it('ticks and unticks a product', () => {
    const check = newCartCheck([{ itemId: '1', product: 'A', names: ['a'], qty: 1 }], { unsent: 2, now: 1000 })
    expect(check).toEqual({ sentAt: 1000, lines: check.lines, found: [], unsent: 2 })
    const ticked = toggleFound(check, '1')
    expect(ticked.found).toEqual(['1'])
    expect(toggleFound(ticked, '1').found).toEqual([])
    expect(check.found).toEqual([])
  })
})
