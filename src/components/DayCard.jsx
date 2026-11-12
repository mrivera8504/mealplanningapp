import { useState } from 'react'
import WeatherBadge from './WeatherBadge'
import CategoryGlyph from './CategoryGlyph'
import Icon from './Icon'
import Menu, { MenuDivider, MenuItem, MenuLabel } from './Menu'
import { moodForDay } from '../lib/weather'
import { fromISODate, isToday } from '../lib/dates'
import { MAX_SIDES } from '../lib/courses'

const SHORT_DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

/** The picture for a dish: its photo when it has one, otherwise its category icon on a tile. */
function DishTile({ dish, size = 48 }) {
  return (
    <span className={`dish-tile${dish?.takeout ? ' dish-tile-takeout' : ''}`} style={{ width: size, height: size }} aria-hidden="true">
      {dish?.image ? <img src={dish.image} alt="" loading="lazy" /> : <CategoryGlyph category={dish?.categories?.[0] || 'stew'} size={Math.round(size * 0.46)} />}
    </span>
  )
}

/** A side or dessert under the dinner: a chip that opens its own small menu. */
function ExtraChip({ dish, kind, onView, onSwap, onRemove }) {
  return (
    <Menu
      label={`${kind}: ${dish.title}`}
      menuLabel={dish.title}
      buttonClass="extra-chip"
      buttonContent={
        <>
          <span className="extra-chip-kind">{kind}</span>
          <span className="extra-chip-name">{dish.title}</span>
        </>
      }
    >
      {!dish.quick && (
        <MenuItem icon="eye" onSelect={() => onView(dish)}>
          View recipe
        </MenuItem>
      )}
      <MenuItem icon="refresh" onSelect={() => onSwap(dish)}>
        Another {kind.toLowerCase()}
      </MenuItem>
      <MenuItem icon="trash" danger onSelect={() => onRemove(dish)}>
        Remove
      </MenuItem>
    </Menu>
  )
}

/**
 * One night of the week, as a row: the date, the dinner, its sides and
 * dessert, the weather, and one menu with everything you can do to the
 * night. On a phone the row becomes a card.
 *
 * The dinner can be dragged onto another night; "Move to another night"
 * in the menu does the same without dragging. Weather always shows, but
 * only shapes a pick from "Pick for the weather".
 */
export default function DayCard({
  day, // { name, iso }
  weatherDay,
  meal,
  busyEvents,
  otherDays, // [{name, iso}] -- targets for moving
  hasMine,
  unit,
  onSuggest,
  onWeatherPick,
  onSuggestMine,
  onTakeout,
  onRemove,
  onView,
  onPickRecipe,
  onMoveMeal, // (fromIso, toIso)
  pendingSave,
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
  const [moving, setMoving] = useState(false)
  const mood = moodForDay(weatherDay)
  const today = isToday(day.iso)
  const date = fromISODate(day.iso)
  const showSavePrompt = pendingSave && meal?.id === pendingSave.id
  const canAddSide = meal && !meal.takeout && sides.length < MAX_SIDES
  const canAddDessert = !dessert && (meal || sides.length > 0)
  const hasNight = meal || sides.length > 0 || dessert

  const handleDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    const fromIso = e.dataTransfer.getData('text/wfd-day')
    if (fromIso && fromIso !== day.iso) onMoveMeal(fromIso, day.iso)
  }

  const nightMenu = (
    <Menu label={`Options for ${day.name}`} icon="more" iconOnly align="end" buttonClass="btn btn-ghost btn-icon" onOpenChange={(open) => !open && setMoving(false)}>
      {moving ? (
        <>
          <MenuItem icon="chevronLeft" keepOpen onSelect={() => setMoving(false)}>
            Back
          </MenuItem>
          <MenuDivider />
          <MenuLabel>Swap with</MenuLabel>
          {(otherDays || []).map((d) => (
            <MenuItem key={d.iso} onSelect={() => onMoveMeal(day.iso, d.iso)}>
              {d.name}
            </MenuItem>
          ))}
        </>
      ) : (
        <>
          <MenuLabel>Dinner</MenuLabel>
          <MenuItem icon="refresh" onSelect={onSuggest}>
            {meal ? 'Another idea' : 'Suggest a dinner'}
          </MenuItem>
          <MenuItem icon="cloud" onSelect={onWeatherPick} disabled={!mood}>
            Pick for the weather
          </MenuItem>
          <MenuItem icon="book" onSelect={onSuggestMine} disabled={!hasMine}>
            From my recipes
          </MenuItem>
          <MenuItem icon="search" onSelect={onPickRecipe}>
            Choose a recipe…
          </MenuItem>
          <MenuItem icon="bag" onSelect={onTakeout}>
            Takeout night…
          </MenuItem>
          {(canAddSide || canAddDessert) && <MenuDivider />}
          {canAddSide && (
            <MenuItem icon="plus" onSelect={() => onSuggestExtra('side')}>
              Suggest a side
            </MenuItem>
          )}
          {canAddDessert && (
            <MenuItem icon="plus" onSelect={() => onSuggestExtra('dessert')}>
              Suggest a dessert
            </MenuItem>
          )}
          {hasNight && (
            <>
              <MenuDivider />
              <MenuItem icon="move" keepOpen trailing={<Icon name="chevronRight" size={14} />} onSelect={() => setMoving(true)}>
                Move to another night
              </MenuItem>
              {meal && (
                <MenuItem icon="trash" danger onSelect={onRemove}>
                  Clear dinner
                </MenuItem>
              )}
            </>
          )}
        </>
      )}
    </Menu>
  )

  return (
    <section
      className={`day-row${today ? ' day-row-today' : ''}${dragOver ? ' day-row-dragover' : ''}`}
      aria-label={`${day.name}, ${date.toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}`}
      onDragOver={(e) => {
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      <div className="day-row-date">
        <span className="day-row-dow">{SHORT_DAYS[date.getDay()]}</span>
        <span className="day-row-num">{date.getDate()}</span>
        {today && <span className="pill pill-primary">Tonight</span>}
      </div>

      <div className="day-row-dinner">
        {meal ? (
          <div
            className="dinner"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData('text/wfd-day', day.iso)
              e.dataTransfer.effectAllowed = 'move'
            }}
          >
            <DishTile dish={meal} />
            <div className="dinner-text">
              {meal.takeout ? (
                <span className="dinner-title">{meal.title}</span>
              ) : (
                <button type="button" className="link-quiet dinner-title" onClick={onView}>
                  {meal.title}
                </button>
              )}
              <span className="dinner-meta">
                {meal.takeout
                  ? 'Night off'
                  : [meal.readyInMinutes && `${meal.readyInMinutes} min`, meal.cuisine].filter(Boolean).join(' · ') || 'Dinner'}
                {meal.pickedFor === 'weather' && meal.weatherNote && <> · picked for {meal.weatherNote}</>}
              </span>
              {busyEvents?.length > 0 && (
                <span className="pill pill-warn" title={busyEvents.join(' · ')}>
                  <Icon name="clock" size={12} strokeWidth={2.2} />
                  {busyEvents[0]}
                  {busyEvents.length > 1 ? ` +${busyEvents.length - 1}` : ''}
                </span>
              )}
              {showSavePrompt && (
                <span className="save-prompt">
                  {pendingSave.isDiscovery ? 'New idea, not in your recipes.' : 'Not in your recipes.'}
                  <button type="button" className="link-inline" onClick={onSaveRecipe}>
                    Save it
                  </button>
                  <button type="button" className="link-inline link-muted" onClick={onDismissSave} title="Never suggest this recipe again">
                    Don't suggest again
                  </button>
                </span>
              )}
            </div>
          </div>
        ) : (
          <div className="dinner dinner-empty">
            <span className="dish-tile dish-tile-empty" aria-hidden="true" />
            <div className="dinner-text">
              <span className="dinner-meta">Nothing planned yet</span>
              <div className="dinner-empty-actions">
                <button type="button" className="btn btn-soft btn-sm" onClick={onSuggest}>
                  Suggest
                </button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={onPickRecipe}>
                  Choose a recipe
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="day-row-extras">
        {sides.map((s) => (
          <ExtraChip
            key={s.id}
            dish={s}
            kind="Side"
            onView={onViewDish}
            onSwap={(d) => onSuggestExtra('side', d)}
            onRemove={(d) => onRemoveExtra('side', d)}
          />
        ))}
        {dessert && (
          <ExtraChip
            dish={dessert}
            kind="Dessert"
            onView={onViewDish}
            onSwap={(d) => onSuggestExtra('dessert', d)}
            onRemove={(d) => onRemoveExtra('dessert', d)}
          />
        )}
        {(canAddSide || canAddDessert) && (
          <Menu label="+ Add" buttonClass="extra-add" menuLabel={`Add to ${day.name}`} buttonContent="+ Add">
            {canAddSide && (
              <>
                <MenuLabel>Side</MenuLabel>
                <MenuItem icon="sparkle" onSelect={() => onSuggestExtra('side')}>
                  Suggest a side
                </MenuItem>
                <MenuItem icon="search" onSelect={() => onPickExtra('side')}>
                  Choose or type one…
                </MenuItem>
              </>
            )}
            {canAddSide && canAddDessert && <MenuDivider />}
            {canAddDessert && (
              <>
                <MenuLabel>Dessert</MenuLabel>
                <MenuItem icon="sparkle" onSelect={() => onSuggestExtra('dessert')}>
                  Suggest a dessert
                </MenuItem>
                <MenuItem icon="search" onSelect={() => onPickExtra('dessert')}>
                  Choose or type one…
                </MenuItem>
              </>
            )}
          </Menu>
        )}
      </div>

      <div className="day-row-weather">
        <WeatherBadge day={weatherDay} mood={mood} unit={unit} />
      </div>

      <div className="day-row-menu">{nightMenu}</div>
    </section>
  )
}
