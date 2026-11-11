import { describe, expect, it } from 'vitest'
import { REST_DAYS, gapDays, plannedNights, servedDates, styleOf, suggestForDay } from './suggestions'
import { addDays, fromISODate, toISODate } from './dates'

/** Deterministic random numbers so a failing run can be reproduced. */
function seeded(seed) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const CUISINES = ['American', 'Italian', 'Mexican', 'Thai', 'Indian', 'French']
const STYLES = ['soup', 'stew', 'pasta', 'grill', 'salad', 'roast', 'baked']

function makePool(n) {
  return Array.from({ length: n }, (_, i) => ({
    id: `r${i}`,
    title: `Recipe ${i}`,
    cuisine: CUISINES[i % CUISINES.length],
    categories: [STYLES[i % STYLES.length]],
  }))
}

const START = '2026-11-02'
const isoAt = (n) => toISODate(addDays(fromISODate(START), n))
const dinner = (recipe) => ({ dinner: recipe })
const COLD_WET = { code: 63, tMax: 4, tMin: 0, precipProb: 90 } // "soup weather"

/** Fill `count` consecutive nights the way "Fill empty nights" does, a week at a time. */
function fillNights(pool, count, { rng, weatherDay = null, useWeather = false, prefs = {} } = {}) {
  const plan = { days: {} }
  for (let week = 0; week * 7 < count; week++) {
    const exclude = new Set()
    for (let d = week * 7; d < Math.min(count, week * 7 + 7); d++) {
      const iso = isoAt(d)
      const opts = {
        history: servedDates(plan),
        nights: plannedNights(plan),
        prefs,
        useWeather,
        rng,
        today: START,
      }
      const result =
        suggestForDay(weatherDay, iso, pool, { ...opts, exclude }) ||
        suggestForDay(weatherDay, iso, pool, { ...opts, exclude: new Set() })
      plan.days[iso] = dinner(result.recipe)
      exclude.add(result.recipe.id)
    }
  }
  return plan
}

function smallestRepeatGap(plan) {
  let smallest = Infinity
  for (const dates of servedDates(plan).values()) {
    for (const iso of dates) smallest = Math.min(smallest, gapDays(dates, iso))
  }
  return smallest
}

describe('rotation over many weeks', () => {
  it('fills 8 weeks from 30 recipes with no repeat inside two weeks, using nearly the whole pool', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const plan = fillNights(makePool(30), 56, { rng: seeded(seed) })
      expect(smallestRepeatGap(plan)).toBeGreaterThanOrEqual(REST_DAYS)
      expect(servedDates(plan).size).toBeGreaterThanOrEqual(25)
    }
  })

  it('holds the two-week gap with a pool of 20', () => {
    for (const seed of [11, 12, 13]) {
      const plan = fillNights(makePool(20), 56, { rng: seeded(seed) })
      expect(smallestRepeatGap(plan)).toBeGreaterThanOrEqual(REST_DAYS)
    }
  })

  it('does not give the same week twice from the same starting point', () => {
    const week = (seed) =>
      Object.values(fillNights(makePool(30), 7, { rng: seeded(seed) }).days)
        .map((d) => d.dinner.id)
        .join(',')
    expect(new Set([week(1), week(2), week(3), week(4)]).size).toBeGreaterThan(1)
  })

  it('avoids the same cuisine or style on back-to-back nights when it can', () => {
    const plan = fillNights(makePool(30), 28, { rng: seeded(7) })
    let clashes = 0
    for (let d = 1; d < 28; d++) {
      const a = plan.days[isoAt(d - 1)].dinner
      const b = plan.days[isoAt(d)].dinner
      if (a.cuisine === b.cuisine || styleOf(a) === styleOf(b)) clashes += 1
    }
    expect(clashes).toBeLessThanOrEqual(2)
  })
})

describe('weather', () => {
  const soupShare = (plan) => {
    const meals = Object.values(plan.days).map((d) => d.dinner)
    return meals.filter((m) => ['soup', 'stew', 'baked'].includes(styleOf(m))).length / meals.length
  }

  it('plays no part unless asked for', () => {
    const pool = makePool(42)
    const plain = fillNights(pool, 14, { rng: seeded(21) })
    const coldIgnored = fillNights(pool, 14, { rng: seeded(21), weatherDay: COLD_WET })
    expect(Object.values(coldIgnored.days).map((d) => d.dinner.id)).toEqual(
      Object.values(plain.days).map((d) => d.dinner.id)
    )
  })

  it('leans toward the mood when asked for', () => {
    const pool = makePool(42)
    const plain = fillNights(pool, 14, { rng: seeded(21), weatherDay: COLD_WET })
    const forWeather = fillNights(pool, 14, { rng: seeded(21), weatherDay: COLD_WET, useWeather: true })
    expect(soupShare(forWeather)).toBeGreaterThan(soupShare(plain))
    expect(soupShare(forWeather)).toBeGreaterThanOrEqual(0.7)
  })

  it('reports the mood only for a weather pick', () => {
    const pool = makePool(10)
    expect(suggestForDay(COLD_WET, START, pool, { today: START }).mood).toBeNull()
    expect(suggestForDay(COLD_WET, START, pool, { today: START, useWeather: true }).mood.key).toBe('soup')
  })
})

describe('passed-over recipes', () => {
  it('stay away for about two weeks, then return', () => {
    const pool = makePool(8)
    const prefs = { r0: { passedOn: START } }
    const picks = (today) => {
      const seen = new Set()
      const rng = seeded(5)
      for (let i = 0; i < 300; i++) seen.add(suggestForDay(null, isoAt(20), pool, { prefs, rng, today }).recipe.id)
      return seen
    }
    expect(picks(START).has('r0')).toBe(false)
    expect(picks(isoAt(3)).has('r0')).toBe(false)
    expect(picks(isoAt(15)).has('r0')).toBe(true)
  })
})

describe('rotation preferences', () => {
  it('never suggests a dismissed or snoozed recipe', () => {
    const pool = makePool(3)
    const prefs = { r0: { dismissed: true }, r1: { snoozeUntil: isoAt(30) } }
    const rng = seeded(9)
    for (let i = 0; i < 50; i++) {
      expect(suggestForDay(null, START, pool, { prefs, rng, today: START }).recipe.id).toBe('r2')
    }
  })

  it('gives a pinned recipe its weekday and keeps it off the others', () => {
    const pool = makePool(12)
    const weekday = fromISODate(START).getDay()
    const prefs = { r5: { night: weekday } }
    const rng = seeded(3)
    for (let i = 0; i < 30; i++) {
      expect(suggestForDay(null, START, pool, { prefs, rng, today: START }).recipe.id).toBe('r5')
      expect(suggestForDay(null, isoAt(1), pool, { prefs, rng, today: START }).recipe.id).not.toBe('r5')
    }
  })

  it('never picks an excluded recipe', () => {
    const pool = makePool(4)
    const rng = seeded(2)
    for (let i = 0; i < 50; i++) {
      const { recipe } = suggestForDay(null, START, pool, { exclude: new Set(['r0', 'r1']), rng, today: START })
      expect(['r2', 'r3']).toContain(recipe.id)
    }
  })
})

describe('small pools', () => {
  const pool = makePool(3)
  const plan = { days: { [isoAt(0)]: dinner(pool[0]), [isoAt(1)]: dinner(pool[1]), [isoAt(2)]: dinner(pool[2]) } }
  const opts = { history: servedDates(plan), nights: plannedNights(plan), today: START }

  it('repeats, and says so, when nothing has rested', () => {
    const result = suggestForDay(null, isoAt(5), pool, opts)
    expect(result.recipe).toBeTruthy()
    expect(result.repeat).toBe(true)
  })

  it('returns nothing instead of repeating when asked for rested recipes only', () => {
    expect(suggestForDay(null, isoAt(5), pool, { ...opts, restedOnly: true })).toBeNull()
    expect(suggestForDay(null, isoAt(20), pool, { ...opts, restedOnly: true }).repeat).toBe(false)
  })

  it('returns null for an empty pool', () => {
    expect(suggestForDay(null, START, [], { today: START })).toBeNull()
  })
})
