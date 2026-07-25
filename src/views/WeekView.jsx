import { useMemo, useState } from 'react'
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
import { addDays, fmtWeekRange, fromISODate, toISODate, weekDates, weekIdFor } from '../lib/dates'
import MealPicker from '../components/MealPicker'
import { buildPool, suggestForDay, loadRecentIds, recordRecentId } from '../lib/suggestions'
import { moodForDay } from '../lib/weather'
import { calendarConfigured, fetchBusyNights, getAccessToken, pushWeekToCalendar } from '../lib/calendar'

export default function WeekView({ onOpenSettings }) {
  const navigate = useNavigate()
  const toast = useToast()
  const { settings } = useSettings()
  const [weekId, setWeekId] = useState(() => {
    const today = new Date()
    const dayOfWeek = (today.getDay() + 6) % 7 // 0 = Mon … 6 = Sun
    // Thursday or later: most of this week is gone, default to next week
    return dayOfWeek >= 3 ? weekIdFor(addDays(today, 7)) : weekIdFor(today)
  })
  const { plan, loading, setMeal, removeMeal, moveMeal, save } = usePlan(weekId)
  const { saved, isSaved, toggleSave } = useSavedRecipes()
  const { mine } = useMyRecipes()
  const { forecast, status: weatherStatus, location, unit } = useWeather()
  const [viewing, setViewing] = useState(null)
  const [busyNights, setBusyNights] = useState(null)
  const [syncing, setSyncing] = useState(false)
  const [takeoutFor, setTakeoutFor] = useState(null) // {iso, name}
  const [pickerFor, setPickerFor] = useState(null)   // {iso, name}

  const days = useMemo(() => weekDates(weekId), [weekId])
  const pool = useMemo(() => buildPool(saved, mine), [saved, mine])
  const thisWeekId = weekIdFor(new Date())

  const plannedIds = () =>
    new Set(days.map((d) => plan.days[d.iso]?.dinner?.id).filter(Boolean))

  const pickMeal = (iso, recipe) => {
    setMeal(iso, recipe)
    recordRecentId(recipe.id)
  }

  const suggestFor = (iso, fromPool = pool) => {
    const result = suggestForDay(forecast?.[iso], fromPool, plannedIds(), loadRecentIds())
    if (!result) return
    pickMeal(iso, result.recipe)
  }

  const swapFor = (iso, fromPool = pool) => {
    const current = plan.days[iso]?.dinner
    const exclude = plannedIds()
    if (current) exclude.add(current.id)
    const result = suggestForDay(forecast?.[iso], fromPool, exclude, loadRecentIds())
    if (result) pickMeal(iso, result.recipe)
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
    const recentIds = loadRecentIds()
    let added = 0
    for (const d of days) {
      if (plan.days[d.iso]?.dinner) continue
      // If the pool runs dry (small recipe books), allow repeats.
      const result =
        suggestForDay(forecast?.[d.iso], fromPool, exclude, recentIds) ||
        suggestForDay(forecast?.[d.iso], fromPool, new Set(), recentIds) ||
        suggestForDay(forecast?.[d.iso], fromPool, new Set())
      if (result) {
        pickMeal(d.iso, result.recipe)
        exclude.add(result.recipe.id)
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
      const busy = await fetchBusyNights(token, weekId, days.map((d) => d.iso))
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
        weekId,
        days.map((d) => ({ iso: d.iso, meal: plan.days[d.iso]?.dinner })),
        { dinnerTime: settings.dinnerTime }
      )
      toast(written ? `Plan saved -- ${written} dinner${written > 1 ? 's' : ''} on your calendar.` : 'Nothing planned yet to sync.')
      const busy = await fetchBusyNights(token, weekId, days.map((d) => d.iso))
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
    setWeekId(weekIdFor(addDays(fromISODate(weekId), delta * 7)))
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
            <h2 className="week-range">{fmtWeekRange(weekId)}</h2>
            {weekId !== thisWeekId && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setWeekId(thisWeekId)}>
                Back to this week
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
            onRemove={() => removeMeal(d.iso)}
            onView={() => setViewing(plan.days[d.iso]?.dinner)}
            onPickRecipe={() => setPickerFor({ iso: d.iso, name: d.name })}
            onMoveMeal={moveMeal}
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
