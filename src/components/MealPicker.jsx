import { useEffect, useRef, useState } from 'react'
import { searchRecipes } from '../lib/spoonacular'
import { CATEGORY_LABELS } from '../lib/houseRecipes'
import CategoryGlyph from './CategoryGlyph'

const TABS = ['My Recipes', 'Saved', 'Find New']

const CUISINES = [
  { value: '', label: 'Any cuisine' },
  { value: 'Italian', label: 'Italian' },
  { value: 'Mexican', label: 'Mexican' },
  { value: 'Asian', label: 'Asian' },
  { value: 'American', label: 'American' },
  { value: 'Mediterranean', label: 'Mediterranean' },
  { value: 'French', label: 'French' },
  { value: 'Indian', label: 'Indian' },
  { value: 'Greek', label: 'Greek' },
  { value: 'Thai', label: 'Thai' },
  { value: 'Japanese', label: 'Japanese' },
  { value: 'Chinese', label: 'Chinese' },
]

function RecipeRow({ recipe, onPick }) {
  return (
    <button type="button" className="picker-row" onClick={() => onPick(recipe)}>
      <span className="picker-row-glyph">
        {recipe.image
          ? <img src={recipe.image} alt="" className="picker-row-img" />
          : <CategoryGlyph category={recipe.categories?.[0] || 'stew'} size={22} />
        }
      </span>
      <span className="picker-row-info">
        <span className="picker-row-title">{recipe.title}</span>
        <span className="picker-row-meta mono">
          {[
            recipe.readyInMinutes ? `${recipe.readyInMinutes} min` : null,
            recipe.categories?.slice(0, 2).map((c) => CATEGORY_LABELS[c] || c).join(', ') || null,
          ].filter(Boolean).join(' \xb7 ')}
        </span>
      </span>
    </button>
  )
}

export default function MealPicker({ dayName, onPick, onClose, mine, saved }) {
  const [tab, setTab] = useState(mine.length > 0 ? 0 : 1)
  const [query, setQuery] = useState('')
  const [cuisine, setCuisine] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState(null)
  const [filter, setFilter] = useState('')
  const popularLoadedRef = useRef(false)
  const queryRef = useRef(query)
  queryRef.current = query

  const runSearch = async (q, c) => {
    setSearching(true)
    setSearchError(null)
    try {
      const params = { sort: 'popularity', type: 'main course' }
      if (q) params.query = q
      if (c) params.cuisine = c
      const results = await searchRecipes(params)
      setSearchResults(results)
    } catch {
      setSearchError('Search failed -- check your connection and try again.')
    } finally {
      setSearching(false)
    }
  }

  // Auto-load popular main dishes the first time the Find New tab is opened
  useEffect(() => {
    if (tab !== 2 || popularLoadedRef.current) return
    popularLoadedRef.current = true
    runSearch('', '')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  const handleSearch = async (e) => {
    e.preventDefault()
    await runSearch(query.trim(), cuisine)
  }

  const handleCuisineChange = async (e) => {
    const c = e.target.value
    setCuisine(c)
    // Re-run whatever query is active when the cuisine filter changes
    if (popularLoadedRef.current) {
      await runSearch(queryRef.current.trim(), c)
    }
  }

  const filterRecipes = (list) => {
    if (!filter.trim()) return list
    const q = filter.toLowerCase()
    return list.filter((r) =>
      r.title.toLowerCase().includes(q) ||
      r.categories?.some((c) => (CATEGORY_LABELS[c] || c).toLowerCase().includes(q))
    )
  }

  const recipes = tab === 2 ? searchResults : filterRecipes(tab === 0 ? mine : saved)

  const emptyMessage =
    tab === 0 ? 'No personal recipes yet -- add some under Recipes.' :
    tab === 1 ? 'No saved recipes yet -- browse and save some under Recipes.' :
    searchError ? searchError :
    'No results -- try a different search or cuisine.'

  return (
    <div className="modal-scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal meal-picker" role="dialog" aria-modal="true" aria-label={`Pick a meal for ${dayName}`}>
        <button type="button" className="btn btn-ghost modal-close" onClick={onClose} aria-label="Close">&#x2715;</button>
        <h2 className="picker-heading">Pick a meal for {dayName}</h2>

        <div className="picker-tabs">
          {TABS.map((label, i) => (
            <button
              key={label}
              type="button"
              className={`picker-tab${tab === i ? ' picker-tab-active' : ''}`}
              onClick={() => { setTab(i); setFilter('') }}
            >
              {label}
              {i === 0 && mine.length > 0 && <span className="picker-tab-count">{mine.length}</span>}
              {i === 1 && saved.length > 0 && <span className="picker-tab-count">{saved.length}</span>}
            </button>
          ))}
        </div>

        {tab === 2 ? (
          <form className="picker-search" onSubmit={handleSearch}>
            <input
              className="input"
              placeholder="Search for a recipe..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
            <select
              className="input picker-cuisine"
              value={cuisine}
              onChange={handleCuisineChange}
              aria-label="Filter by cuisine"
            >
              {CUISINES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
            <button type="submit" className="btn btn-secondary" disabled={searching}>
              {searching ? 'Searching...' : 'Search'}
            </button>
          </form>
        ) : (
          <input
            className="input picker-filter"
            placeholder="Filter..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        )}

        <div className="picker-list">
          {tab === 2 && searching ? (
            <p className="note picker-empty">Finding recipes...</p>
          ) : recipes.length === 0 ? (
            <p className="note picker-empty">{emptyMessage}</p>
          ) : (
            recipes.map((recipe) => (
              <RecipeRow key={recipe.id} recipe={recipe} onPick={onPick} />
            ))
          )}
        </div>
      </div>
    </div>
  )
}
