import { useEffect, useMemo, useState } from 'react'
import RecipeCard from '../components/RecipeCard'
import RecipeDetail from '../components/RecipeDetail'
import RecipeEditor from '../components/RecipeEditor'
import DayPicker from '../components/DayPicker'
import { useSavedRecipes } from '../hooks/useSavedRecipes'
import { useMyRecipes } from '../hooks/useMyRecipes'
import { usePlan } from '../hooks/usePlan'
import { useToast } from '../context/ToastContext'
import { useAuth } from '../context/AuthContext'
import { HOUSE_RECIPES } from '../lib/houseRecipes'
import { searchRecipes } from '../lib/spoonacular'
import { toISODate, weekDates } from '../lib/dates'

const CUISINES = ['', 'American', 'Chinese', 'French', 'Greek', 'Indian', 'Italian', 'Japanese', 'Mediterranean', 'Mexican', 'Middle Eastern', 'Spanish', 'Thai', 'Vietnamese']
const DIETS = ['', 'vegetarian', 'vegan', 'gluten free', 'ketogenic', 'pescetarian']
const TYPES = ['', 'main course', 'soup', 'salad', 'side dish', 'dessert']

/** Local fallback search over the house collection when Spoonacular is unavailable. */
function searchHouse({ query, cuisine, diet, ingredients }) {
  const q = (query || '').toLowerCase()
  const ings = (ingredients || '').toLowerCase().split(',').map((s) => s.trim()).filter(Boolean)
  return HOUSE_RECIPES.filter((r) => {
    if (q && !r.title.toLowerCase().includes(q) && !r.categories.some((c) => c.includes(q))) return false
    if (cuisine && r.cuisine !== cuisine) return false
    if (diet && !r.diets.includes(diet.replace('pescetarian', 'pescatarian'))) return false
    if (ings.length && !ings.every((ing) => r.ingredients.some((ri) => ri.name.toLowerCase().includes(ing)))) return false
    return true
  })
}

export default function RecipesView() {
  const { user } = useAuth()
  const toast = useToast()
  const { saved, isSaved, toggleSave } = useSavedRecipes()
  const { mine, upsertMine, removeMine } = useMyRecipes()
  const startIso = toISODate(new Date()) // same rolling 7-day window as WeekView
  const { plan, setMeal } = usePlan()
  const days = useMemo(() => weekDates(startIso), [startIso])

  const [tab, setTab] = useState('find') // find | saved | house
  const [query, setQuery] = useState('')
  const [ingredients, setIngredients] = useState('')
  const [byIngredients, setByIngredients] = useState(false)
  const [cuisine, setCuisine] = useState('')
  const [diet, setDiet] = useState('')
  const [type, setType] = useState('')
  const [results, setResults] = useState(null)
  const [searching, setSearching] = useState(false)
  const [searchNote, setSearchNote] = useState(null)
  const [viewing, setViewing] = useState(null)
  const [placing, setPlacing] = useState(null) // recipe awaiting a day pick
  const [editing, setEditing] = useState(null) // null | 'new' | recipe

  useEffect(() => {
    document.title = "Recipes · What's for Dinner"
    return () => {
      document.title = "What's for Dinner"
    }
  }, [])

  const runSearch = async (e) => {
    e?.preventDefault()
    setSearching(true)
    setSearchNote(null)
    const params = {
      query: byIngredients ? '' : query,
      includeIngredients: byIngredients ? ingredients : '',
      cuisine,
      diet,
      type,
    }
    try {
      const found = await searchRecipes(params)
      setResults(found)
      if (!found.length) setSearchNote('empty')
    } catch (err) {
      const local = searchHouse({ query, cuisine, diet, ingredients: byIngredients ? ingredients : '' })
      setResults(local)
      setSearchNote(err.code === 'not_configured' ? 'house-only' : 'api-down')
    } finally {
      setSearching(false)
    }
  }

  const list = tab === 'saved' ? saved : tab === 'mine' ? mine : tab === 'house' ? HOUSE_RECIPES : results

  const handleToggleSave = async (recipe) => {
    const nowSaved = await toggleSave(recipe)
    toast(nowSaved ? 'Recipe saved.' : 'Recipe removed from saved.')
  }

  const placeOnDay = (iso) => {
    setMeal(iso, placing)
    const dayName = days.find((d) => d.iso === iso)?.name
    toast(`${placing.title} planned for ${dayName}.`)
    setPlacing(null)
    setViewing(null)
  }

  return (
    <div className="recipes-view">
      <div className="recipes-tabs" role="tablist" aria-label="Recipe collections">
        {[
          ['find', 'Find new'],
          ['saved', `Saved${saved.length ? ` (${saved.length})` : ''}`],
          ['mine', `My recipes${mine.length ? ` (${mine.length})` : ''}`],
          ['house', 'House collection'],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            className={`tab tab-sub${tab === key ? ' tab-active' : ''}`}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'find' && (
        <form className="search-panel" onSubmit={runSearch}>
          <div className="search-main">
            {byIngredients ? (
              <input
                className="input search-input"
                placeholder="What's in the fridge? e.g. chicken, lemon, spinach"
                value={ingredients}
                onChange={(e) => setIngredients(e.target.value)}
                aria-label="Search by ingredients, comma separated"
              />
            ) : (
              <input
                className="input search-input"
                placeholder="Search dinners — try “braised short ribs”"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search recipes"
              />
            )}
            <button type="submit" className="btn btn-primary" disabled={searching}>
              {searching ? 'Searching…' : 'Search'}
            </button>
          </div>
          <div className="search-filters">
            <label className="search-mode">
              <input
                type="checkbox"
                checked={byIngredients}
                onChange={(e) => setByIngredients(e.target.checked)}
              />
              use what I have
            </label>
            <select className="select" value={cuisine} onChange={(e) => setCuisine(e.target.value)} aria-label="Cuisine">
              {CUISINES.map((c) => (
                <option key={c} value={c}>{c || 'Any cuisine'}</option>
              ))}
            </select>
            <select className="select" value={diet} onChange={(e) => setDiet(e.target.value)} aria-label="Diet">
              {DIETS.map((d) => (
                <option key={d} value={d}>{d || 'Any diet'}</option>
              ))}
            </select>
            <select className="select" value={type} onChange={(e) => setType(e.target.value)} aria-label="Dish type">
              {TYPES.map((t) => (
                <option key={t} value={t}>{t || 'Any dish'}</option>
              ))}
            </select>
          </div>
        </form>
      )}

      {searchNote === 'house-only' && tab === 'find' && (
        <p className="banner banner-info">
          Recipe search is showing the house collection — add a Spoonacular key to search the wider world.
        </p>
      )}
      {searchNote === 'api-down' && tab === 'find' && (
        <p className="banner banner-info">Recipe search is resting; here are matches from the house collection.</p>
      )}

      {tab === 'mine' && (
        <div className="mine-toolbar">
          <button type="button" className="btn btn-primary" onClick={() => setEditing('new')}>
            Add a recipe
          </button>
        </div>
      )}

      {list === null && tab === 'find' ? (
        <div className="recipes-empty">
          <p className="note recipes-empty-line">What are you hungry for?</p>
          <p className="muted">Search by name, cuisine, or whatever needs using up in the fridge.</p>
        </div>
      ) : list.length === 0 ? (
        <div className="recipes-empty">
          <p className="note recipes-empty-line">
            {tab === 'saved'
              ? 'No saved recipes yet.'
              : tab === 'mine'
                ? 'Your recipe book is waiting for its first entry.'
                : 'Nothing matched that craving.'}
          </p>
          <p className="muted">
            {tab === 'saved'
              ? 'Tap Save on any recipe and it will live here, ready for meal plans.'
              : tab === 'mine'
                ? 'Add the dinners you actually make — then fill whole weeks with them from the planner.'
                : 'Loosen a filter or two and try again.'}
          </p>
          {tab === 'mine' && (
            <button type="button" className="btn btn-primary" onClick={() => setEditing('new')}>
              Write down a recipe
            </button>
          )}
        </div>
      ) : (
        <div className="recipes-grid">
          {list.map((r) => (
            <RecipeCard
              key={r.id}
              recipe={r}
              saved={isSaved(r.id)}
              onView={() => setViewing(r)}
              onToggleSave={r.mine ? undefined : () => handleToggleSave(r)}
              onEdit={r.mine ? () => setEditing(r) : undefined}
              onDelete={
                r.mine
                  ? () => {
                      removeMine(r.id)
                      toast(`${r.title} removed from your recipe book.`)
                    }
                  : undefined
              }
              onAddToDay={() => setPlacing(r)}
            />
          ))}
        </div>
      )}

      {viewing && (
        <RecipeDetail
          recipe={viewing}
          saved={isSaved(viewing.id)}
          onClose={() => setViewing(null)}
          onToggleSave={() => handleToggleSave(viewing)}
          onAddToDay={() => setPlacing(viewing)}
        />
      )}

      {placing && (
        <DayPicker
          recipe={placing}
          days={days}
          plan={plan}
          onPick={placeOnDay}
          onClose={() => setPlacing(null)}
        />
      )}

      {editing && (
        <RecipeEditor
          recipe={editing === 'new' ? null : editing}
          onSave={(recipe) => {
            upsertMine(recipe)
            toast(editing === 'new' ? `${recipe.title} added to your recipe book.` : 'Recipe updated.')
            setEditing(null)
          }}
          onClose={() => setEditing(null)}
          user={user}
        />
      )}
    </div>
  )
}
