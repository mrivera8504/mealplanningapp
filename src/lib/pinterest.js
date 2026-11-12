/**
 * Client for /api/pinterest (netlify/functions/pinterest.mts), which reads a
 * public board without Pinterest's developer API.
 */

export class PinterestError extends Error {
  constructor(code) {
    super(code)
    this.code = code
  }
}

async function call(path) {
  const res = await fetch(`/api/pinterest/${path}`)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new PinterestError(data.error || 'unreachable')
  return data
}

/** { board, pins: [{ id, title, image, link, pinUrl }], source } — at most the board's 50 newest pins. */
export function loadBoard(boardUrl) {
  return call(`board?url=${encodeURIComponent(boardUrl)}`)
}

/** The site a pin links to, or null when it links nowhere. */
export async function pinDestination(pin) {
  if (pin.link) return pin.link
  const { link } = await call(`pin?id=${encodeURIComponent(pin.id)}`)
  return link || null
}

export function describePinterestError(code) {
  if (code === 'bad_board') return "That doesn't look like a Pinterest board link. Open the board on Pinterest and copy the address."
  if (code === 'not_found') return "Pinterest couldn't find that board. Check the link, and that the board isn't secret."
  if (code === 'blocked') return 'Pinterest turned the request away. Try again in a few minutes.'
  return "Couldn't reach Pinterest. Check your connection and try again."
}
