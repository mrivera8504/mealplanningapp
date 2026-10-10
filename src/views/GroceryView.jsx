import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { usePlan } from '../hooks/usePlan'
import { useWalmartProducts } from '../hooks/useWalmartProducts'
import WalmartPicker, { ProductLine } from '../components/WalmartPicker'
import { buildGroceryItems, normalizeName } from '../lib/grocery'
import { walmartCartUrl } from '../lib/walmart'
import { fmtWeekRange, toISODate, weekDates, weekIdFor } from '../lib/dates'

/**
 * Grocery list for the current week. The generated list is derived from the
 * plan; checked-off state and manual extras persist per week. Each item can
 * be matched to a remembered Walmart product, and everything matched and not
 * yet checked off can be sent to a Walmart cart in one go.
 */
export default function GroceryView() {
  const toast = useToast()
  const { repo } = useAuth()
  const startIso = toISODate(new Date())       // rolling window start for display
  const groceryKey = weekIdFor(new Date())     // stable Monday key for checked-state storage
  const { plan, loading } = usePlan()
  const [state, setState] = useState({ checked: {}, extras: [] })
  const [stateLoaded, setStateLoaded] = useState(false)
  const [newItem, setNewItem] = useState('')
  const walmart = useWalmartProducts()
  const [pickerQueue, setPickerQueue] = useState(null)

  const meals = useMemo(
    () =>
      weekDates(startIso)
        .map((d) => plan.days[d.iso]?.dinner)
        .filter(Boolean),
    [plan, startIso]
  )

  const items = useMemo(() => buildGroceryItems(meals), [meals])

  useEffect(() => {
    let alive = true
    repo.loadGrocery(groceryKey).then((g) => {
      if (!alive) return
      if (g) setState({ checked: g.checked || {}, extras: g.extras || [] })
      setStateLoaded(true)
    })
    return () => {
      alive = false
    }
  }, [repo, groceryKey])

  const persist = (next) => {
    setState(next)
    repo.saveGrocery(groceryKey, next)
  }

  const toggle = (key) => {
    persist({ ...state, checked: { ...state.checked, [key]: !state.checked[key] } })
  }

  const addExtra = (e) => {
    e.preventDefault()
    const name = newItem.trim()
    if (!name) return
    persist({ ...state, extras: [...state.extras, { key: `extra-${Date.now()}`, name }] })
    setNewItem('')
  }

  const removeExtra = (key) => {
    const { [key]: _dropped, ...restChecked } = state.checked
    persist({ checked: restChecked, extras: state.extras.filter((x) => x.key !== key) })
  }

  const clearChecked = () => {
    persist({ ...state, checked: {} })
    toast('List reset — everything unchecked.')
  }

  const allRows = [
    ...items.map((it) => ({ ...it, matchKey: it.key, extra: false })),
    ...state.extras.map((x) => ({
      key: x.key,
      matchKey: normalizeName(x.name) || x.key,
      name: x.name,
      quantities: '',
      recipes: [],
      extra: true,
    })),
  ]
  const remaining = allRows.filter((r) => !state.checked[r.key]).length

  // Walmart: only items still to get count toward matching and the cart.
  const openRows = allRows.filter((r) => !state.checked[r.key])
  const unmatched = openRows.filter((r) => !walmart.matches[r.matchKey])
  const cartLines = [...new Map(
    openRows
      .filter((r) => walmart.matches[r.matchKey]?.product)
      .map((r) => [r.matchKey, walmart.matches[r.matchKey]])
  ).values()].map((m) => ({ itemId: m.product.itemId, qty: m.qty }))

  const openPicker = (rows) =>
    setPickerQueue(rows.map((r) => ({ key: r.matchKey, name: r.name, quantities: r.quantities })))

  const sendToCart = () => {
    window.open(walmartCartUrl(cartLines), '_blank', 'noopener')
    if (unmatched.length) toast(`${unmatched.length} item${unmatched.length > 1 ? 's' : ''} weren’t matched — add those by hand.`)
  }

  return (
    <div className="grocery-view">
      <header className="grocery-head">
        <div>
          <h2>Grocery list</h2>
          <p className="mono grocery-week">{fmtWeekRange(startIso)}</p>
        </div>
        {allRows.length > 0 && (
          <div className="grocery-head-side">
            <p className="mono grocery-count">
              {remaining} of {allRows.length} to get
            </p>
            <button type="button" className="btn btn-ghost btn-sm" onClick={clearChecked}>
              Uncheck all
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => window.print()}>
              Print list
            </button>
            {walmart.loaded && unmatched.length > 0 && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => openPicker(unmatched)}>
                Match {unmatched.length} for Walmart
              </button>
            )}
            {cartLines.length > 0 && (
              <button type="button" className="btn btn-primary btn-sm" onClick={sendToCart}>
                Add {cartLines.length} to Walmart cart ↗
              </button>
            )}
          </div>
        )}
      </header>

      {loading || !stateLoaded ? (
        <p className="muted">Gathering the week’s ingredients…</p>
      ) : meals.length === 0 && state.extras.length === 0 ? (
        <div className="grocery-empty">
          <p className="note grocery-empty-line">The list writes itself — once dinner is planned.</p>
          <p className="muted">
            Plan a few nights on <Link to="/">the weekly spread</Link> and every ingredient lands here, merged
            and ready for the store.
          </p>
        </div>
      ) : (
        <>
          <ul className="grocery-list">
            {allRows.map((row) => (
              <li key={row.key} className={state.checked[row.key] ? 'grocery-row grocery-row-done' : 'grocery-row'}>
                <label className="grocery-label">
                  <input
                    type="checkbox"
                    checked={Boolean(state.checked[row.key])}
                    onChange={() => toggle(row.key)}
                  />
                  <span className="grocery-name">{row.name}</span>
                  {row.quantities && <span className="mono grocery-qty">{row.quantities}</span>}
                </label>
                {row.recipes.length > 0 && (
                  <span className="grocery-sources muted" title={row.recipes.join(' · ')}>
                    {row.recipes.length > 1 ? `${row.recipes.length} recipes` : row.recipes[0]}
                  </span>
                )}
                {row.extra && (
                  <button
                    type="button"
                    className="btn btn-danger-ghost btn-sm"
                    onClick={() => removeExtra(row.key)}
                    aria-label={`Remove ${row.name}`}
                  >
                    ✕
                  </button>
                )}
                {walmart.loaded && !state.checked[row.key] && (
                  <WalmartLine
                    match={walmart.matches[row.matchKey]}
                    onPick={() => openPicker([row])}
                    onQty={(q) => walmart.setQty(row.matchKey, q)}
                    onUndoSkip={() => walmart.forget(row.matchKey)}
                  />
                )}
              </li>
            ))}
          </ul>

          <form className="grocery-add" onSubmit={addExtra}>
            <input
              className="input"
              placeholder="Add something else — coffee, olive oil, flowers…"
              value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
              aria-label="Add an item"
            />
            <button type="submit" className="btn btn-secondary">
              Add item
            </button>
          </form>
        </>
      )}

      {pickerQueue && (
        <WalmartPicker
          queue={pickerQueue}
          matches={walmart.matches}
          onChoose={walmart.choose}
          onSkip={walmart.skip}
          onClose={() => setPickerQueue(null)}
        />
      )}
    </div>
  )
}

function WalmartLine({ match, onPick, onQty, onUndoSkip }) {
  if (match?.skip) {
    return (
      <div className="grocery-walmart">
        <span className="muted">Not from Walmart</span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onUndoSkip}>
          Undo
        </button>
      </div>
    )
  }
  if (match?.product) {
    return (
      <div className="grocery-walmart">
        <ProductLine product={match.product} />
        <span className="walmart-qty" aria-label="Quantity">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onQty(match.qty - 1)} disabled={match.qty <= 1} aria-label="One fewer">
            −
          </button>
          <span className="mono">{match.qty}</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onQty(match.qty + 1)} aria-label="One more">
            +
          </button>
        </span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onPick}>
          Change
        </button>
      </div>
    )
  }
  return (
    <div className="grocery-walmart">
      <button type="button" className="btn btn-ghost btn-sm" onClick={onPick}>
        Match at Walmart
      </button>
    </div>
  )
}
