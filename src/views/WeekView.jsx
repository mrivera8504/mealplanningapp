import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import DayCard from '../components/DayCard'
import RecipeDetail from '../components/RecipeDetail'
import TakeoutPicker from '../components/TakeoutPicker'
import { usePlan } from '../hooks/usePlan'
import { useSavedRecipes } from '../hooks/useSavedRecipes'
import { useMyRecipes } from '../hooks/useMyRecipes'
import { useWeather } from '../hooks/useWeather'
import { useToast } from '../context/ToastContext'
import { useSettings } from '../context/SettingsContext'
import { useRotation } from '../context/RotationContext'
import { useLibrary } from '../hooks/useLibrary'
import { addDays, fmtWeekRange, fromISODate, toISODate, weekDates } from '../lib/dates'
import MealPicker from '../components/MealPicker'
import { buildPool, plannedNights, servedDates, styleOf, suggestForDay } from '../lib/suggestions'
import { describeRefillError } from '../lib/library'
import { moodForDay } from '../lib/weather'
import { calendarConfigured, fetchBusyNights, getAccessToken, pushWeekToCalendar } from '../lib/calendar'

// The failed-refill warning shows once per session, not on every visit to this view.
let warnedRefill = false

export default function WeekView({ onOpenSettings }) {
  const navigate = useNavigate()
  const toast = useToast()
  const { settings } = useSettings()
  const [startIso, setStartIso] = useState(() => toISODate(new Date()))
  const { plan, loading, setMeal, removeMeal, moveMeal, save } = usePlan()
  const { saved, isSaved, toggleSave } = useSavedRecipes()
  const { mine } = useMyRecipes()
  const { forecast, status: weatherStatus, location, unit } = useWeather()
  const [viewing, setViewing] = useState(null)
  const [busyNights, setBusyNights] = useState(null)
  const [syncing, setSyncing] = useState(false)
  const [takeoutFor, setTakeoutFor] = useState(null) // {iso, name}
  const [pickerFor, setPickerFor] = useState(null)   // {iso, name}
  const [pendingSaves, setPendingSaves] = useState({}) // iso -> recipe not yet saved/dismissed
  // { nights } left empty because the recipe book has nothing that's rested two weeks.
  const [shortfall, setShortfall] = useState(null)
  const { prefs, setPref } = useRotation()
  const newIdeasPerWeek = settings.newIdeasPerWeek ?? 2
  const library = useLibrary(newIdeasPerWeek > 0, { ready: !loading, saved, mine, prefs, plan })
  // iso -> ids swapped away from that night this session, so "Another idea"
  // walks forward through the options instead of bouncing between two.
  const swappedAway = useRef({})

  const days = useMemo(() => weekDates(startIso), [startIso])
  const pool = useMemo(() => buildPool(saved, mine, library.recipes), [saved, mine, library.recipes])
  const history = useMemo(() => servedDates(plan), [plan])
  const nights = useMemo(() => plannedNights(plan), [plan])
  const todayIso = toISODate(new Date())

  // Say so, once per session, when the weekly top-up of new ideas is failing --
  // otherwise the same outside recipes quietly come around forever.
  const refillError = library.status?.lastError
  useEffect(() => {
    if (!refillError || warnedRefill) return
    warnedRefill = true
    toast(`New recipe ideas couldn't be refreshed: ${describeRefillError(refillError)}. Details are in Settings.`, 'warn')
  }, [refillError, toast])

  const plannedIds = () =>
    new Set(days.map((d) => plan.days[d.iso]?.dinner?.id).filter(Boolean))

  const discoveryCount = () => days.filter((d) => plan.days[d.iso]?.dinner?.isDiscovery).length

  /** Drop library recipes from `fromPool` once this week has its share of new ideas. */
  const capDiscovery = (fromPool, alreadyThisWeek = discoveryCount()) =>
    alreadyThisWeek >= newIdeasPerWeek ? fromPool.filter((r) => !r.isDiscovery) : fromPool

  const suggest = (iso, fromPool, exclude, opts = {}) =>
    suggestForDay(forecast?.[iso], iso, fromPool, { exclude, history, nights, prefs, ...opts })

  /**
   * Put a recipe on a night. `mood` is passed only for a weather pick, and is
   * remembered on the meal so the card can say why it was chosen.
   */
  const pickMeal = (iso, recipe, mood = null) => {
    const { pickedFor: _for, weatherNote: _note, ...clean } = recipe
    setMeal(iso, mood ? { ...clean, pickedFor: 'weather', weatherNote: mood.note } : clean)
    setPendingSaves((p) => {
      if (!recipe.isHouseRecipe && !recipe.isDiscovery) {
        if (!(iso in p)) return p
        const next = { ...p }
        delete next[iso]
        return next
      }
      return { ...p, [iso]: recipe }
    })
  }

  const saveHouseRecipe = async (iso) => {
    const recipe = pendingSaves[iso]
    if (!recipe) return
    if (!isSaved(recipe.id)) await toggleSave(recipe)
    setPendingSaves((p) => {
      const next = { ...p }
      delete next[iso]
      return next
    })
    toast(`${recipe.title} saved to your recipes.`)
  }

  const clearPendingSave = (iso) => {
    setPendingSaves((p) => {
      if (!(iso in p)) return p
      const next = { ...p }
      delete next[iso]
      return next
    })
  }

  // "Dismiss" means never suggest this recipe again -- not just clear tonight's
  // banner. Record it in the synced rotation prefs, then replace tonight's
  // pick (prefs won't re-render in time for this call, so exclude it directly).
  const dismissHouseRecipe = (iso) => {
    const recipe = pendingSaves[iso]
    clearPendingSave(iso)
    if (!recipe) return

    setPref(recipe.id, { dismissed: true }).catch(() => {})
    if (recipe.isDiscovery) library.remove(recipe.id)

    const exclude = plannedIds()
    exclude.add(recipe.id)
    const result = suggest(iso, capDiscovery(pool, discoveryCount() - (recipe.isDiscovery ? 1 : 0)), exclude)
    if (result) {
      pickMeal(iso, result.recipe)
    } else {
      removeMeal(iso)
      toast('No other recipes fit that night -- pick one manually or add more of your own.', 'warn')
    }
  }

  const removeMealAt = (iso) => {
    removeMeal(iso)
    clearPendingSave(iso)
  }

  const moveMealAt = (fromIso, toIso) => {
    moveMeal(fromIso, toIso)
    setPendingSaves((p) => {
      if (!(fromIso in p) && !(toIso in p)) return p
      const next = { ...p }
      delete next[fromIso]
      delete next[toIso]
      if (p[fromIso]) next[toIso] = p[fromIso]
      if (p[toIso]) next[fromIso] = p[toIso]
      return next
    })
  }

  /**
   * Suggest a dinner for one night, replacing whatever is there. The meal
   * being replaced is remembered as passed over (synced, for two weeks) so it
   * doesn't come straight back -- on this night or any other. `weather` lets
   * the forecast shape the pick; without it weather plays no part.
   */
  const swapFor = (iso, fromPool = pool, { weather = false } = {}) => {
    const current = plan.days[iso]?.dinner
    const skipped = (swappedAway.current[iso] ||= new Set())
    if (current) {
      skipped.add(current.id)
      if (!current.takeout) setPref(current.id, { passedOn: todayIso }).catch(() => {})
    }
    // The night's own library pick doesn't count against the weekly share when swapping it out.
    const candidates = capDiscovery(fromPool, discoveryCount() - (current?.isDiscovery ? 1 : 0))
    const opts = { useWeather: weather }
    let result = suggest(iso, candidates, new Set([...plannedIds(), ...skipped]), opts)
    if (!result && skipped.size > 1) {
      // Every option has been passed over -- start the cycle again.
      swappedAway.current[iso] = new Set(current ? [current.id] : [])
      result = suggest(iso, candidates, new Set([...plannedIds(), ...swappedAway.current[iso]]), opts)
    }
    if (result) pickMeal(iso, result.recipe, weather ? result.mood : null)
    else toast('No other ideas for that night -- check snoozed recipes or add more of your own.', 'warn')
  }

  const suggestMineFor = (iso) => {
    if (!mine.length) {
      toast('Your recipe book is empty -- add one under Recipes → My recipes.', 'warn')
      return
    }
    swapFor(iso, mine)
  }

  /**
   * Fill every empty night from `fromPool`. Returns { added, left }.
   * weather: let each night's forecast shape its pick.
   * restedOnly: leave a night empty rather than repeat something from the
   *   last two weeks (the caller then offers what to do about those nights).
   */
  const fillWeek = (fromPool, label, { weather = false, restedOnly = false } = {}) => {
    const exclude = plannedIds()
    let newIdeas = discoveryCount()
    let added = 0
    let left = 0
    // Picks made in this loop aren't in the plan state yet; track them here so
    // freshness and variety see them.
    const fillHistory = new Map([...history].map(([id, dates]) => [id, [...dates]]))
    const fillNights = new Map(nights)
    for (const d of days) {
      if (plan.days[d.iso]?.dinner) continue
      const candidates = capDiscovery(fromPool, newIdeas)
      const opts = { history: fillHistory, nights: fillNights, useWeather: weather, restedOnly }
      // If the pool runs dry (small recipe books), allow repeats within the
      // week -- freshness scoring still keeps them spread apart.
      const result =
        suggest(d.iso, candidates, exclude, opts) || (restedOnly ? null : suggest(d.iso, candidates, new Set(), opts))
      if (!result) {
        left += 1
        continue
      }
      const { recipe } = result
      pickMeal(d.iso, recipe, weather ? result.mood : null)
      exclude.add(recipe.id)
      fillHistory.set(recipe.id, [...(fillHistory.get(recipe.id) || []), d.iso])
      fillNights.set(d.iso, { id: recipe.id, cuisine: recipe.cuisine || null, style: styleOf(recipe) })
      if (recipe.isDiscovery) newIdeas += 1
      added += 1
    }
    if (added > 0) toast(`Planned ${added} night${added > 1 ? 's' : ''}${label}.`)
    return { added, left }
  }

  const planWholeWeek = () => {
    setShortfall(null)
    const { added } = fillWeek(pool, '')
    if (added === 0) toast('No empty nights to fill -- clear a night first.')
  }

  const planWeekForWeather = () => {
    setShortfall(null)
    if (!forecast) {
      toast('No forecast yet -- set your location in Settings first.', 'warn')
      return
    }
    const { added } = fillWeek(pool, ' around the forecast', { weather: true })
    if (added === 0) toast('No empty nights to fill -- clear a night first.')
  }

  // A small recipe book can't fill week after week without repeating: 14
  // recipes over 7 nights is a two-week loop. So fill what can be filled with
  // dinners that have rested, and ask about the rest instead of repeating quietly.
  const planWeekFromMine = () => {
    if (!mine.length) {
      toast('Your recipe book is empty -- add one under Recipes → My recipes.', 'warn')
      return
    }
    const { added, left } = fillWeek(mine, ' from your recipe book', { restedOnly: true })
    setShortfall(left > 0 ? { nights: left } : null)
    if (added === 0 && left === 0) toast('No empty nights to fill -- clear a night first.')
  }

  const fillShortfall = (fromPool, label) => {
    setShortfall(null)
    fillWeek(fromPool, label)
  }

  const savePlan = async () => {
    try {
      await save()
      toast('Plan saved.')
    } catch {
      toast('Could not save the plan -- try again.', 'warn')
    }
  }

  const checkCalendar = async () => {
    try {
      const token = await getAccessToken()
      const busy = await fetchBusyNights(token, startIso, days.map((d) => d.iso), settings.calendarId)
      setBusyNights(busy)
      const count = Object.keys(busy).length
      toast(count ? `${count} evening${count > 1 ? 's' : ''} already have plans.` : 'All evenings are free.')
    } catch (err) {
      if (err.message !== 'popup_closed') toast('Could not read your calendar.', 'warn')
    }
  }

  const syncToCalendar = async () => {
    setSyncing(true)
    try {
      const token = await getAccessToken()
      await save()
      const written = await pushWeekToCalendar(
        token,
        startIso,
        days.map((d) => ({ iso: d.iso, meal: plan.days[d.iso]?.dinner })),
        { dinnerTime: settings.dinnerTime, calendarId: settings.calendarId }
      )
      toast(written ? `Plan saved -- ${written} dinner${written > 1 ? 's' : ''} on your calendar.` : 'Nothing planned yet to sync.')
      const busy = await fetchBusyNights(token, startIso, days.map((d) => d.iso), settings.calendarId)
      setBusyNights(busy)
    } catch (err) {
      console.error('Calendar sync error:', err)
      const msg = err?.message || ''
      if (msg === 'popup_closed') { /* user cancelled */ }
      else if (msg.includes('403') || msg.includes('forbidden')) toast('Calendar access denied -- make sure the Google Calendar API is enabled in your Google Cloud project.', 'warn')
      else if (msg.includes('401') || msg === 'calendar_auth_expired') toast('Calendar session expired -- try again.', 'warn')
      else toast(`Calendar sync failed: ${msg || 'unknown error'}`, 'warn')
    } finally {
      setSyncing(false)
    }
  }

  const shiftWeek = (delta) => {
    setBusyNights(null)
    setShortfall(null)
    setStartIso(toISODate(addDays(fromISODate(startIso), delta * 7)))
  }

  const hasAnyMeal = days.some((d) => plan.days[d.iso]?.dinner)

  return (
    <div className="week-view">
      <div className="week-toolbar">
        <div className="week-nav">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => shiftWeek(-1)} aria-label="Previous week">
            ←
          </button>
          <div className="week-heading">
            <h2 className="week-range">{fmtWeekRange(startIso)}</h2>
            {startIso !== todayIso && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setStartIso(todayIso)}>
                Back to today
              </button>
            )}
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => shiftWeek(1)} aria-label="Next week">
            →
          </button>
        </div>

        <p className="week-weather-note note">
          {weatherStatus === 'ready'
            ? `Forecast for ${location?.name || 'the demo week'}. It only shapes the menu when you ask it to.`
            : weatherStatus === 'locating' || weatherStatus === 'loading'
              ? 'Reading the sky…'
              : (
                <>
                  No forecast yet --{' '}
                  <button type="button" className="link-inline" onClick={onOpenSettings}>
                    set your location
                  </button>{' '}
                  to see the weather for each night.
                </>
              )}
        </p>

        <div className="week-actions">
          <button type="button" className="btn btn-secondary" onClick={planWholeWeek}>
            Fill empty nights
          </button>
          <button type="button" className="btn btn-secondary" onClick={planWeekForWeather} title="Fills empty nights with dinners that suit each night's forecast">
            Fill for the weather
          </button>
          <button type="button" className="btn btn-secondary" onClick={planWeekFromMine} title="Only suggests from your own recipe book">
            Fill from my recipes
          </button>
          <button type="button" className="btn btn-primary" onClick={savePlan} disabled={loading}>
            Save plan
          </button>
          {calendarConfigured && (
            <>
              <button type="button" className="btn btn-basil" onClick={syncToCalendar} disabled={syncing || !hasAnyMeal}>
                {syncing ? 'Syncing…' : 'Sync to Calendar'}
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={checkCalendar}>
                Check busy nights
              </button>
            </>
          )}
        </div>
      </div>

      {shortfall && (
        <div className="week-notice" role="status">
          <p className="note">
            Your recipe book has {mine.length} recipe{mine.length === 1 ? '' : 's'}, and everything else in it was on the
            plan in the last two weeks. {shortfall.nights} night{shortfall.nights > 1 ? 's are' : ' is'} still empty.
          </p>
          <div className="week-notice-actions">
            <button type="button" className="btn btn-basil btn-sm" onClick={() => fillShortfall(pool, '')}>
              Fill from all my lists
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => fillShortfall(mine, ' from your recipe book')}>
              Repeat from my recipes
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShortfall(null)}>
              Leave empty
            </button>
          </div>
        </div>
      )}

      <div className="week-grid">
        {days.map((d) => (
          <DayCard
            key={d.iso}
            day={d}
            weatherDay={forecast?.[d.iso]}
            meal={plan.days[d.iso]?.dinner || null}
            busyEvents={busyNights?.[d.iso]}
            otherDays={days.filter((x) => x.iso !== d.iso)}
            hasMine={mine.length > 0}
            unit={unit}
            onSuggest={() => swapFor(d.iso)}
            onWeatherPick={() => swapFor(d.iso, pool, { weather: true })}
            onSuggestMine={() => suggestMineFor(d.iso)}
            onTakeout={() => setTakeoutFor({ iso: d.iso, name: d.name })}
            onSwap={() => swapFor(d.iso)}
            onRemove={() => removeMealAt(d.iso)}
            onView={() => setViewing(plan.days[d.iso]?.dinner)}
            onPickRecipe={() => setPickerFor({ iso: d.iso, name: d.name })}
            onMoveMeal={moveMealAt}
            pendingSave={pendingSaves[d.iso]}
            onSaveRecipe={() => saveHouseRecipe(d.iso)}
            onDismissSave={() => dismissHouseRecipe(d.iso)}
          />
        ))}
      </div>

      {!hasAnyMeal && !loading && (
        <div className="week-empty">
          <p className="note week-empty-line">A blank week is a good week -- let's fill it.</p>
          <p className="muted">
            Tap <strong>Suggest</strong> on any night, or fill the whole spread at once.
          </p>
          <div className="week-actions">
            <button type="button" className="btn btn-primary" onClick={planWholeWeek}>
              Fill my week
            </button>
            <button type="button" className="btn btn-secondary" onClick={planWeekForWeather}>
              Fill for the weather
            </button>
          </div>
        </div>
      )}

      {pickerFor && (
        <MealPicker
          dayName={pickerFor.name}
          mine={mine}
          saved={saved}
          onPick={(recipe) => {
            pickMeal(pickerFor.iso, recipe)
            setPickerFor(null)
          }}
          onClose={() => setPickerFor(null)}
        />
      )}

      {takeoutFor && (
        <TakeoutPicker
          dayName={takeoutFor.name}
          moodKey={moodForDay(forecast?.[takeoutFor.iso])?.key}
          onAccept={(meal) => {
            setMeal(takeoutFor.iso, meal)
            toast(`${meal.title} it is -- ${takeoutFor.name} is a night off.`)
            setTakeoutFor(null)
          }}
          onClose={() => setTakeoutFor(null)}
        />
      )}

      {viewing && (
        <RecipeDetail
          recipe={viewing}
          saved={isSaved(viewing.id)}
          onClose={() => setViewing(null)}
          onToggleSave={async () => {
            const nowSaved = await toggleSave(viewing)
            toast(nowSaved ? 'Recipe saved.' : 'Recipe removed from saved.')
          }}
        />
      )}
    </div>
  )
}
