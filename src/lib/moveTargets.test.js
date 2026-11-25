import { describe, expect, it } from 'vitest'
import { describeMove, longNight, moveTargets, shiftWeekStart, shortNight } from './moveTargets'
import { swapDays } from './planShape'

const tacos = { id: 'tacos', title: 'Chicken tacos' }
const chili = { id: 'chili', title: 'Chili' }
const rolls = { id: 'rolls', title: 'Dinner rolls' }

describe('shiftWeekStart', () => {
  it('steps the window a week at a time, across months and years', () => {
    expect(shiftWeekStart('2026-11-25', 1)).toBe('2026-12-02')
    expect(shiftWeekStart('2026-11-25', -1)).toBe('2026-11-18')
    expect(shiftWeekStart('2026-12-30', 1)).toBe('2027-01-06')
    expect(shiftWeekStart('2026-11-25', 0)).toBe('2026-11-25')
  })
})

describe('night labels', () => {
  it('names the night with its date', () => {
    expect(shortNight('2026-12-03')).toBe('Thu, Dec 3')
    expect(longNight('2026-12-03')).toBe('Thursday, Dec 3')
  })
})

describe('moveTargets', () => {
  it('offers the shown week minus the night being moved', () => {
    const targets = moveTargets('2026-11-25', '2026-11-27', {})
    expect(targets).toHaveLength(6)
    expect(targets.map((t) => t.iso)).not.toContain('2026-11-27')
    expect(targets[0]).toEqual({ iso: '2026-11-25', label: 'Wed, Nov 25', note: 'open', swaps: false })
  })

  it('offers all seven nights of another week', () => {
    const targets = moveTargets('2026-12-02', '2026-11-27', {})
    expect(targets.map((t) => t.iso)).toEqual([
      '2026-12-02',
      '2026-12-03',
      '2026-12-04',
      '2026-12-05',
      '2026-12-06',
      '2026-12-07',
      '2026-12-08',
    ])
  })

  it("says what's already on each night, which then swaps", () => {
    const days = {
      '2026-12-03': { dinner: chili, sides: [] },
      '2026-12-04': { dinner: null, sides: [rolls] },
      '2026-12-05': { dinner: null, sides: [], desserts: [] },
    }
    const byIso = Object.fromEntries(moveTargets('2026-12-02', '2026-11-27', days).map((t) => [t.iso, t]))
    expect(byIso['2026-12-03']).toMatchObject({ note: 'Chili', swaps: true })
    expect(byIso['2026-12-04']).toMatchObject({ note: 'sides & desserts', swaps: true })
    expect(byIso['2026-12-05']).toMatchObject({ note: 'open', swaps: false })
  })
})

describe('describeMove', () => {
  it('says where the dinner went', () => {
    const days = { '2026-11-27': { dinner: tacos } }
    expect(describeMove('2026-11-27', '2026-12-03', days)).toBe('Chicken tacos moved to Thursday, Dec 3.')
  })

  it('says what came back when the two nights swap', () => {
    const days = { '2026-11-27': { dinner: tacos }, '2026-12-03': { dinner: chili } }
    expect(describeMove('2026-11-27', '2026-12-03', days)).toBe('Chicken tacos moved to Thursday, Dec 3, and Chili took its place.')
  })

  it('covers a night with only sides and desserts', () => {
    const days = { '2026-11-27': { dinner: null, sides: [rolls] } }
    expect(describeMove('2026-11-27', '2026-12-03', days)).toBe("That night's dishes moved to Thursday, Dec 3.")
  })
})

describe('moving across weeks', () => {
  it('takes the whole night out of one week and into the other', () => {
    const days = {
      '2026-11-27': { dinner: tacos, sides: [rolls], desserts: [] },
      '2026-12-03': { dinner: null, sides: [], desserts: [] },
    }
    const next = swapDays(days, '2026-11-27', '2026-12-03')
    expect(next['2026-12-03']).toMatchObject({ dinner: tacos, sides: [rolls] })
    expect(next['2026-11-27']).toMatchObject({ dinner: null, sides: [], desserts: [] })
  })

  it('creates the far night when the plan has never had it', () => {
    const days = { '2026-11-27': { dinner: tacos, sides: [], desserts: [] } }
    const next = swapDays(days, '2026-11-27', '2027-01-08')
    expect(next['2027-01-08'].dinner).toEqual(tacos)
    expect(next['2026-11-27'].dinner).toBeNull()
  })

  it('leaves a holiday on its own date', () => {
    const days = {
      '2026-11-26': { dinner: tacos, holiday: { name: 'Thanksgiving' } },
      '2026-12-03': { dinner: chili },
    }
    const next = swapDays(days, '2026-11-26', '2026-12-03')
    expect(next['2026-11-26']).toMatchObject({ dinner: chili, holiday: { name: 'Thanksgiving' } })
    expect(next['2026-12-03'].holiday).toBeUndefined()
  })
})
