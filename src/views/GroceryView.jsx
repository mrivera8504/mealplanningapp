import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { usePlan } from '../hooks/usePlan'
import { buildGroceryItems } from '../lib/grocery'
import { fmtWeekRange, toISODate, weekDates, weekIdFor } from '../lib/dates'

/**
 * Grocery list for the current week. The generated list is derived from the
 * plan; checked-off state and manual extras persist per week.
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
    ...items.map((it) => ({ ...it, extra: false })),
    ...state.extras.map((x) => ({ key: x.key, name: x.name, quantities: '', recipes: [], extra: true })),
  ]
  const remaining = allRows.filter((r) => !state.checked[r.key]).length

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
    </div>
  )
}
