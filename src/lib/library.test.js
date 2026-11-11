import { describe, expect, it } from 'vitest'
import { CUISINES, evictions, exploreCuisines, filterNew, needsRefill, planRefill, tasteCuisines } from './library'

const DAY = 24 * 60 * 60 * 1000
const TODAY = '2026-11-11'
const meal = (id, cuisine) => ({ dinner: { id, cuisine } })

describe('taste and explore', () => {
  const context = {
    saved: [{ id: 's1', cuisine: 'Italian' }, { id: 's2', cuisine: 'Mexican' }],
    mine: [{ id: 'm1', cuisine: 'Mexican' }, { id: 'm2', cuisine: 'Thai' }, { id: 'm3', cuisine: 'Homestyle' }],
    prefs: { m2: { favorite: true } },
    plan: { days: { '2026-11-05': meal('s1', 'Italian'), '2026-08-01': meal('x', 'Greek') } },
    today: TODAY,
  }

  it('ranks cuisines by favorites, recipes owned and recent dinners', () => {
    // Thai 3 (favorite), Mexican 2, Italian 2 (saved + planned); Greek is too old, Homestyle isn't searchable.
    const ranked = tasteCuisines(context)
    expect(ranked[0]).toBe('Thai')
    expect(ranked).toHaveLength(3)
    expect(ranked).not.toContain('Greek')
  })

  it('explores cuisines missing from the last four weeks', () => {
    const explore = exploreCuisines(context)
    expect(explore).not.toContain('Italian')
    expect(explore).toContain('Greek')
  })

  it('plans one taste and one explore search with different cuisines', () => {
    for (let i = 0; i < 20; i++) {
      const [taste, explore] = planRefill(context)
      expect(taste.reason).toBe('taste')
      expect(['Thai', 'Mexican', 'Italian']).toContain(taste.cuisine)
      expect(explore.reason).toBe('explore')
      expect(CUISINES).toContain(explore.cuisine)
      expect(explore.cuisine).not.toBe(taste.cuisine)
    }
  })

  it('still plans a refill with no history at all', () => {
    const [taste, explore] = planRefill({ saved: [], mine: [], prefs: {}, plan: { days: {} }, today: TODAY })
    expect(taste.cuisine).toBeNull()
    expect(CUISINES).toContain(explore.cuisine)
  })
})

describe('filterNew', () => {
  it('drops duplicates, saved, dismissed and ingredient-less recipes', () => {
    const ok = { id: 'sp-1', ingredients: [{ name: 'rice' }] }
    const kept = filterNew(
      [
        ok,
        { ...ok },
        { id: 'sp-2', ingredients: [{ name: 'rice' }] },
        { id: 'sp-3', ingredients: [{ name: 'rice' }] },
        { id: 'sp-4', ingredients: [{ name: 'rice' }] },
        { id: 'sp-5', ingredients: [] },
      ],
      { libraryIds: new Set(['sp-2']), savedIds: new Set(['sp-3']), prefs: { 'sp-4': { dismissed: true } } }
    )
    expect(kept.map((r) => r.id)).toEqual(['sp-1'])
  })
})

describe('evictions', () => {
  it('drops the oldest never-planned recipes once over the cap', () => {
    const library = [
      { id: 'a', addedAt: 1 },
      { id: 'b', addedAt: 2 },
      { id: 'c', addedAt: 3 },
      { id: 'd', addedAt: 4 },
    ]
    expect(evictions(library, new Set(['a']), 2)).toEqual(['b', 'c'])
    expect(evictions(library, new Set(), 10)).toEqual([])
  })
})

describe('needsRefill', () => {
  const now = 100 * DAY
  it('refills when nothing has ever been fetched', () => {
    expect(needsRefill(null, 0, now)).toBe(true)
  })
  it('waits a week when stock is fine', () => {
    expect(needsRefill({ lastFetchAt: now - 3 * DAY, lastAttemptAt: now - 3 * DAY }, 40, now)).toBe(false)
    expect(needsRefill({ lastFetchAt: now - 8 * DAY, lastAttemptAt: now - 8 * DAY }, 40, now)).toBe(true)
  })
  it('refills early when stock is low, but not twice in a day', () => {
    expect(needsRefill({ lastFetchAt: now - 2 * DAY, lastAttemptAt: now - 2 * DAY }, 3, now)).toBe(true)
    expect(needsRefill({ lastFetchAt: now - 0.5 * DAY, lastAttemptAt: now - 0.5 * DAY }, 3, now)).toBe(false)
  })
  it('retries a failed refill the next day, not sooner', () => {
    const failed = { lastFetchAt: now - 3 * DAY, lastError: 'quota_exceeded' }
    expect(needsRefill({ ...failed, lastAttemptAt: now - 0.2 * DAY }, 40, now)).toBe(false)
    expect(needsRefill({ ...failed, lastAttemptAt: now - 1.5 * DAY }, 40, now)).toBe(true)
  })
})
