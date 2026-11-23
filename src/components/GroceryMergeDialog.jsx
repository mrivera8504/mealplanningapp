import { useEffect, useMemo, useState } from 'react'

/**
 * Merge one grocery line into another: pick the item it's the same as, then
 * the name the combined line shows. Quantities add up, and the merge is
 * remembered for every week (it's the same merge the Ingredients page makes,
 * and can be split apart again from either place).
 */
export default function GroceryMergeDialog({ row, rows, onMerge, onClose }) {
  const [query, setQuery] = useState('')
  const [target, setTarget] = useState(null)
  const [name, setName] = useState('')

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Likely matches first: names that share a word with this one.
  const options = useMemo(() => {
    const words = new Set(row.name.toLowerCase().match(/[a-z]{3,}/g) || [])
    const q = query.trim().toLowerCase()
    return rows
      .filter((r) => !q || r.name.toLowerCase().includes(q))
      .map((r) => ({ r, shared: (r.name.toLowerCase().match(/[a-z]{3,}/g) || []).filter((w) => words.has(w)).length }))
      .sort((a, b) => b.shared - a.shared || a.r.name.localeCompare(b.r.name))
      .map((x) => x.r)
  }, [rows, row.name, query])

  const pick = (r) => {
    setTarget(r)
    setName(r.name)
  }

  return (
    <div className="modal-scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal merge-dialog" role="dialog" aria-modal="true" aria-label={`Merge ${row.name}`}>
        <button type="button" className="btn btn-ghost modal-close" onClick={onClose} aria-label="Close">
          ✕
        </button>
        <p className="overline">Merge</p>
        <h2 className="walmart-picker-title">{target ? 'Show the combined line as' : `Which item is ${row.name} the same as?`}</h2>

        {!target ? (
          <>
            <input
              className="input"
              placeholder="Search the list"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search the grocery list"
            />
            <ul className="merge-pick-list">
              {options.map((r) => (
                <li key={r.key}>
                  <button type="button" className="merge-pick" onClick={() => pick(r)}>
                    <span className="grocery-name">{r.name}</span>
                    {r.quantities && <span className="mono muted">{r.quantities}</span>}
                  </button>
                </li>
              ))}
              {options.length === 0 && <li className="muted">Nothing else on the list matches.</li>}
            </ul>
          </>
        ) : (
          <>
            <p className="muted">
              {row.name} and {target.name} become one line, with their amounts added together. Your recipes don't change, and you can
              split them apart again from the line's menu.
            </p>
            <div className="merge-options" role="radiogroup">
              {[target.name, row.name].map((n) => (
                <label key={n} className="merge-option">
                  <input type="radio" name="kept-name" checked={name === n} onChange={() => setName(n)} />
                  <span className="grocery-name">{n}</span>
                </label>
              ))}
            </div>
            <label className="merge-name">
              <span className="overline">Or call it</span>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <div className="walmart-picker-foot">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setTarget(null)}>
                Back
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => onMerge(row, target, name.trim())} disabled={!name.trim()}>
                Merge
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
