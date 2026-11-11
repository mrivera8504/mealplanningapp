import { describe, expect, it } from 'vitest'
import { courseFromDishTypes, courseOf, mainBrings, ofCourse, quickEntry, sideKind } from './courses'
import { swapDays, trimOldDays, withDinner, withSide, withSideReplaced, withoutSide } from './planShape'
import { buildPool, servedDates, suggestExtra } from './suggestions'
import { HOUSE_DESSERTS, HOUSE_SIDES } from './houseExtras'
import { buildGroceryItems } from './grocery'

function seeded(seed) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

describe('courses', () => {
  it('treats a recipe with no course as a main', () => {
    expect(courseOf({ id: 'old' })).toBe('main')
    expect(ofCourse([{ id: 'a' }, { id: 'b', course: 'side' }], 'main').map((r) => r.id)).toEqual(['a'])
  })

  it('reads the course off Spoonacular dish types, mains winning ties', () => {
    expect(courseFromDishTypes(['side dish'])).toBe('side')
    expect(courseFromDishTypes(['dessert'])).toBe('dessert')
    expect(courseFromDishTypes(['side dish', 'lunch', 'main course', 'dinner'])).toBe('main')
    expect(courseFromDishTypes([])).toBe('main')
    expect(courseFromDishTypes(undefined)).toBe('main')
  })

  it('makes a quick entry that lists itself for the grocery run unless told what to buy', () => {
    const plain = quickEntry('  Garlic bread ', 'side')
    expect(plain).toMatchObject({ id: 'quick-side-garlic-bread', title: 'Garlic bread', course: 'side', quick: true })
    expect(plain.ingredients.map((i) => i.name)).toEqual(['Garlic bread'])
    expect(quickEntry('Sundaes', 'dessert', 'ice cream, hot fudge').ingredients.map((i) => i.name)).toEqual(['ice cream', 'hot fudge'])
    expect(quickEntry('garlic bread', 'side').id).toBe(plain.id)
  })

  it('classifies sides and what a main already brings', () => {
    expect(sideKind({ title: 'Caesar Salad' })).toBe('salad')
    expect(sideKind({ title: 'Garlic Mashed Potatoes' })).toBe('starch')
    expect(sideKind({ title: 'Dinner Rolls' })).toBe('bread')
    expect(sideKind({ title: 'Roasted Brussels Sprouts' })).toBe('vegetable')
    expect(sideKind({ title: 'Something', sideKind: 'bread' })).toBe('bread')
    expect(mainBrings({ title: 'Baked Ziti', categories: ['pasta', 'baked'] })).toEqual({ starch: true, greens: false })
    expect(mainBrings({ title: 'Grilled Chicken', categories: ['grill'] })).toEqual({ starch: false, greens: false })
    expect(mainBrings({ title: 'Steak Salad', categories: ['salad'] }).greens).toBe(true)
  })
})

describe('pools by course', () => {
  it('keeps desserts and sides out of the dinner pool', () => {
    const saved = [{ id: 'sp-1', title: 'Tiramisu', course: 'dessert' }, { id: 'sp-2', title: 'Stew' }]
    const mine = [{ id: 'mine-1', title: 'Mash', course: 'side' }]
    const mains = buildPool(saved, mine, [{ id: 'sp-9', title: 'Flan', course: 'dessert' }])
    expect(mains.some((r) => ['sp-1', 'mine-1', 'sp-9'].includes(r.id))).toBe(false)
    expect(mains.some((r) => r.id === 'sp-2')).toBe(true)
    expect(mains.every((r) => courseOf(r) === 'main')).toBe(true)

    const sides = buildPool(saved, mine, [], 'side')
    expect(sides[0].id).toBe('mine-1')
    expect(sides).toHaveLength(1 + HOUSE_SIDES.length)
    expect(buildPool(saved, mine, [], 'dessert')).toHaveLength(1 + HOUSE_DESSERTS.length)
  })

  it('ships 12 house sides and 8 house desserts with unique ids', () => {
    expect(HOUSE_SIDES).toHaveLength(12)
    expect(HOUSE_DESSERTS).toHaveLength(8)
    const ids = [...HOUSE_SIDES, ...HOUSE_DESSERTS].map((r) => r.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(HOUSE_SIDES.every((r) => r.course === 'side' && r.sideKind && r.ingredients.length)).toBe(true)
    expect(HOUSE_DESSERTS.every((r) => r.course === 'dessert' && r.ingredients.length)).toBe(true)
  })
})

describe('suggestExtra', () => {
  const sides = buildPool([], [], [], 'side')
  const desserts = buildPool([], [], [], 'dessert')
  const tally = (fn, n = 400) => {
    const counts = {}
    const rng = seeded(4)
    for (let i = 0; i < n; i++) {
      const key = fn(rng)
      counts[key] = (counts[key] || 0) + 1
    }
    return counts
  }

  it('does not put a second starch or more pasta beside a pasta main', () => {
    const main = { id: 'm', title: 'Baked Ziti', cuisine: 'Italian', categories: ['pasta', 'baked'] }
    const kinds = tally((rng) => sideKind(suggestExtra('side', '2026-11-12', sides, { main, rng, today: '2026-11-11' }).recipe))
    expect(kinds.starch || 0).toBe(0)
    expect((kinds.vegetable || 0) + (kinds.salad || 0)).toBeGreaterThan(300)
  })

  it('picks a different kind for a second side', () => {
    const main = { id: 'm', title: 'Grilled Chicken', cuisine: 'American', categories: ['grill'] }
    const first = sides.find((s) => s.sideKind === 'vegetable')
    const kinds = tally((rng) => sideKind(suggestExtra('side', '2026-11-12', sides, { main, sides: [first], rng, today: '2026-11-11' }).recipe))
    expect(kinds.vegetable || 0).toBe(0)
  })

  it('never repeats a side inside two weeks while others are rested, and skips dismissed ones', () => {
    const plan = { days: { '2026-11-10': { dinner: { id: 'm' }, sides: [sides[0], sides[1]] } } }
    const history = servedDates(plan, 'side')
    const prefs = { [sides[2].id]: { dismissed: true } }
    const rng = seeded(8)
    for (let i = 0; i < 200; i++) {
      const { recipe, repeat } = suggestExtra('side', '2026-11-12', sides, { history, prefs, rng, today: '2026-11-11' })
      expect([sides[0].id, sides[1].id, sides[2].id]).not.toContain(recipe.id)
      expect(repeat).toBe(false)
    }
  })

  it('rotates desserts on their own history', () => {
    const plan = { days: { '2026-11-10': { dinner: { id: 'm' }, dessert: desserts[0] } } }
    expect(servedDates(plan, 'dessert').get(desserts[0].id)).toEqual(['2026-11-10'])
    expect(servedDates(plan).has(desserts[0].id)).toBe(false)
    const rng = seeded(2)
    const seen = new Set()
    for (let i = 0; i < 200; i++) seen.add(suggestExtra('dessert', '2026-11-12', desserts, { history: servedDates(plan, 'dessert'), rng, today: '2026-11-11' }).recipe.id)
    expect(seen.has(desserts[0].id)).toBe(false)
    expect(seen.size).toBeGreaterThan(3)
  })

  it('returns null for an empty pool', () => {
    expect(suggestExtra('side', '2026-11-12', [], {})).toBeNull()
  })
})

describe('plan shape', () => {
  const side = (id) => ({ id, title: id })

  it('adds up to three distinct sides, replaces in place, and removes', () => {
    let day = { dinner: { id: 'm' } }
    for (const id of ['a', 'b', 'a', 'c', 'd']) day = withSide(day, side(id))
    expect(day.sides.map((s) => s.id)).toEqual(['b', 'a', 'c'])
    day = withSideReplaced(day, 'a', side('z'))
    expect(day.sides.map((s) => s.id)).toEqual(['b', 'z', 'c'])
    expect(withoutSide(day, 'b').sides.map((s) => s.id)).toEqual(['z', 'c'])
  })

  it('clears sides on a takeout night but keeps dessert', () => {
    const day = withDinner({ dinner: { id: 'm' }, sides: [side('a')], dessert: side('d') }, { id: 'takeout-pizza', takeout: true })
    expect(day.sides).toEqual([])
    expect(day.dessert.id).toBe('d')
  })

  it('moves sides and dessert with the dinner, including onto an old-style day', () => {
    const days = {
      mon: { dinner: { id: 'm1' }, sides: [side('a')], dessert: side('d') },
      tue: { dinner: { id: 'm2' } },
    }
    const moved = swapDays(days, 'mon', 'tue')
    expect(moved.tue).toMatchObject({ dinner: { id: 'm1' }, sides: [{ id: 'a' }], dessert: { id: 'd' } })
    expect(moved.mon).toMatchObject({ dinner: { id: 'm2' }, sides: [], dessert: null })
    expect(swapDays(days, 'mon', 'wed').mon).toMatchObject({ dinner: null, sides: [], dessert: null })
  })

  it('trims days older than two months to what history needs, once', () => {
    const full = { id: 'sp-1', title: 'Stew', cuisine: 'French', categories: ['stew'], ingredients: [{ name: 'beef' }], steps: ['cook'], image: 'x' }
    const plan = {
      days: {
        '2026-08-01': { dinner: full, sides: [{ ...full, id: 's', course: 'side' }], dessert: null },
        '2026-11-01': { dinner: full },
      },
    }
    const { plan: trimmed, changed } = trimOldDays(plan, new Date('2026-11-11T12:00:00'))
    expect(changed).toBe(true)
    expect(trimmed.days['2026-08-01'].dinner).toEqual({ id: 'sp-1', title: 'Stew', cuisine: 'French', categories: ['stew'], trimmed: true })
    expect(trimmed.days['2026-08-01'].sides[0]).toMatchObject({ id: 's', course: 'side', trimmed: true })
    expect(trimmed.days['2026-11-01'].dinner).toBe(full)
    expect(servedDates(trimmed).get('sp-1')).toEqual(['2026-08-01', '2026-11-01'])
    expect(trimOldDays(trimmed, new Date('2026-11-11T12:00:00')).changed).toBe(false)
  })
})

describe('grocery list with extras', () => {
  it('merges side and dessert ingredients with the dinner’s', () => {
    const dinner = { id: 'm', title: 'Roast', ingredients: [{ name: 'butter', amount: 2, unit: 'tbsp' }] }
    const items = buildGroceryItems([dinner, HOUSE_SIDES.find((s) => s.id === 'house-side-garlic-bread'), quickEntry('Ice cream', 'dessert')])
    const byKey = Object.fromEntries(items.map((i) => [i.key, i]))
    expect(byKey.butter.quantities).toBe('8 tbsp')
    expect(byKey.baguette).toBeTruthy()
    expect(byKey['ice cream']).toBeTruthy()
  })
})
