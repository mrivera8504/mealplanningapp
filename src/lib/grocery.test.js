import { describe, expect, it } from 'vitest'
import { groceryListText } from './grocery'

describe('groceryListText', () => {
  it('puts one item per line, with its amount when it has one', () => {
    const rows = [
      { name: 'garlic', quantities: '12 clove' },
      { name: 'paper towels', quantities: '' },
      { name: 'chicken broth', quantities: '2 cup + 1 can' },
    ]
    expect(groceryListText(rows)).toBe('garlic (12 clove)\npaper towels\nchicken broth (2 cup + 1 can)')
  })

  it('skips blank names and handles an empty list', () => {
    expect(groceryListText([{ name: '  ', quantities: '1' }, { name: 'eggs' }])).toBe('eggs')
    expect(groceryListText([])).toBe('')
  })
})
