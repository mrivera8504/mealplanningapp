import { dessertsOf } from './courses'
import { addDays, fmtShort, fromISODate, toISODate, weekDates } from './dates'

const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const LONG_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** "Thu, Dec 4" */
export function shortNight(iso) {
  return `${SHORT_DAYS[fromISODate(iso).getDay()]}, ${fmtShort(iso)}`
}

/** "Thursday, Dec 4" */
export function longNight(iso) {
  return `${LONG_DAYS[fromISODate(iso).getDay()]}, ${fmtShort(iso)}`
}

/** The start of the 7-night window `delta` weeks from `startIso`. */
export function shiftWeekStart(startIso, delta) {
  return toISODate(addDays(fromISODate(startIso), delta * 7))
}

/**
 * The nights "Move to another night" offers for the 7-night window that
 * starts at `weekStart`: every night but the one being moved, each with what
 * is on it now. A night that already has something swaps with the one moved.
 */
export function moveTargets(weekStart, fromIso, planDays = {}) {
  return weekDates(weekStart)
    .filter((d) => d.iso !== fromIso)
    .map((d) => {
      const day = planDays[d.iso]
      const extras = (day?.sides?.length || 0) + dessertsOf(day).length
      const note = day?.dinner ? day.dinner.title : extras ? 'sides & desserts' : 'open'
      return { iso: d.iso, label: shortNight(d.iso), note, swaps: Boolean(day?.dinner || extras) }
    })
}

/**
 * What to say after a move lands outside the nights on screen, since the
 * dinner leaves the page: where it went, and what came back in its place.
 */
export function describeMove(fromIso, toIso, planDays = {}) {
  const moving = planDays[fromIso]?.dinner?.title || "That night's dishes"
  const back = planDays[toIso]?.dinner?.title
  const where = longNight(toIso)
  return back ? `${moving} moved to ${where}, and ${back} took its place.` : `${moving} moved to ${where}.`
}
