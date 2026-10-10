/**
 * Walmart helpers: product search through the /api/walmart proxy (see
 * netlify/functions/walmart.mts), pasted-link parsing, and the add-to-cart
 * link that hands the matched list to walmart.com.
 *
 * Product shape: { itemId, name, price, size, image }
 */

export class WalmartError extends Error {
  constructor(code) {
    super(code)
    this.code = code
  }
}

async function call(path) {
  const res = await fetch(`/api/walmart${path}`)
  // Without the function running (plain `vite` dev), the SPA fallback answers with HTML.
  if (!(res.headers.get('content-type') || '').includes('json')) throw new WalmartError('not_configured')
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new WalmartError(data.error || 'upstream_error')
  return data
}

export async function searchWalmart(query) {
  const data = await call(`/search?${new URLSearchParams({ q: query })}`)
  return data.items || []
}

export async function getWalmartItem(itemId) {
  const data = await call(`/item/${itemId}`)
  return data.item
}

/**
 * Pull the item id out of a walmart.com product link, e.g.
 * https://www.walmart.com/ip/Great-Value-Black-Beans-15-oz/10315162?athbdg=…
 * Returns { itemId, name } (name guessed from the URL slug) or null.
 */
export function parseWalmartUrl(text) {
  const raw = text.trim()
  let url
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
  } catch {
    return null
  }
  if (!/(^|\.)walmart\.com$/.test(url.hostname)) return null
  const parts = url.pathname.split('/').filter(Boolean)
  const ip = parts.indexOf('ip')
  if (ip === -1) return null
  const rest = parts.slice(ip + 1)
  const itemId = rest.find((p) => /^\d+$/.test(p))
  if (!itemId) return null
  const slug = rest.find((p) => !/^\d+$/.test(p))
  const name = slug ? decodeURIComponent(slug).replace(/-/g, ' ') : `Walmart item ${itemId}`
  return { itemId, name }
}

export const walmartSearchUrl = (query) => `https://www.walmart.com/search?${new URLSearchParams({ q: query })}`

export const walmartProductUrl = (itemId) => `https://www.walmart.com/ip/${itemId}`

/** lines: [{ itemId, qty }] — duplicates are merged. Opens the cart with everything added. */
export function walmartCartUrl(lines) {
  const totals = new Map()
  for (const { itemId, qty } of lines) totals.set(itemId, (totals.get(itemId) || 0) + (qty || 1))
  const items = [...totals.entries()].map(([id, qty]) => `${id}|${qty}`).join(',')
  return `https://affil.walmart.com/cart/addToCart?items=${items}`
}

export function fmtPrice(price) {
  return typeof price === 'number' ? `$${price.toFixed(2)}` : ''
}
