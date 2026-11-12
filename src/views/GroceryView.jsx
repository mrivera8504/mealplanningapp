import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { usePlan } from '../hooks/usePlan'
import { useWalmartProducts } from '../hooks/useWalmartProducts'
import { useIngredients } from '../hooks/useIngredients'
import { useSettings } from '../context/SettingsContext'
import WalmartPicker from '../components/WalmartPicker'
import { buildGroceryItems, canonicalKey, normalizeName } from '../lib/grocery'
import { walmartCartUrl } from '../lib/walmart'
import { SECTIONS, orderedSections, sectionFor } from '../lib/sections'
import { SORT_MODES, arrangeRows, moveInOrder, shiftSection } from '../lib/groceryOrder'
import { fmtWeekRange, toISODate, weekDates, weekIdFor } from '../lib/dates'

/**
 * Grocery list for the current week. The generated list is derived from the
 * plan; checked-off state and manual extras persist per week. It can be shown
 * by store section (in the household's own section order), by name, or in a
 * manual order that carries over from week to week. Each item can
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
  const ingredients = useIngredients()
  const { settings, update: updateSettings } = useSettings()
  const sortMode = settings.grocerySort || 'name'
  const dragKey = useRef(null)
  const [dropTarget, setDropTarget] = useState(null)
  const [pickerQueue, setPickerQueue] = useState(null)
  const [renames, setRenames] = useState({})
  const [editing, setEditing] = useState(null) // { key, draft }

  const meals = useMemo(
    () =>
      // Everything cooked this week: each night's dinner, its sides and its dessert.
      weekDates(startIso)
        .flatMap((d) => {
          const day = plan.days[d.iso]
          return [day?.dinner, ...(day?.sides || []), day?.dessert]
        })
        .filter(Boolean),
    [plan, startIso]
  )

  const merge = useMemo(() => {
    const names = {}
    for (const [key, item] of Object.entries(ingredients.items)) if (item.name) names[key] = item.name
    return { aliases: ingredients.aliases, names }
  }, [ingredients.items, ingredients.aliases])

  const items = useMemo(() => buildGroceryItems(meals, renames, merge), [meals, renames, merge])

  useEffect(() => {
    let alive = true
    repo.loadGroceryNames().then((n) => alive && setRenames(n?.renames || {}))
    return () => {
      alive = false
    }
  }, [repo])

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

  /**
   * Recipe items: remembered per recipe + ingredient, so the fix sticks every
   * week that recipe is planned. Extras: just this week's entry.
   */
  const renameRow = (row, rawName) => {
    setEditing(null)
    const name = rawName.trim()
    const newKey = normalizeName(name)
    if (!newKey || name === row.name) return
    if (row.extra) {
      persist({ ...state, extras: state.extras.map((x) => (x.key === row.key ? { ...x, name } : x)) })
      return
    }
    const next = { ...renames }
    for (const source of row.sources) {
      // Renaming back to the recipe's own wording just drops the rename.
      if (source.endsWith(`::${newKey}`)) delete next[source]
      else next[source] = name
    }
    setRenames(next)
    repo.saveGroceryNames({ renames: next })
    if (state.checked[row.key]) persist({ ...state, checked: { ...state.checked, [newKey]: true } })
  }

  const clearChecked = () => {
    persist({ ...state, checked: {} })
    toast('List reset — everything unchecked.')
  }

  const allRows = [
    ...items.map((it) => ({ ...it, matchKey: it.key, extra: false })),
    ...state.extras.map((x) => ({
      key: x.key,
      matchKey: canonicalKey(normalizeName(x.name), ingredients.aliases) || x.key,
      name: x.name,
      aisle: null,
      quantities: '',
      recipes: [],
      sources: [],
      renamedFrom: [],
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

  const groups = arrangeRows(allRows, sortMode, ingredients)
  const shownKeys = [...new Set(groups.flatMap((g) => g.rows.map((r) => r.matchKey)))]

  /** Manual mode: put `key` just before or after `targetKey`, remembered across weeks. */
  const placeRow = (key, targetKey, side) => {
    if (!key || !targetKey || key === targetKey) return
    ingredients.setManualOrder(moveInOrder(ingredients.manualOrder, shownKeys, key, targetKey, side))
  }

  const nudgeRow = (key, delta) => {
    const i = shownKeys.indexOf(key)
    const target = shownKeys[i + delta]
    if (target) placeRow(key, target, delta < 0 ? 'before' : 'after')
  }

  const nudgeSection = (section, delta) =>
    ingredients.setSectionOrder(shiftSection(ingredients.sectionOrder, section, delta))

  const sectionOfRow = (row) =>
    sectionFor({ chosen: ingredients.items[row.matchKey]?.section, aisle: row.aisle, name: row.name })

  const openPicker = (rows) =>
    setPickerQueue(rows.map((r) => ({ key: r.matchKey, name: r.name, quantities: r.quantities })))

  const sendToCart = () => {
    window.open(walmartCartUrl(cartLines), '_blank', 'noopener')
    if (unmatched.length) toast(`${unmatched.length} item${unmatched.length > 1 ? 's' : ''} weren’t matched — add those by hand.`)
  }

  return (
    <div className="grocery-view">
      <div className="page-head">
        <div className="page-head-main">
          <h1 className="page-title">Groceries</h1>
          <p className="page-sub">
            {fmtWeekRange(startIso)}
            {allRows.length > 0 && ` · ${allRows.length} item${allRows.length === 1 ? '' : 's'}`}
          </p>
        </div>
      </div>

      {loading || !stateLoaded ? (
        <p className="muted">Gathering the week’s ingredients…</p>
      ) : meals.length === 0 && state.extras.length === 0 ? (
        <div className="empty-state">
          <p className="empty-state-title">Nothing on the list yet</p>
          <p className="muted">
            Plan a few nights on <Link to="/">the weekly spread</Link> and every ingredient lands here, merged
            and ready for the store.
          </p>
        </div>
      ) : (
        <div className="grocery-layout">
          <div className="grocery-main">
          <div className="grocery-sortbar">
            <span className="overline">Sort by</span>
            <div className="seg" role="radiogroup" aria-label="Sort the list">
              {SORT_MODES.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  role="radio"
                  aria-checked={sortMode === m.value}
                  className={`seg-btn${sortMode === m.value ? ' seg-btn-on' : ''}`}
                  onClick={() => updateSettings({ grocerySort: m.value })}
                >
                  {m.label}
                </button>
              ))}
            </div>
            {sortMode === 'manual' && <span className="muted grocery-sort-hint">Drag items, or use the arrows. Your order carries over to next week.</span>}
          </div>

          {groups.map((group, gi) => (
            <section key={group.section || 'all'} className="grocery-group">
              {group.section && (
                <h3 className="grocery-section-head">
                  <span>{group.section}</span>
                  <span className="grocery-section-move">
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => nudgeSection(group.section, -1)}
                      disabled={orderedSections(ingredients.sectionOrder).indexOf(group.section) === 0}
                      aria-label={`Move ${group.section} up`}
                      title="Move section up"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => nudgeSection(group.section, 1)}
                      disabled={gi === groups.length - 1 && orderedSections(ingredients.sectionOrder).indexOf(group.section) === SECTIONS.length - 1}
                      aria-label={`Move ${group.section} down`}
                      title="Move section down"
                    >
                      ↓
                    </button>
                  </span>
                </h3>
              )}
              <ul className="grocery-list">
                {group.rows.map((row) => (
                  <li
                    key={row.key}
                    className={[
                      'grocery-row',
                      state.checked[row.key] && 'grocery-row-done',
                      sortMode === 'manual' && 'grocery-row-movable',
                      dropTarget === row.key && 'grocery-row-drop',
                    ].filter(Boolean).join(' ')}
                    draggable={sortMode === 'manual' && editing?.key !== row.key}
                    onDragStart={(e) => {
                      dragKey.current = row.matchKey
                      e.dataTransfer.effectAllowed = 'move'
                    }}
                    onDragOver={(e) => {
                      if (sortMode !== 'manual' || !dragKey.current) return
                      e.preventDefault()
                      setDropTarget(row.key)
                    }}
                    onDragLeave={() => setDropTarget((t) => (t === row.key ? null : t))}
                    onDrop={(e) => {
                      e.preventDefault()
                      setDropTarget(null)
                      const from = shownKeys.indexOf(dragKey.current)
                      const to = shownKeys.indexOf(row.matchKey)
                      placeRow(dragKey.current, row.matchKey, from < to ? 'after' : 'before')
                      dragKey.current = null
                    }}
                    onDragEnd={() => {
                      dragKey.current = null
                      setDropTarget(null)
                    }}
                  >
                    {editing?.key === row.key ? (
                      <form
                        className="grocery-rename"
                        onSubmit={(e) => {
                          e.preventDefault()
                          renameRow(row, editing.draft)
                        }}
                      >
                        <input
                          className="input"
                          autoFocus
                          value={editing.draft}
                          onChange={(e) => setEditing({ ...editing, draft: e.target.value })}
                          onKeyDown={(e) => e.key === 'Escape' && setEditing(null)}
                          aria-label={`New name for ${row.name}`}
                        />
                        <button type="submit" className="btn btn-primary btn-sm">
                          Save
                        </button>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(null)}>
                          Cancel
                        </button>
                      </form>
                    ) : (
                      <label className="grocery-label">
                        <input
                          type="checkbox"
                          checked={Boolean(state.checked[row.key])}
                          onChange={() => toggle(row.key)}
                        />
                        <span className="grocery-name">{row.name}</span>
                        {row.renamedFrom.length > 0 && (
                          <span className="grocery-renamed muted">was {row.renamedFrom.join(', ')}</span>
                        )}
                        {row.quantities && <span className="mono grocery-qty">{row.quantities}</span>}
                      </label>
                    )}
                    {row.recipes.length > 0 && (
                      <span className="grocery-sources muted" title={row.recipes.join(' · ')}>
                        {row.recipes.length > 1 ? `${row.recipes.length} recipes` : row.recipes[0]}
                      </span>
                    )}
                    {walmart.loaded && !state.checked[row.key] && editing?.key !== row.key && (
                      <BuyCount
                        name={row.name}
                        match={walmart.matches[row.matchKey]}
                        onQty={(q) => walmart.setQty(row.matchKey, q)}
                      />
                    )}
                    {editing?.key !== row.key && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm grocery-edit"
                        onClick={() => setEditing({ key: row.key, draft: row.name })}
                        aria-label={`Rename ${row.name}`}
                        title="Rename"
                      >
                        ✎
                      </button>
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
                    {sortMode === 'section' && editing?.key !== row.key && (
                      <select
                        className="grocery-section-select"
                        value={sectionOfRow(row)}
                        onChange={(e) => ingredients.setSection(row.matchKey, e.target.value)}
                        aria-label={`Section for ${row.name}`}
                      >
                        {SECTIONS.map((sec) => (
                          <option key={sec} value={sec}>
                            {sec}
                          </option>
                        ))}
                      </select>
                    )}
                    {sortMode === 'manual' && editing?.key !== row.key && (
                      <span className="grocery-move">
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => nudgeRow(row.matchKey, -1)}
                          disabled={shownKeys.indexOf(row.matchKey) === 0}
                          aria-label={`Move ${row.name} up`}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => nudgeRow(row.matchKey, 1)}
                          disabled={shownKeys.indexOf(row.matchKey) === shownKeys.length - 1}
                          aria-label={`Move ${row.name} down`}
                        >
                          ↓
                        </button>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}

          </div>

          <aside className="grocery-aside" aria-label="List summary">
            <div className="panel">
              <div className="panel-row">
                <span className="panel-title">Progress</span>
                <span className="muted mono">
                  {allRows.length - remaining} of {allRows.length}
                </span>
              </div>
              <div
                className="progress"
                role="progressbar"
                aria-label="Items checked off"
                aria-valuemin={0}
                aria-valuemax={allRows.length}
                aria-valuenow={allRows.length - remaining}
              >
                <span style={{ width: `${allRows.length ? ((allRows.length - remaining) / allRows.length) * 100 : 0}%` }} />
              </div>
              {cartLines.length > 0 && (
                <button type="button" className="btn btn-primary panel-wide" onClick={sendToCart}>
                  Send {cartLines.length} to Walmart cart
                </button>
              )}
              {walmart.loaded && unmatched.length > 0 && (
                <p className="muted">
                  {unmatched.length} item{unmatched.length > 1 ? 's' : ''} still need{unmatched.length > 1 ? '' : 's'} a Walmart match.
                </p>
              )}
              <div className="panel-buttons">
                {walmart.loaded && unmatched.length > 0 && (
                  <button type="button" className="btn btn-secondary" onClick={() => openPicker(unmatched)}>
                    Match items
                  </button>
                )}
                <button type="button" className="btn btn-secondary" onClick={() => window.print()}>
                  Print
                </button>
              </div>
              {remaining < allRows.length && (
                <button type="button" className="btn btn-ghost btn-sm panel-wide" onClick={clearChecked}>
                  Uncheck all
                </button>
              )}
            </div>

            <form className="panel" onSubmit={addExtra}>
              <label htmlFor="grocery-extra" className="panel-title">
                Add something extra
              </label>
              <div className="grocery-add">
                <input
                  id="grocery-extra"
                  className="input"
                  placeholder="Coffee, paper towels…"
                  value={newItem}
                  onChange={(e) => setNewItem(e.target.value)}
                />
                <button type="submit" className="btn btn-soft">
                  Add
                </button>
              </div>
            </form>
          </aside>
        </div>
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

// How many to put in the Walmart cart. Only shown once an item has a match.
function BuyCount({ name, match, onQty }) {
  if (!match?.product || match.skip) return null
  const qty = match.qty || 1
  return (
    <span className="grocery-buy" aria-label={`Buy count for ${name}`} title="How many to add to the Walmart cart">
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => onQty(qty - 1)} disabled={qty <= 1} aria-label={`One fewer ${name}`}>
        −
      </button>
      <span className="mono">{qty}</span>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => onQty(qty + 1)} aria-label={`One more ${name}`}>
        +
      </button>
    </span>
  )
}
