const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Local-timezone ISO date (YYYY-MM-DD) -- avoids the UTC shift of toISOString(). */
export function toISODate(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function fromISODate(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(date, n) {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}

/** Start of the rolling 7-day window = today's date. */
export function weekIdFor(date) {
  return toISODate(date)
}

/** Seven days starting from startIso; day names derived from the actual date. */
export function weekDates(startIso) {
  const start = fromISODate(startIso)
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(start, i)
    return { name: DAY_NAMES[date.getDay()], iso: toISODate(date), date }
  })
}

export function isToday(iso) {
  return iso === toISODate(new Date())
}

export function fmtShort(dateOrIso) {
  const d = typeof dateOrIso === 'string' ? fromISODate(dateOrIso) : dateOrIso
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`
}

export function fmtWeekRange(startIso) {
  const start = fromISODate(startIso)
  const end = addDays(start, 6)
  const sameMonth = start.getMonth() === end.getMonth()
  return sameMonth
    ? `${MONTHS[start.getMonth()]} ${start.getDate()}--${end.getDate()}, ${end.getFullYear()}`
    : `${fmtShort(start)} -- ${fmtShort(end)}, ${end.getFullYear()}`
}
