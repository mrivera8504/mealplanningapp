import { useEffect, useRef, useState } from 'react'
import WeatherBadge from './WeatherBadge'
import CategoryGlyph from './CategoryGlyph'
import { moodForDay } from '../lib/weather'
import { fmtShort, isToday } from '../lib/dates'
import { MAX_SIDES } from '../lib/courses'

/**
 * One day of the weekly spread -- a section of the printed menu card.
 * Supports drag & drop between days plus a tap-based "Move to…" fallback.
 * The Swap/Suggest menus offer: any idea, a pick for that night's weather,
 * personal recipes, browsing, or a takeout suggestion. Weather is always
 * shown but only shapes a pick when "For this weather" is chosen.
 * Under the dinner sit its sides (up to three) and a dessert: each can be
 * suggested, picked or typed, swapped for another idea, or removed. They
 * travel with the dinner when the night is moved.
 */

/** Small dropdown that closes on outside click / Escape. */
function Menu({ label, className, children, disabled }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const onDown = (e) => {
      if (!ref.current?.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="move-wrap" ref={ref}>
      <button
        type="button"
        className={className || 'btn btn-ghost btn-sm'}
        aria-expanded={open}
        aria-haspopup="menu"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
      >
        {label}
      </button>
      {open && (
        <div className="move-menu" role="menu" onClick={() => setOpen(false)}>
          {children}
        </div>
      )}
    </div>
  )
}

/** One line of extras under the dinner: the night's sides, or its dessert. */
function ExtraRow({ label, one, items, canAdd, onSuggest, onPick, onSwap, onRemove, onView }) {
  return (
    <div className="extra-row">
      <span className="overline extra-label">{label}</span>
      <ul className="extra-list">
        {items.map((item) => (
          <li key={item.id} className="extra-item">
            {item.quick ? (
              <span className="extra-title">{item.title}</span>
            ) : (
              <button type="button" className="link-quiet extra-title" onClick={() => onView(item)}>
                {item.title}
              </button>
            )}
            <button
              type="button"
              className="btn btn-ghost btn-sm extra-btn"
              onClick={() => onSwap(item)}
              aria-label={`Another ${one} instead of ${item.title}`}
              title={`Another ${one}`}
            >
              ↻
            </button>
            <button
              type="button"
              className="btn btn-danger-ghost btn-sm extra-btn"
              onClick={() => onRemove(item)}
              aria-label={`Remove ${item.title}`}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
      {canAdd && (
        <Menu label={`+ ${one} ▾`} className="btn btn-ghost btn-sm extra-add">
          <button type="button" role="menuitem" onClick={onSuggest}>
            Suggest a {one}
          </button>
          <button type="button" role="menuitem" onClick={onPick}>
            Pick or type one
          </button>
        </Menu>
      )}
    </div>
  )
}

export default function DayCard({
  day, // { name, iso }
  weatherDay,
  meal,
  busyEvents,
  otherDays, // [{name, iso}] -- targets for the Move menu
  hasMine, // whether any personal recipes exist
  unit,
  onSuggest,
  onWeatherPick,
  onSuggestMine,
  onTakeout,
  onSwap,
  onRemove,
  onView,
  onPickRecipe,
  onMoveMeal, // (fromIso, toIso)
  pendingSave, // recipe awaiting a save/dismiss decision, if it came from the house collection
  onSaveRecipe,
  onDismissSave,
  sides = [],
  dessert = null,
  onSuggestExtra, // (course, replacing?)
  onPickExtra, // (course)
  onRemoveExtra, // (course, dish)
  onViewDish, // (dish)
}) {
  const [dragOver, setDragOver] = useState(false)
  const mood = moodForDay(weatherDay)
  const today = isToday(day.iso)
  const showSavePrompt = pendingSave && meal?.id === pendingSave.id

  const handleDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    const fromIso = e.dataTransfer.getData('text/wfd-day')
    if (fromIso && fromIso !== day.iso) onMoveMeal(fromIso, day.iso)
  }

  const sourceItems = (
    <>
      <button type="button" role="menuitem" onClick={meal ? onSwap : onSuggest}>
        {meal ? 'Another idea' : 'Suggest a meal'}
      </button>
      <button type="button" role="menuitem" onClick={onWeatherPick} disabled={!mood} title={mood ? undefined : 'No forecast for this night yet'}>
        For this weather
      </button>
      <button type="button" role="menuitem" onClick={onSuggestMine} disabled={!hasMine} title={hasMine ? undefined : 'Add recipes under Recipes → My recipes'}>
        Surprise me (my recipes)
      </button>
      <button type="button" role="menuitem" onClick={onPickRecipe}>
        Browse and pick
      </button>
      <button type="button" role="menuitem" onClick={onTakeout}>
        Takeout…
      </button>
    </>
  )

  return (
    <section
      className={`day-card${today ? ' day-card-today' : ''}${dragOver ? ' day-card-dragover' : ''}`}
      aria-label={`${day.name} ${fmtShort(day.iso)}`}
      onDragOver={(e) => {
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      <header className="day-card-head">
        <div>
          <h3 className="day-card-name">{today ? 'Tonight' : day.name}</h3>
          <p className="day-card-date mono">{fmtShort(day.iso)}</p>
        </div>
        <WeatherBadge day={weatherDay} mood={mood} unit={unit} />
      </header>

      {mood && (
        <p className="day-card-mood note">
          {meal?.pickedFor === 'weather' && meal.weatherNote ? `Picked for ${meal.weatherNote}` : mood.sky.label}
        </p>
      )}

      {busyEvents?.length > 0 && (
        <p className="day-card-busy" title={busyEvents.join(' · ')}>
          <span aria-hidden="true">◆</span> Booked: {busyEvents[0]}
          {busyEvents.length > 1 ? ` +${busyEvents.length - 1}` : ''}
        </p>
      )}

      {meal ? (
        <div
          className="meal-slot"
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData('text/wfd-day', day.iso)
            e.dataTransfer.effectAllowed = 'move'
          }}
        >
          <span className={`meal-slot-glyph${meal.takeout ? ' meal-slot-glyph-takeout' : ''}`} aria-hidden="true">
            <CategoryGlyph category={meal.categories?.[0] || 'stew'} size={26} />
          </span>
          {meal.takeout ? (
            <span className="meal-slot-title">{meal.title}</span>
          ) : (
            <button type="button" className="link-quiet meal-slot-title" onClick={onView}>
              {meal.title}
            </button>
          )}
          {meal.takeout ? (
            <span className="mono meal-slot-time">night off</span>
          ) : (
            meal.readyInMinutes && <span className="mono meal-slot-time">{meal.readyInMinutes} min</span>
          )}
          <div className="meal-slot-actions">
            <Menu label="↻ Swap ▾">{sourceItems}</Menu>
            <Menu label="Move ▾">
              {(otherDays || []).map((d) => (
                <button
                  key={d.iso}
                  type="button"
                  role="menuitem"
                  onClick={() => onMoveMeal(day.iso, d.iso)}
                >
                  to {d.name}
                </button>
              ))}
            </Menu>
            <button type="button" className="btn btn-danger-ghost btn-sm" onClick={onRemove} aria-label={`Remove ${meal.title} from ${day.name}`}>
              ✕
            </button>
          </div>
          {showSavePrompt && (
            <div className="day-card-save-prompt">
              <p className="note">
                {pendingSave.isDiscovery ? 'A new idea for you -- not in your saved recipes.' : 'Not in your saved recipes.'}
              </p>
              <div className="day-card-save-actions">
                <button type="button" className="btn btn-basil btn-sm" onClick={onSaveRecipe}>
                  Save to my recipes
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={onDismissSave} title="Never suggest this recipe again">
                  Don't suggest again
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="meal-slot meal-slot-empty">
          <p className="meal-slot-invite note">
            Nothing planned yet.
          </p>
          <div className="meal-slot-actions">
            <Menu label="Suggest ▾" className="btn btn-sm btn-primary">{sourceItems}</Menu>
            <button type="button" className="btn btn-sm btn-secondary" onClick={onPickRecipe}>
              Pick a recipe
            </button>
          </div>
        </div>
      )}
      {(meal || sides.length > 0 || dessert) && (
        <div className="day-extras">
          {!meal?.takeout && (
            <ExtraRow
              label="Sides"
              one="side"
              items={sides}
              canAdd={sides.length < MAX_SIDES}
              onSuggest={() => onSuggestExtra('side')}
              onPick={() => onPickExtra('side')}
              onSwap={(item) => onSuggestExtra('side', item)}
              onRemove={(item) => onRemoveExtra('side', item)}
              onView={onViewDish}
            />
          )}
          <ExtraRow
            label="Dessert"
            one="dessert"
            items={dessert ? [dessert] : []}
            canAdd={!dessert}
            onSuggest={() => onSuggestExtra('dessert')}
            onPick={() => onPickExtra('dessert')}
            onSwap={(item) => onSuggestExtra('dessert', item)}
            onRemove={(item) => onRemoveExtra('dessert', item)}
            onView={onViewDish}
          />
        </div>
      )}
    </section>
  )
}
