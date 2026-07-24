export const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Local-timezone ISO date (YYYY-MM-DD) — avoids the UTC shift of toISOString(). */
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

/** Monday of the week containing `date`. */
export function startOfWeek(date) {
  const d = new Date(date)
  const shift = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - shift)
  d.setHours(0, 0, 0, 0)
  return d
}

/** Week id = ISO date of that week's Monday. */
export function weekIdFor(date) {
  return toISODate(startOfWeek(date))
}

/** The seven ISO dates of the week identified by weekId. */
export function weekDates(weekId) {
  const monday = fromISODate(weekId)
  return DAY_NAMES.map((name, i) => {
    const date = addDays(monday, i)
    return { name, iso: toISODate(date), date }
  })
}

export function isToday(iso) {
  return iso === toISODate(new Date())
}

export function fmtShort(dateOrIso) {
  const d = typeof dateOrIso === 'string' ? fromISODate(dateOrIso) : dateOrIso
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`
}

export function fmtWeekRange(weekId) {
  const monday = fromISODate(weekId)
  const sunday = addDays(monday, 6)
  const sameMonth = monday.getMonth() === sunday.getMonth()
  return sameMonth
    ? `${MONTHS[monday.getMonth()]} ${monday.getDate()}–${sunday.getDate()}, ${sunday.getFullYear()}`
    : `${fmtShort(monday)} – ${fmtShort(sunday)}, ${sunday.getFullYear()}`
}
