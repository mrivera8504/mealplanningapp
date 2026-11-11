import { useEffect, useMemo, useState } from 'react'
import { useToast } from '../context/ToastContext'
import { useWalmartProducts } from '../hooks/useWalmartProducts'
import { useIngredients } from '../hooks/useIngredients'
import { useMyRecipes } from '../hooks/useMyRecipes'
import { useSavedRecipes } from '../hooks/useSavedRecipes'
import { usePlan } from '../hooks/usePlan'
import WalmartPicker, { ProductLine } from '../components/WalmartPicker'
import { WalmartError, getWalmartItem, walmartProductUrl } from '../lib/walmart'
import { normalizeName } from '../lib/grocery'
import { SECTIONS } from '../lib/sections'
import { STATUSES, buildIngredientRows, mergeIngredients, splitIngredient, viewRows } from '../lib/ingredientsPage'
import { addDays, fmtShort, toISODate } from '../lib/dates'

const SORTS = [
  { value: 'name', label: 'Name' },
  { value: 'section', label: 'Section' },
  { value: 'status', label: 'Status' },
]

const STATUS_LABEL = {
  matched: 'Matched',
  unmatched: 'Unmatched',
  skip: 'Not at Walmart',
  unavailable: 'Unavailable',
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * Every ingredient the app knows, with its store section and Walmart
 * product, editable in one place. Changes here are the same data the grocery
 * list uses, so they show up there straight away (and the other way round).
 */
export default function IngredientsView() {
  const toast = useToast()
  const walmart = useWalmartProducts()
  const ingredients = useIngredients()
  const { mine } = useMyRecipes()
  const { saved } = useSavedRecipes()
  const { plan } = usePlan()

  // Dinners planned in the last two weeks or the next two count too, so house
  // and library recipes on the grocery list show up here.
  const plannedRecipes = useMemo(() => {
    const from = toISODate(addDays(new Date(), -14))
    const to = toISODate(addDays(new Date(), 14))
    return Object.entries(plan.days || {})
      .filter(([iso, day]) => iso >= from && iso <= to && day?.dinner && !day.dinner.takeout)
      .map(([, day]) => day.dinner)
  }, [plan])

  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')
  const [sort, setSort] = useState('name')
  const [selected, setSelected] = useState(() => new Set())
  const [merging, setMerging] = useState(null) // { keys, keptKey, name }
  const [pickerFor, setPickerFor] = useState(null) // row
  const [newName, setNewName] = useState('')
  const [refreshing, setRefreshing] = useState(null) // key being refreshed, or { done, total } for all
  const [refreshBlocked, setRefreshBlocked] = useState(false)

  useEffect(() => {
    document.title = "Ingredients · What's for Dinner"
  }, [])

  const rows = useMemo(
    () => buildIngredientRows({ matches: walmart.matches, ingredients, recipes: [...mine, ...saved, ...plannedRecipes] }),
    [walmart.matches, ingredients, mine, saved, plannedRecipes]
  )
  const shown = useMemo(() => viewRows(rows, { query, status, sort }), [rows, query, status, sort])
  const counts = useMemo(() => {
    const c = { all: rows.length }
    for (const r of rows) c[r.status] = (c[r.status] || 0) + 1
    return c
  }, [rows])
  const matchedRows = rows.filter((r) => r.match?.product)

  const toggleSelect = (key) =>
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const addIngredient = (e) => {
    e.preventDefault()
    const name = newName.trim()
    const key = normalizeName(name)
    if (!key) return
    if (rows.some((r) => r.key === key)) {
      toast(`${name} is already on the list.`)
      setQuery(name)
    } else {
      ingredients.setItem(key, { name, addedByHand: true })
      toast(`${name} added. Match it to a Walmart product whenever you're ready.`)
    }
    setNewName('')
  }

  /** Check one product's price and availability. Returns false when refreshing isn't possible here. */
  const refreshOne = async (row) => {
    try {
      const product = await getWalmartItem(row.match.product.itemId)
      if (product) walmart.refreshed(row.key, product)
      return true
    } catch (err) {
      if (err instanceof WalmartError && err.code === 'not_configured') {
        setRefreshBlocked(true)
        return false
      }
      return true
    }
  }

  const refreshRow = async (row) => {
    setRefreshing(row.key)
    const ok = await refreshOne(row)
    setRefreshing(null)
    if (!ok) toast('Price refresh needs the Walmart connection, which is not set up on this site.', 'warn')
  }

  const refreshAll = async () => {
    const list = matchedRows
    for (let i = 0; i < list.length; i++) {
      setRefreshing({ done: i, total: list.length })
      const ok = await refreshOne(list[i])
      if (!ok) {
        setRefreshing(null)
        toast('Price refresh needs the Walmart connection, which is not set up on this site.', 'warn')
        return
      }
      await wait(300) // one at a time, gently
    }
    setRefreshing(null)
    toast(`Checked ${list.length} price${list.length === 1 ? '' : 's'}.`)
  }

  const startMerge = () => {
    const keys = [...selected].filter((k) => rows.some((r) => r.key === k))
    if (keys.length < 2) return
    const first = rows.find((r) => r.key === keys[0])
    setMerging({ keys, keptKey: first.key, name: first.name })
  }

  const finishMerge = () => {
    const { keys, keptKey, name } = merging
    const { data, walmartCopy } = mergeIngredients(ingredients, walmart.matches, keys, keptKey, name.trim() || keptKey)
    ingredients.write((d) => ({ ...d, items: data.items, aliases: data.aliases }))
    if (walmartCopy) walmart.put(keptKey, walmartCopy)
    setSelected(new Set())
    setMerging(null)
    toast(`Merged ${keys.length} ingredients into ${name.trim() || keptKey}.`)
  }

  const split = (key, name) => {
    ingredients.write((d) => splitIngredient(d, key))
    toast(`${name} is its own ingredient again.`)
  }

  const loaded = walmart.loaded && ingredients.loaded

  return (
    <div className="ingredients-view">
      <header className="ingredients-head">
        <div>
          <h2>Ingredients</h2>
          <p className="muted">Every ingredient from your recipes and this month's plan, with its store section and the Walmart product you buy.</p>
        </div>
        {matchedRows.length > 0 && (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={refreshAll}
            disabled={Boolean(refreshing) || refreshBlocked}
            title={refreshBlocked ? 'The Walmart connection is not set up on this site' : undefined}
          >
            {refreshing?.total ? `Checking ${refreshing.done + 1} of ${refreshing.total}…` : 'Refresh all prices'}
          </button>
        )}
      </header>

      <div className="ingredients-toolbar">
        <input
          className="input ingredients-search"
          type="search"
          placeholder="Search ingredients or products"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search ingredients"
        />
        <label className="ingredients-control">
          <span className="overline">Show</span>
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label} ({counts[s.value] || 0})
              </option>
            ))}
          </select>
        </label>
        <label className="ingredients-control">
          <span className="overline">Sort</span>
          <select className="input" value={sort} onChange={(e) => setSort(e.target.value)}>
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        {selected.size >= 2 && (
          <button type="button" className="btn btn-primary btn-sm" onClick={startMerge}>
            Merge {selected.size} selected
          </button>
        )}
        {selected.size > 0 && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelected(new Set())}>
            Clear selection
          </button>
        )}
      </div>

      {refreshBlocked && (
        <p className="settings-warning">Price refresh is unavailable: the Walmart connection is not set up on this site. Everything else here still works.</p>
      )}

      {!loaded ? (
        <p className="muted">Gathering ingredients…</p>
      ) : rows.length === 0 ? (
        <p className="muted">No ingredients yet. Add recipes, or add a staple below.</p>
      ) : shown.length === 0 ? (
        <p className="muted">Nothing matches that search.</p>
      ) : (
        <div className="ingredients-table" role="table" aria-label="Ingredients">
          <div className="ingredients-row ingredients-row-head" role="row">
            <span role="columnheader" className="sr-only">Select</span>
            <span role="columnheader">Ingredient</span>
            <span role="columnheader">Section</span>
            <span role="columnheader">Walmart product</span>
            <span role="columnheader">Qty</span>
            <span role="columnheader">Status</span>
          </div>
          {shown.map((row) => (
            <IngredientRow
              key={row.key}
              row={row}
              selected={selected.has(row.key)}
              onSelect={() => toggleSelect(row.key)}
              onSection={(section) => ingredients.setSection(row.key, section)}
              onPick={() => setPickerFor(row)}
              onQty={(q) => walmart.setQty(row.key, q)}
              onSkip={() => walmart.skip(row.key)}
              onForget={() => walmart.forget(row.key)}
              onRefresh={() => refreshRow(row)}
              refreshing={refreshing === row.key}
              refreshBlocked={refreshBlocked}
              onSplit={split}
            />
          ))}
        </div>
      )}

      <form className="grocery-add" onSubmit={addIngredient}>
        <input
          className="input"
          placeholder="Add a staple that isn't in a recipe: coffee, paper towels…"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          aria-label="Add an ingredient"
        />
        <button type="submit" className="btn btn-secondary">
          Add ingredient
        </button>
      </form>

      {pickerFor && (
        <WalmartPicker
          queue={[{ key: pickerFor.key, name: pickerFor.name, quantities: '' }]}
          matches={walmart.matches}
          onChoose={walmart.choose}
          onSkip={walmart.skip}
          onClose={() => setPickerFor(null)}
        />
      )}

      {merging && (
        <MergeDialog
          merging={merging}
          rows={rows}
          onChange={setMerging}
          onConfirm={finishMerge}
          onClose={() => setMerging(null)}
        />
      )}
    </div>
  )
}

function IngredientRow({ row, selected, onSelect, onSection, onPick, onQty, onSkip, onForget, onRefresh, refreshing, refreshBlocked, onSplit }) {
  const { match } = row
  const checkedAt = match?.priceCheckedAt || match?.updatedAt
  return (
    <div className={`ingredients-row${selected ? ' ingredients-row-selected' : ''}`} role="row">
      <span role="cell" className="ingredients-cell-select">
        <input type="checkbox" checked={selected} onChange={onSelect} aria-label={`Select ${row.name}`} />
      </span>

      <span role="cell" className="ingredients-cell-name">
        <span className="grocery-name">{row.name}</span>
        {row.recipes.length > 0 && (
          <span className="muted ingredients-recipes" title={row.recipes.join(' · ')}>
            {row.recipes.length > 2 ? `${row.recipes.slice(0, 2).join(', ')} +${row.recipes.length - 2}` : row.recipes.join(', ')}
          </span>
        )}
        {row.mergedFrom.length > 0 && (
          <span className="ingredients-merged">
            Includes{' '}
            {row.mergedFrom.map((m, i) => (
              <span key={m.key}>
                {i > 0 && ', '}
                {m.name}{' '}
                <button type="button" className="link-inline" onClick={() => onSplit(m.key, m.name)}>
                  split
                </button>
              </span>
            ))}
          </span>
        )}
      </span>

      <span role="cell" className="ingredients-cell-section">
        <select
          className="grocery-section-select"
          value={row.section}
          onChange={(e) => onSection(e.target.value)}
          aria-label={`Section for ${row.name}`}
        >
          {SECTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </span>

      <span role="cell" className="ingredients-cell-product">
        {match?.product ? (
          <>
            <a href={walmartProductUrl(match.product.itemId)} target="_blank" rel="noreferrer" className="ingredients-product-link">
              <ProductLine product={match.product} />
            </a>
            <span className="mono ingredients-checked">
              {match.unavailable && <strong className="ingredients-unavailable">Unavailable · </strong>}
              {checkedAt ? `price from ${fmtShort(new Date(checkedAt))}` : ''}
            </span>
            <span className="ingredients-actions">
              <button type="button" className="btn btn-ghost btn-sm" onClick={onPick}>
                Change
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={onRefresh}
                disabled={refreshing || refreshBlocked}
                title={refreshBlocked ? 'The Walmart connection is not set up on this site' : 'Check the current price'}
              >
                {refreshing ? 'Checking…' : 'Refresh'}
              </button>
            </span>
          </>
        ) : match?.skip ? (
          <span className="muted">Bought elsewhere or always on hand</span>
        ) : (
          <button type="button" className="btn btn-secondary btn-sm" onClick={onPick}>
            Match at Walmart
          </button>
        )}
      </span>

      <span role="cell" className="ingredients-cell-qty">
        {match?.product ? (
          <span className="walmart-qty" aria-label="Quantity">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onQty(match.qty - 1)} disabled={match.qty <= 1} aria-label="One fewer">
              −
            </button>
            <span className="mono">{match.qty}</span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onQty(match.qty + 1)} aria-label="One more">
              +
            </button>
          </span>
        ) : (
          <span className="muted">—</span>
        )}
      </span>

      <span role="cell" className="ingredients-cell-status">
        <span className={`chip ingredients-status ingredients-status-${row.status}`}>{STATUS_LABEL[row.status]}</span>
        {match?.skip ? (
          <button type="button" className="btn btn-ghost btn-sm" onClick={onForget}>
            Undo
          </button>
        ) : (
          <>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onSkip} title="Bought elsewhere or always on hand">
              Not at Walmart
            </button>
            {match?.product && (
              <button type="button" className="btn btn-danger-ghost btn-sm" onClick={onForget} title="Clear this match">
                Forget
              </button>
            )}
          </>
        )}
      </span>
    </div>
  )
}

function MergeDialog({ merging, rows, onChange, onConfirm, onClose }) {
  const chosen = merging.keys.map((k) => rows.find((r) => r.key === k)).filter(Boolean)

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="modal-scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal merge-dialog" role="dialog" aria-modal="true" aria-label="Merge ingredients">
        <button type="button" className="btn btn-ghost modal-close" onClick={onClose} aria-label="Close">
          ✕
        </button>
        <p className="overline">Merge {chosen.length} ingredients</p>
        <h2 className="walmart-picker-title">Which one do they become?</h2>
        <p className="muted">
          They'll show as one line on the grocery list, with quantities added together. Its Walmart product and section win.
          Your recipes aren't changed, and you can split them again later.
        </p>
        <div className="merge-options" role="radiogroup">
          {chosen.map((r) => (
            <label key={r.key} className="merge-option">
              <input
                type="radio"
                name="kept"
                checked={merging.keptKey === r.key}
                onChange={() => onChange({ ...merging, keptKey: r.key, name: r.name })}
              />
              <span className="grocery-name">{r.name}</span>
              <span className="muted">{r.match?.product ? r.match.product.name : STATUS_LABEL[r.status]}</span>
            </label>
          ))}
        </div>
        <label className="merge-name">
          <span className="overline">Show it as</span>
          <input className="input" value={merging.name} onChange={(e) => onChange({ ...merging, name: e.target.value })} />
        </label>
        <div className="walmart-picker-foot">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={onConfirm} disabled={!merging.name.trim()}>
            Merge
          </button>
        </div>
      </div>
    </div>
  )
}
