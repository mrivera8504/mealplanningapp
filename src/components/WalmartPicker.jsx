import { useEffect, useRef, useState } from 'react'
import {
  WalmartError,
  fmtPrice,
  getWalmartItem,
  parseWalmartUrl,
  searchWalmart,
  walmartSearchUrl,
} from '../lib/walmart'

// Remembered for the page's lifetime so an unconfigured proxy is asked once, not per item.
let searchAvailable = true

/**
 * Walks through grocery items one at a time and asks which Walmart product
 * the household buys for each. The main path is pasting a walmart.com link;
 * when the Walmart API is configured, search results are offered as well.
 *
 * queue: [{ key, name, quantities }]
 */
export default function WalmartPicker({ queue, matches, onChoose, onSkip, onClose }) {
  const [index, setIndex] = useState(0)
  const [link, setLink] = useState('')
  const [linkError, setLinkError] = useState('')
  const [busy, setBusy] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState(null) // null = no search run (or search unavailable)
  const [searching, setSearching] = useState(false)
  const linkRef = useRef(null)

  const row = queue[index]
  const current = row ? matches[row.key] : null

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const runSearch = async (q) => {
    if (!searchAvailable || !q.trim()) return
    setSearching(true)
    try {
      setResults(await searchWalmart(q))
    } catch (err) {
      if (err instanceof WalmartError && err.code === 'not_configured') searchAvailable = false
      setResults(null)
    } finally {
      setSearching(false)
    }
  }

  useEffect(() => {
    if (!row) return
    setLink('')
    setLinkError('')
    setQuery(row.name)
    setResults(null)
    linkRef.current?.focus()
    runSearch(row.name)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index])

  if (!row) return null

  const advance = () => {
    if (index + 1 >= queue.length) onClose()
    else setIndex(index + 1)
  }

  const choose = (product) => {
    onChoose(row.key, product)
    advance()
  }

  const submitLink = async (e) => {
    e.preventDefault()
    const parsed = parseWalmartUrl(link)
    if (!parsed) {
      setLinkError('That doesn’t look like a walmart.com product link — it should contain “/ip/”.')
      return
    }
    let product = { itemId: parsed.itemId, name: parsed.name, price: null, size: null, image: null }
    if (searchAvailable) {
      setBusy(true)
      try {
        product = await getWalmartItem(parsed.itemId)
      } catch {
        /* keep the name from the link */
      } finally {
        setBusy(false)
      }
    }
    choose(product)
  }

  return (
    <div className="modal-scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal walmart-picker" role="dialog" aria-modal="true" aria-label="Match a Walmart product">
        <button type="button" className="btn btn-ghost modal-close" onClick={onClose} aria-label="Close">
          ✕
        </button>
        <p className="overline">
          Walmart match{queue.length > 1 ? ` · ${index + 1} of ${queue.length}` : ''}
        </p>
        <h2 className="walmart-picker-title">{row.name}</h2>
        {row.quantities && <p className="mono grocery-qty">{row.quantities}</p>}

        {current?.product && (
          <div className="walmart-current">
            <p className="muted">You usually get:</p>
            <ProductLine product={current.product} />
            <button type="button" className="btn btn-secondary btn-sm" onClick={advance}>
              Keep this one
            </button>
          </div>
        )}

        <ol className="walmart-steps">
          <li>
            <a className="btn btn-secondary btn-sm" href={walmartSearchUrl(query || row.name)} target="_blank" rel="noreferrer">
              Find “{query || row.name}” on Walmart ↗
            </a>
          </li>
          <li>
            <form className="walmart-link-form" onSubmit={submitLink}>
              <input
                ref={linkRef}
                className="input"
                placeholder="Paste the product link here"
                value={link}
                onChange={(e) => {
                  setLink(e.target.value)
                  setLinkError('')
                }}
                aria-label="Walmart product link"
              />
              <button type="submit" className="btn btn-primary" disabled={!link.trim() || busy}>
                {busy ? 'Looking…' : 'Use this'}
              </button>
            </form>
            {linkError && <p className="walmart-error">{linkError}</p>}
          </li>
        </ol>

        {searchAvailable && (
          <div className="walmart-search">
            <form
              className="walmart-link-form"
              onSubmit={(e) => {
                e.preventDefault()
                runSearch(query)
              }}
            >
              <input
                className="input"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search Walmart"
              />
              <button type="submit" className="btn btn-secondary" disabled={searching}>
                Search
              </button>
            </form>
            {searching && <p className="muted">Checking Walmart…</p>}
            {results && !searching && (
              results.length === 0 ? (
                <p className="muted">Nothing found — try fewer words, or paste a link above.</p>
              ) : (
                <ul className="walmart-results">
                  {results.map((p, i) => (
                    <li key={p.itemId} className="walmart-result">
                      <ProductLine product={p} badge={i === 0 && !current?.product ? 'Best guess' : null} />
                      <button type="button" className="btn btn-basil btn-sm" onClick={() => choose(p)}>
                        {i === 0 && !current?.product ? 'Yes, this one' : 'Use'}
                      </button>
                    </li>
                  ))}
                </ul>
              )
            )}
          </div>
        )}

        <div className="walmart-picker-foot">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              onSkip(row.key)
              advance()
            }}
          >
            Don’t buy this at Walmart
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={advance}>
            {index + 1 >= queue.length ? 'Done' : 'Skip for now →'}
          </button>
        </div>
      </div>
    </div>
  )
}

export function ProductLine({ product, badge }) {
  return (
    <span className="walmart-product">
      {product.image && <img src={product.image} alt="" className="walmart-thumb" />}
      <span className="walmart-product-text">
        {badge && <span className="overline walmart-badge">{badge}</span>}
        <span className="walmart-product-name">{product.name}</span>
        {(product.size || product.price != null) && (
          <span className="mono walmart-product-meta">
            {[product.size, fmtPrice(product.price)].filter(Boolean).join(' · ')}
          </span>
        )}
      </span>
    </span>
  )
}
