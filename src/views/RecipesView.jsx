import { useEffect, useMemo, useRef, useState } from 'react'
import RecipeCard from '../components/RecipeCard'
import RecipeDetail from '../components/RecipeDetail'
import RecipeEditor from '../components/RecipeEditor'
import PinterestImport from '../components/PinterestImport'
import { useSettings } from '../context/SettingsContext'
import DayPicker from '../components/DayPicker'
import { useSavedRecipes } from '../hooks/useSavedRecipes'
import { useMyRecipes } from '../hooks/useMyRecipes'
import { usePlan } from '../hooks/usePlan'
import { useToast } from '../context/ToastContext'
import { useAuth } from '../context/AuthContext'
import { HOUSE_RECIPES } from '../lib/houseRecipes'
import { HOUSE_DESSERTS, HOUSE_SIDES } from '../lib/houseExtras'
import { COURSES, MAX_SIDES, courseInfo, courseOf, ofCourse } from '../lib/courses'
import { searchRecipes, RECIPE_PAGE_SIZE } from '../lib/spoonacular'
import { toISODate, weekDates } from '../lib/dates'

const CUISINES = ['', 'American', 'Chinese', 'French', 'Greek', 'Indian', 'Italian', 'Japanese', 'Mediterranean', 'Mexican', 'Middle Eastern', 'Spanish', 'Thai', 'Vietnamese']
const DIETS = ['', 'vegetarian', 'vegan', 'gluten free', 'ketogenic', 'pescetarian']
const TYPES = ['', 'main course', 'soup', 'salad'] // dish filter for mains; sides and desserts search their own type
const HOUSE = { main: HOUSE_RECIPES, side: HOUSE_SIDES, dessert: HOUSE_DESSERTS }

/** Local fallback search over the house collection when Spoonacular is unavailable. */
function searchHouse({ query, cuisine, diet, ingredients }, course = 'main') {
  const q = (query || '').toLowerCase()
  const ings = (ingredients || '').toLowerCase().split(',').map((s) => s.trim()).filter(Boolean)
  return HOUSE[course].filter((r) => {
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
  const { saved: allSaved, isSaved, toggleSave, updateSaved } = useSavedRecipes()
  const { mine: allMine, upsertMine, removeMine } = useMyRecipes()
  const startIso = toISODate(new Date()) // same rolling 7-day window as WeekView
  const { plan, setMeal, addSide, setDessert } = usePlan()
  const days = useMemo(() => weekDates(startIso), [startIso])

  const [course, setCourse] = useState('main') // main | side | dessert -- every list below shows one course
  const info = courseInfo(course)
  const saved = useMemo(() => ofCourse(allSaved, course), [allSaved, course])
  const mine = useMemo(() => ofCourse(allMine, course), [allMine, course])
  const [tab, setTab] = useState('find') // find | saved | mine | house
  const [query, setQuery] = useState('')
  const [ingredients, setIngredients] = useState('')
  const [byIngredients, setByIngredients] = useState(false)
  const [cuisine, setCuisine] = useState('')
  const [diet, setDiet] = useState('')
  const [type, setType] = useState('')
  const [results, setResults] = useState(null)
  const [totalResults, setTotalResults] = useState(0)
  const [offset, setOffset] = useState(0)
  const [searching, setSearching] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [searchNote, setSearchNote] = useState(null)
  const activeParamsRef = useRef(null)
  const activeCourseRef = useRef('main')
  const [viewing, setViewing] = useState(null)
  const [placing, setPlacing] = useState(null) // recipe awaiting a day pick
  const [editing, setEditing] = useState(null) // null | 'new' | recipe
  const [draft, setDraft] = useState(null) // { recipe, pin } imported from Pinterest, waiting in the editor
  const [pinterestOpen, setPinterestOpen] = useState(false)
  const { settings, update: updateSettings } = useSettings()

  useEffect(() => {
    document.title = "Recipes · What's for Dinner"
    return () => {
      document.title = "What's for Dinner"
    }
  }, [])

  const runSearch = async (e, nextOffset = 0) => {
    e?.preventDefault()
    let params
    if (nextOffset === 0) {
      params = {
        query: byIngredients ? '' : query,
        includeIngredients: byIngredients ? ingredients : '',
        cuisine,
        diet,
        type: course === 'main' ? type || 'main course' : info.spoonacularType,
      }
      activeCourseRef.current = course
      activeParamsRef.current = params
      setSearching(true)
    } else {
      params = { ...activeParamsRef.current, offset: nextOffset }
      setLoadingMore(true)
    }
    setSearchNote(null)
    try {
      const { recipes, totalResults: total } = await searchRecipes(params, activeCourseRef.current)
      setResults((prev) => (nextOffset ? [...(prev || []), ...recipes] : recipes))
      setTotalResults(total)
      setOffset(nextOffset)
      if (!nextOffset && !recipes.length) setSearchNote('empty')
    } catch (err) {
      if (nextOffset) {
        setSearchNote('api-down')
      } else {
        const local = searchHouse({ query, cuisine, diet, ingredients: byIngredients ? ingredients : '' }, course)
        setResults(local)
        setTotalResults(local.length)
        setSearchNote(err.code === 'not_configured' ? 'house-only' : 'api-down')
      }
    } finally {
      setSearching(false)
      setLoadingMore(false)
    }
  }

  const handleLoadMore = () => runSearch(null, offset + RECIPE_PAGE_SIZE)

  const list = tab === 'saved' ? saved : tab === 'mine' ? mine : tab === 'house' ? HOUSE[course] : results

  const switchCourse = (next) => {
    setCourse(next)
    setResults(null)
    setTotalResults(0)
    setSearchNote(null)
  }

  const handleToggleSave = async (recipe) => {
    const nowSaved = await toggleSave(recipe)
    toast(nowSaved ? 'Recipe saved.' : 'Recipe removed from saved.')
  }

  const placeOnDay = (iso) => {
    const dayName = days.find((d) => d.iso === iso)?.name
    const placingCourse = courseOf(placing)
    if (placingCourse === 'side') {
      if ((plan.days[iso]?.sides?.length || 0) >= MAX_SIDES) return
      addSide(iso, placing)
      toast(`${placing.title} added as a side for ${dayName}.`)
    } else if (placingCourse === 'dessert') {
      setDessert(iso, placing)
      toast(`${placing.title} is dessert for ${dayName}.`)
    } else {
      setMeal(iso, placing)
      toast(`${placing.title} planned for ${dayName}.`)
    }
    setPlacing(null)
    setViewing(null)
  }

  return (
    <div className="recipes-view">
      <div className="page-head">
        <div className="page-head-main">
          <h1 className="page-title">Recipes</h1>
          <p className="page-sub">Find new ideas, and keep the ones you make.</p>
        </div>
      </div>

      <div className="recipes-course">
        <div className="seg" role="radiogroup" aria-label="Course">
          {COURSES.map((c) => (
            <button
              key={c.value}
              type="button"
              role="radio"
              aria-checked={course === c.value}
              className={`seg-btn${course === c.value ? ' seg-btn-on' : ''}`}
              onClick={() => switchCourse(c.value)}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

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
                placeholder={course === 'main' ? 'Search dinners — try “braised short ribs”' : course === 'side' ? 'Search sides — try “roasted carrots”' : 'Search desserts — try “apple crisp”'}
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
            {course === 'main' && (
              <select className="select" value={type} onChange={(e) => setType(e.target.value)} aria-label="Dish type">
                {TYPES.map((t) => (
                  <option key={t} value={t}>{t || 'Any main'}</option>
                ))}
              </select>
            )}
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
          <button type="button" className="btn btn-secondary" onClick={() => setPinterestOpen(true)}>
            Import from Pinterest
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
              ? `No saved ${info.label.toLowerCase()} yet.`
              : tab === 'mine'
                ? course === 'main' ? 'Your recipe book is waiting for its first entry.' : `No ${info.label.toLowerCase()} in your recipe book yet.`
                : 'Nothing matched that craving.'}
          </p>
          <p className="muted">
            {tab === 'saved'
              ? 'Tap Save on any recipe and it will live here, ready for meal plans.'
              : tab === 'mine'
                ? course === 'main'
                  ? 'Add the dinners you actually make — then fill whole weeks with them from the planner.'
                  : `Add the ${info.label.toLowerCase()} you actually make, and the planner can suggest them alongside dinner.`
                : 'Loosen a filter or two and try again.'}
          </p>
          {tab === 'mine' && (
            <button type="button" className="btn btn-primary" onClick={() => setEditing('new')}>
              Write down a recipe
            </button>
          )}
        </div>
      ) : (
        <>
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
          {tab === 'find' && list.length < totalResults && (
            <div className="recipes-load-more">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleLoadMore}
                disabled={loadingMore}
              >
                {loadingMore ? 'Loading…' : 'Load more'}
              </button>
            </div>
          )}
        </>
      )}

      {viewing && (
        <RecipeDetail
          recipe={viewing}
          saved={isSaved(viewing.id)}
          onClose={() => setViewing(null)}
          onToggleSave={() => handleToggleSave(viewing)}
          onAddToDay={() => setPlacing(viewing)}
          onChangeCourse={
            isSaved(viewing.id) && !viewing.mine
              ? (next) => {
                  const moved = { ...allSaved.find((r) => r.id === viewing.id), course: next }
                  updateSaved(moved)
                  setViewing(moved)
                  toast(`Moved to ${courseInfo(next).label}.`)
                }
              : undefined
          }
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
          draft={editing === 'new' ? draft?.recipe : null}
          onSave={(recipe) => {
            upsertMine(recipe)
            toast(editing === 'new' ? `${recipe.title} added to your recipe book.` : 'Recipe updated.')
            if (draft?.pin) {
              const done = new Set(settings.pinterestImported || [])
              done.add(draft.pin.id)
              updateSettings({ pinterestImported: [...done] })
            }
            setEditing(null)
            setDraft(null)
          }}
          onClose={() => {
            setEditing(null)
            setDraft(null)
          }}
          user={user}
          defaultCourse={course}
        />
      )}

      {pinterestOpen && (
        <PinterestImport
          onClose={() => setPinterestOpen(false)}
          onImport={(recipe, pin) => {
            setPinterestOpen(false)
            setDraft({ recipe, pin })
            setEditing('new')
          }}
        />
      )}
    </div>
  )
}
