/**
 * "Send to Walmart cart" hands the list to walmart.com through a link, and
 * Walmart never reports back which items it couldn't add. So the app keeps a
 * record of what it sent, to tick off against the cart: whatever is left
 * unticked is what needs adding by hand.
 *
 * A check: { sentAt, lines: [{ itemId, product, names, qty, was? }], found: [itemId], unsent }
 * It's kept on this device only, so it survives the app reloading while
 * Walmart is open in another tab. Only the latest send is kept.
 */

const KEY = 'wfd:walmart-cart-check'

/**
 * One line per Walmart product, the same way the cart link merges them: two
 * grocery items matched to the same product share a line, with their buy
 * counts added. Sorted by product name, since that's what the cart shows.
 * rows: grocery rows still to get ({ matchKey, name }); matches: remembered products by matchKey.
 */
export function cartLinesFor(rows, matches) {
  const seen = new Set()
  const byItem = new Map()
  for (const row of rows) {
    const match = matches[row.matchKey]
    if (!match?.product || seen.has(row.matchKey)) continue
    seen.add(row.matchKey)
    const { itemId, name } = match.product
    const line = byItem.get(itemId) || { itemId, product: name || `Walmart item ${itemId}`, names: [], qty: 0 }
    line.names.push(row.name)
    line.qty += match.qty || 1
    byItem.set(itemId, line)
  }
  return [...byItem.values()].sort((a, b) => a.product.localeCompare(b.product))
}

/**
 * The record of one send. unsent: grocery items left out for having no Walmart
 * match. previous: the last send, when it's recent. Walmart may not update an
 * item that's already in the cart, so a product whose count differs from that
 * send carries `was`, the count sent then, for the checklist to point out.
 */
export function newCartCheck(lines, { unsent = 0, previous = null, now = Date.now() } = {}) {
  const before = new Map((previous?.lines || []).map((l) => [l.itemId, l.qty]))
  const marked = lines.map((l) => (before.has(l.itemId) && before.get(l.itemId) !== l.qty ? { ...l, was: before.get(l.itemId) } : l))
  return { sentAt: now, lines: marked, found: [], unsent }
}

/** Tick or untick one product as found in the cart. */
export function toggleFound(check, itemId) {
  const found = check.found.includes(itemId) ? check.found.filter((id) => id !== itemId) : [...check.found, itemId]
  return { ...check, found }
}

export function loadCartCheck() {
  try {
    const check = JSON.parse(localStorage.getItem(KEY))
    return check && Array.isArray(check.lines) && Array.isArray(check.found) ? check : null
  } catch {
    return null
  }
}

export function saveCartCheck(check) {
  try {
    localStorage.setItem(KEY, JSON.stringify(check))
  } catch {
    /* storage full or blocked: the check still works until the page reloads */
  }
}
