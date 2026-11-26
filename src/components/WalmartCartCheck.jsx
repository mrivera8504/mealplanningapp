import { useEffect, useState } from 'react'
import { walmartProductUrl } from '../lib/walmart'

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

const fmtSent = (ms) => new Date(ms).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })

/**
 * Opens after "Send to Walmart cart". Walmart doesn't tell the app which items
 * it couldn't add, so this lists everything that was sent, by Walmart product
 * name the way the cart shows them, to tick off while going down the cart.
 * Whatever is left unticked needs adding by hand, and each line links to its
 * product page for that. Each line shows the count sent, and a count that
 * changed since the last send is pointed out, since Walmart may not update
 * an item that's already in the cart.
 *
 * check: see lib/cartCheck
 */
export default function WalmartCartCheck({ check, onToggle, onClose }) {
  const [onlyLeft, setOnlyLeft] = useState(false)

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const found = new Set(check.found)
  const left = check.lines.filter((l) => !found.has(l.itemId))
  const units = check.lines.reduce((n, l) => n + l.qty, 0)
  const changed = check.lines.filter((l) => l.was != null).length
  const shown = onlyLeft ? left : check.lines

  return (
    <div className="modal-scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal cart-check" role="dialog" aria-modal="true" aria-label="Check your Walmart cart">
        <button type="button" className="btn btn-ghost modal-close" onClick={onClose} aria-label="Close">
          ✕
        </button>
        <p className="overline">Walmart cart · sent {fmtSent(check.sentAt)}</p>
        <h2 className="walmart-picker-title">Did everything make it?</h2>
        <p className="muted">
          Walmart doesn’t tell the app which items it couldn’t add. Go down your Walmart cart and tick each one here as you find it,
          checking the count matches. Anything left unticked needs adding by hand.
        </p>
        <p className="cart-check-summary">
          Sent {plural(check.lines.length, 'product')}
          {units > check.lines.length && ` (${units} counting quantities)`}.
          {check.unsent > 0 && ` ${plural(check.unsent, 'item')} with no Walmart match ${check.unsent === 1 ? 'wasn’t' : 'weren’t'} sent.`}
        </p>
        {changed > 0 && (
          <p className="cart-check-changed-note">
            {changed === 1 ? '1 count' : `${changed} counts`} changed since your last send. Walmart may not update items that are
            already in your cart, so check {changed === 1 ? 'that one' : 'those'} closely.
          </p>
        )}
        <div className="cart-check-progress">
          <p aria-live="polite">
            {left.length === 0 ? 'Everything is ticked off.' : `Found ${found.size} of ${check.lines.length} · ${left.length} not found yet`}
          </p>
          {(onlyLeft || (found.size > 0 && left.length > 0)) && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOnlyLeft(!onlyLeft)}>
              {onlyLeft ? 'Show everything' : 'Show only not found'}
            </button>
          )}
        </div>

        <ul className="cart-check-list">
          {shown.map((l) => (
            <li key={l.itemId} className={`cart-check-row${found.has(l.itemId) ? ' cart-check-row-found' : ''}`}>
              <label className="cart-check-label">
                <input type="checkbox" checked={found.has(l.itemId)} onChange={() => onToggle(l.itemId)} />
                <span className="cart-check-text">
                  <span className="cart-check-product">{l.product}</span>
                  <span className="cart-check-meta">for {l.names.join(', ')}</span>
                  {l.was != null && (
                    <span className="cart-check-was">
                      Was ×{l.was} last send. Check the cart shows ×{l.qty}.
                    </span>
                  )}
                </span>
              </label>
              <span className="cart-check-qty mono">×{l.qty}</span>
              <a
                className="btn btn-ghost btn-sm"
                href={walmartProductUrl(l.itemId)}
                target="_blank"
                rel="noreferrer"
                aria-label={`Open ${l.product} on Walmart`}
              >
                Open ↗
              </a>
            </li>
          ))}
          {shown.length === 0 && <li className="muted cart-check-empty">Nothing left to find.</li>}
        </ul>

        <div className="walmart-picker-foot cart-check-foot">
          <button type="button" className="btn btn-primary btn-sm" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
