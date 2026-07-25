import { useState } from 'react'
import { searchRecipes } from '../lib/spoonacular'
import { CATEGORY_LABELS } from '../lib/houseRecipes'
import CategoryGlyph from './CategoryGlyph'

const TABS = ['My Recipes', 'Saved', 'Find New']

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
          ].filter(Boolean).join(' · ')}
        </span>
      </span>
    </button>
  )
}

export default function MealPicker({ dayName, onPick, onClose, mine, saved }) {
  const [tab, setTab] = useState(mine.length > 0 ? 0 : 1)
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState(null)
  const [filter, setFilter] = useState('')

  const handleSearch = async (e) => {
    e.preventDefault()
    if (!query.trim()) return
    setSearching(true)
    setSearchError(null)
    try {
      const results = await searchRecipes({ query: query.trim() })
      setSearchResults(results)
    } catch {
      setSearchError('Search failed -- check your connection and try again.')
    } finally {
      setSearching(false)
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
    'Search above to find new recipes.'

  return (
    <div className="modal-scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal meal-picker" role="dialog" aria-modal="true" aria-label={`Pick a meal for ${dayName}`}>
        <button type="button" className="btn btn-ghost modal-close" onClick={onClose} aria-label="Close">✕</button>
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
            <button type="submit" className="btn btn-secondary" disabled={searching || !query.trim()}>
              {searching ? 'Searching...' : 'Search'}
            </button>
            {searchError && <p className="form-error">{searchError}</p>}
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
          {recipes.length === 0 ? (
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
