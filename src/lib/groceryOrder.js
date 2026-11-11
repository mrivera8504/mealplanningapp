import { orderedSections, sectionFor } from './sections'

/**
 * Ordering for the grocery list: by section, by name, or the household's own
 * manual order. Rows carry `matchKey` (the normalized ingredient name), which
 * is what the manual order and section choices are keyed by, so both hold
 * from week to week.
 */

export const SORT_MODES = [
  { value: 'section', label: 'Section' },
  { value: 'name', label: 'Name' },
  { value: 'manual', label: 'Manual' },
]

const byName = (a, b) => a.name.localeCompare(b.name)

/**
 * Returns [{ section, rows }]. In name and manual mode there is one group with
 * section null, so the caller renders headings only when they mean something.
 *
 * ingredients: { items: { [key]: { section } }, manualOrder: [key], sectionOrder: [section] }
 */
export function arrangeRows(rows, mode, ingredients = {}) {
  const items = ingredients.items || {}

  if (mode === 'section') {
    const groups = new Map(orderedSections(ingredients.sectionOrder).map((s) => [s, []]))
    for (const row of rows) {
      const section = sectionFor({ chosen: items[row.matchKey]?.section, aisle: row.aisle, name: row.name })
      groups.get(section).push(row)
    }
    return [...groups.entries()]
      .filter(([, list]) => list.length)
      .map(([section, list]) => ({ section, rows: list.sort(byName) }))
  }

  if (mode === 'manual') {
    const position = new Map((ingredients.manualOrder || []).map((key, i) => [key, i]))
    const placed = rows.filter((r) => position.has(r.matchKey))
    const unplaced = rows.filter((r) => !position.has(r.matchKey)).sort(byName)
    placed.sort((a, b) => position.get(a.matchKey) - position.get(b.matchKey) || byName(a, b))
    return [{ section: null, rows: [...placed, ...unplaced] }]
  }

  return [{ section: null, rows: [...rows].sort(byName) }]
}

/**
 * Move `key` next to `targetKey` in the stored manual order, leaving every
 * other entry where it was -- including items not on this week's list, so the
 * order you set holds next week. `visibleKeys` is the list as currently shown;
 * any of them not yet in the stored order are appended (in shown order) first.
 */
export function moveInOrder(stored, visibleKeys, key, targetKey, side = 'before') {
  const order = [...(stored || [])]
  for (const k of visibleKeys) if (!order.includes(k)) order.push(k)
  if (key === targetKey) return order
  const from = order.indexOf(key)
  if (from === -1) return order
  order.splice(from, 1)
  const at = order.indexOf(targetKey)
  if (at === -1) return [...order, key]
  order.splice(side === 'after' ? at + 1 : at, 0, key)
  return order
}

/** Move a section one step earlier (-1) or later (+1) in the household's section order. */
export function shiftSection(savedOrder, section, delta) {
  const order = orderedSections(savedOrder)
  const i = order.indexOf(section)
  const j = i + delta
  if (i === -1 || j < 0 || j >= order.length) return order
  ;[order[i], order[j]] = [order[j], order[i]]
  return order
}
