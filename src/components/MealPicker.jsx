import { useEffect, useRef, useState } from 'react'
import { searchRecipes, RECIPE_PAGE_SIZE } from '../lib/spoonacular'
import { CATEGORY_LABELS, HOUSE_RECIPES } from '../lib/houseRecipes'
import { HOUSE_DESSERTS, HOUSE_SIDES } from '../lib/houseExtras'
import { courseInfo, ofCourse, quickEntry } from '../lib/courses'
import CategoryGlyph from './CategoryGlyph'

const TABS = ['My Recipes', 'Saved', 'House', 'Find New']
const FIND = 3
const HOUSE = { main: HOUSE_RECIPES, side: HOUSE_SIDES, dessert: HOUSE_DESSERTS }

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

/**
 * Pick a dish for a night by hand. `course` decides what's offered: mains for
 * the dinner slot, or sides / desserts -- which can also be typed as a plain
 * name, since most don't need a recipe.
 */
export default function MealPicker({ dayName, course = 'main', onPick, onClose, mine: allMine, saved: allSaved }) {
  const info = courseInfo(course)
  const mine = ofCourse(allMine, course)
  const saved = ofCourse(allSaved, course)
  const house = HOUSE[course]
  const [tab, setTab] = useState(mine.length > 0 ? 0 : saved.length > 0 ? 1 : 2)
  const [quickName, setQuickName] = useState('')
  const [quickIngredients, setQuickIngredients] = useState('')
  const [query, setQuery] = useState('')
  const [cuisine, setCuisine] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [totalResults, setTotalResults] = useState(0)
  const [offset, setOffset] = useState(0)
  const [searching, setSearching] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [searchError, setSearchError] = useState(null)
  const [filter, setFilter] = useState('')
  const popularLoadedRef = useRef(false)
  const activeRef = useRef({ q: '', c: '' })
  const queryRef = useRef(query)
  queryRef.current = query

  const runSearch = async (q, c, nextOffset = 0) => {
    if (nextOffset === 0) {
      setSearching(true)
      activeRef.current = { q, c }
    } else {
      setLoadingMore(true)
    }
    setSearchError(null)
    try {
      const params = { sort: 'popularity', type: info.spoonacularType }
      if (q) params.query = q
      if (c) params.cuisine = c
      if (nextOffset) params.offset = nextOffset
      const { recipes, totalResults: total } = await searchRecipes(params, course)
      setSearchResults((prev) => (nextOffset ? [...prev, ...recipes] : recipes))
      setTotalResults(total)
      setOffset(nextOffset)
    } catch {
      setSearchError('Search failed -- check your connection and try again.')
    } finally {
      setSearching(false)
      setLoadingMore(false)
    }
  }

  const handleLoadMore = () => {
    const { q, c } = activeRef.current
    runSearch(q, c, offset + RECIPE_PAGE_SIZE)
  }

  // Auto-load popular main dishes the first time the Find New tab is opened
  useEffect(() => {
    if (tab !== FIND || popularLoadedRef.current) return
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

  const recipes = tab === FIND ? searchResults : filterRecipes(tab === 0 ? mine : tab === 1 ? saved : house)

  const addQuick = (e) => {
    e.preventDefault()
    if (!quickName.trim()) return
    onPick(quickEntry(quickName, course, quickIngredients))
  }

  const emptyMessage =
    tab === 0 ? `No ${info.label.toLowerCase()} of your own yet -- add some under Recipes.` :
    tab === 1 ? `No saved ${info.label.toLowerCase()} yet -- browse and save some under Recipes.` :
    tab === 2 ? 'Nothing matches that filter.' :
    searchError ? searchError :
    'No results -- try a different search or cuisine.'

  return (
    <div className="modal-scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal meal-picker" role="dialog" aria-modal="true" aria-label={`Pick a ${course === 'main' ? 'meal' : info.one} for ${dayName}`}>
        <button type="button" className="btn btn-ghost modal-close" onClick={onClose} aria-label="Close">&#x2715;</button>
        <h2 className="picker-heading">Pick a {course === 'main' ? 'meal' : info.one} for {dayName}</h2>

        {course !== 'main' && (
          <form className="picker-quick" onSubmit={addQuick}>
            <p className="overline">Just type it</p>
            <div className="picker-quick-row">
              <input
                className="input"
                placeholder={course === 'side' ? 'garlic bread, steamed rice…' : 'ice cream, cookies…'}
                value={quickName}
                onChange={(e) => setQuickName(e.target.value)}
                aria-label={`Name of the ${info.one}`}
                autoFocus
              />
              <button type="submit" className="btn btn-primary" disabled={!quickName.trim()}>
                Add
              </button>
            </div>
            <input
              className="input picker-quick-ings"
              placeholder="What to buy for it (optional, comma separated)"
              value={quickIngredients}
              onChange={(e) => setQuickIngredients(e.target.value)}
              aria-label="Ingredients to buy, comma separated"
            />
            <p className="overline picker-quick-or">Or pick a recipe</p>
          </form>
        )}

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

        {tab === FIND ? (
          <form className="picker-search" onSubmit={handleSearch}>
            <input
              className="input"
              placeholder="Search for a recipe..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus={course === 'main'}
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
          {tab === FIND && searching ? (
            <p className="note picker-empty">Finding recipes...</p>
          ) : recipes.length === 0 ? (
            <p className="note picker-empty">{emptyMessage}</p>
          ) : (
            <>
              {recipes.map((recipe) => (
                <RecipeRow key={recipe.id} recipe={recipe} onPick={onPick} />
              ))}
              {tab === FIND && searchResults.length < totalResults && (
                <button
                  type="button"
                  className="btn btn-ghost picker-load-more"
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                >
                  {loadingMore ? 'Loading...' : 'Load more'}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
