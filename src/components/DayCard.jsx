import { useState } from 'react'
import WeatherBadge from './WeatherBadge'
import CategoryGlyph from './CategoryGlyph'
import { moodForDay } from '../lib/weather'
import { fmtShort, isToday } from '../lib/dates'

/**
 * One day of the weekly spread — a section of the printed menu card.
 * Supports drag & drop between days plus a tap-based "Move to…" fallback.
 */

const INVITES = {
  soup: 'Sounds like soup tonight.',
  braise: 'A night for the Dutch oven.',
  grill: 'Take dinner outside tonight.',
  'no-oven': 'Too hot to turn the oven on.',
  cozy: 'A stay-in, oven-on kind of night.',
  open: 'Fair skies — anything goes.',
}
export default function DayCard({
  day, // { name, iso }
  weatherDay,
  meal,
  busyEvents,
  otherDays, // [{name, iso}] — targets for the Move menu
  unit,
  onSuggest,
  onSwap,
  onRemove,
  onView,
  onBrowse,
  onMoveMeal, // (fromIso, toIso)
}) {
  const [dragOver, setDragOver] = useState(false)
  const [moveOpen, setMoveOpen] = useState(false)
  const mood = moodForDay(weatherDay)
  const today = isToday(day.iso)

  const handleDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    const fromIso = e.dataTransfer.getData('text/wfd-day')
    if (fromIso && fromIso !== day.iso) onMoveMeal(fromIso, day.iso)
  }

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

      {mood && <p className="day-card-mood note">{mood.note}</p>}

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
          <span className="meal-slot-glyph" aria-hidden="true">
            <CategoryGlyph category={meal.categories?.[0] || 'stew'} size={26} />
          </span>
          <button type="button" className="link-quiet meal-slot-title" onClick={onView}>
            {meal.title}
          </button>
          {meal.readyInMinutes && <span className="mono meal-slot-time">{meal.readyInMinutes} min</span>}
          <div className="meal-slot-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={onSwap} title="Suggest something else">
              ↻ Swap
            </button>
            <div className="move-wrap">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                aria-expanded={moveOpen}
                onClick={() => setMoveOpen((v) => !v)}
              >
                Move ▾
              </button>
              {moveOpen && (
                <div className="move-menu" role="menu">
                  {(otherDays || []).map((d) => (
                    <button
                      key={d.iso}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMoveOpen(false)
                        onMoveMeal(day.iso, d.iso)
                      }}
                    >
                      to {d.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button type="button" className="btn btn-danger-ghost btn-sm" onClick={onRemove} aria-label={`Remove ${meal.title} from ${day.name}`}>
              ✕
            </button>
          </div>
        </div>
      ) : (
        <div className="meal-slot meal-slot-empty">
          <p className="meal-slot-invite note">
            {mood ? INVITES[mood.key] : 'Nothing planned yet.'}
          </p>
          <div className="meal-slot-actions">
            <button type="button" className="btn btn-sm btn-primary" onClick={onSuggest}>
              Suggest a meal
            </button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={onBrowse}>
              Browse
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
