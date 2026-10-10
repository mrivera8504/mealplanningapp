import { useMemo, useRef, useState } from 'react'
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
import { useDiscovery } from '../hooks/useDiscovery'
import { addDays, fmtWeekRange, fromISODate, toISODate, weekDates } from '../lib/dates'
import MealPicker from '../components/MealPicker'
import { buildPool, servedDates, suggestForDay } from '../lib/suggestions'
import { moodForDay } from '../lib/weather'
import { calendarConfigured, fetchBusyNights, getAccessToken, pushWeekToCalendar } from '../lib/calendar'

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
  const { prefs, setPref } = useRotation()
  const newIdeasPerWeek = settings.newIdeasPerWeek ?? 2
  const discovery = useDiscovery(newIdeasPerWeek > 0)
  // iso -> ids swapped away from that night this session, so "Another idea"
  // walks forward through the options instead of bouncing between two.
  const swappedAway = useRef({})

  const days = useMemo(() => weekDates(startIso), [startIso])
  const pool = useMemo(() => buildPool(saved, mine, discovery), [saved, mine, discovery])
  const history = useMemo(() => servedDates(plan), [plan])
  const todayIso = toISODate(new Date())

  const plannedIds = () =>
    new Set(days.map((d) => plan.days[d.iso]?.dinner?.id).filter(Boolean))

  const discoveryCount = () => days.filter((d) => plan.days[d.iso]?.dinner?.isDiscovery).length

  /** Drop discovery recipes from `fromPool` once this week has its share of new ideas. */
  const capDiscovery = (fromPool, alreadyThisWeek = discoveryCount()) =>
    alreadyThisWeek >= newIdeasPerWeek ? fromPool.filter((r) => !r.isDiscovery) : fromPool

  const suggest = (iso, fromPool, exclude, fromHistory = history) =>
    suggestForDay(forecast?.[iso], iso, fromPool, { exclude, history: fromHistory, prefs })

  const pickMeal = (iso, recipe) => {
    setMeal(iso, recipe)
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

  const suggestFor = (iso, fromPool = pool) => {
    const result = suggest(iso, capDiscovery(fromPool), plannedIds())
    if (result) pickMeal(iso, result.recipe)
    else toast('Nothing left to suggest for that night -- check snoozed recipes or add more of your own.', 'warn')
  }

  const swapFor = (iso, fromPool = pool) => {
    const current = plan.days[iso]?.dinner
    const skipped = (swappedAway.current[iso] ||= new Set())
    if (current) skipped.add(current.id)
    // The night's own discovery pick doesn't count against the weekly share when swapping it out.
    const candidates = capDiscovery(fromPool, discoveryCount() - (current?.isDiscovery ? 1 : 0))
    let result = suggest(iso, candidates, new Set([...plannedIds(), ...skipped]))
    if (!result && skipped.size > 1) {
      // Every option has been passed over -- start the cycle again.
      swappedAway.current[iso] = new Set(current ? [current.id] : [])
      result = suggest(iso, candidates, new Set([...plannedIds(), ...swappedAway.current[iso]]))
    }
    if (result) pickMeal(iso, result.recipe)
    else toast('No other ideas for that night -- check snoozed recipes or add more of your own.', 'warn')
  }

  const suggestMineFor = (iso) => {
    if (!mine.length) {
      toast('Your recipe book is empty -- add one under Recipes → My recipes.', 'warn')
      return
    }
    swapFor(iso, mine)
  }

  const fillWeek = (fromPool, label) => {
    const exclude = plannedIds()
    let newIdeas = discoveryCount()
    let added = 0
    // Picks made in this loop aren't in the plan state yet; track them here so
    // freshness sees them.
    const fillHistory = new Map([...history].map(([id, dates]) => [id, [...dates]]))
    for (const d of days) {
      if (plan.days[d.iso]?.dinner) continue
      const candidates = capDiscovery(fromPool, newIdeas)
      // If the pool runs dry (small recipe books), allow repeats within the
      // week -- freshness scoring still keeps them spread apart.
      const result =
        suggest(d.iso, candidates, exclude, fillHistory) || suggest(d.iso, candidates, new Set(), fillHistory)
      if (result) {
        pickMeal(d.iso, result.recipe)
        exclude.add(result.recipe.id)
        fillHistory.set(result.recipe.id, [...(fillHistory.get(result.recipe.id) || []), d.iso])
        if (result.recipe.isDiscovery) newIdeas += 1
        added += 1
      }
    }
    if (added > 0) toast(`Planned ${added} night${added > 1 ? 's' : ''} ${label}.`)
    return added
  }

  const planWholeWeek = () => fillWeek(pool, 'around the forecast')

  const planWeekFromMine = () => {
    if (!mine.length) {
      toast('Your recipe book is empty -- add one under Recipes → My recipes.', 'warn')
      return
    }
    const added = fillWeek(mine, 'from your recipe book')
    if (added === 0) toast('No empty nights to fill -- clear a night first.')
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
            ? `Forecast for ${location?.name || 'the demo week'} is setting tonight's menu.`
            : weatherStatus === 'locating' || weatherStatus === 'loading'
              ? 'Reading the sky…'
              : (
                <>
                  No forecast yet --{' '}
                  <button type="button" className="link-inline" onClick={onOpenSettings}>
                    set your location
                  </button>{' '}
                  and the weather will pick your menu.
                </>
              )}
        </p>

        <div className="week-actions">
          <button type="button" className="btn btn-secondary" onClick={planWholeWeek}>
            Fill empty nights
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
            onSuggest={() => suggestFor(d.iso)}
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
            Tap <strong>Suggest a meal</strong> on any night, or let the forecast plan the whole spread.
          </p>
          <button type="button" className="btn btn-primary" onClick={planWholeWeek}>
            Plan my week around the weather
          </button>
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
