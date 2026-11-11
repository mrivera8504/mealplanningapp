import { useEffect, useRef } from 'react'
import { fmtShort } from '../lib/dates'
import { MAX_SIDES, courseOf } from '../lib/courses'

/**
 * "Add to which night?" — shown after choosing Add to plan on a recipe. A
 * main replaces that night's dinner; a side or dessert is added alongside it.
 */
export default function DayPicker({ recipe, days, plan, onPick, onClose }) {
  const firstBtn = useRef(null)

  useEffect(() => {
    firstBtn.current?.focus()
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="modal-scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal day-picker" role="dialog" aria-modal="true" aria-label="Choose a night">
        <button type="button" className="btn btn-ghost modal-close" onClick={onClose} aria-label="Close">
          ✕
        </button>
        <h2 className="day-picker-title">Which night for {recipe.title}?</h2>
        <ul className="day-picker-list">
          {days.map((d, i) => {
            const day = plan?.days?.[d.iso]
            const course = courseOf(recipe)
            const dinner = day?.dinner
            let note
            let blocked = false
            if (course === 'main') {
              note = dinner ? `replaces ${dinner.title}` : 'open'
            } else if (course === 'side') {
              blocked = Boolean(dinner?.takeout) || (day?.sides?.length || 0) >= MAX_SIDES
              note = dinner?.takeout ? 'takeout night' : blocked ? 'sides are full' : dinner ? `with ${dinner.title}` : 'no dinner yet'
            } else {
              note = day?.dessert ? `replaces ${day.dessert.title}` : dinner ? `after ${dinner.title}` : 'no dinner yet'
            }
            return (
              <li key={d.iso}>
                <button
                  ref={i === 0 ? firstBtn : undefined}
                  type="button"
                  className="day-picker-option"
                  onClick={() => onPick(d.iso)}
                  disabled={blocked}
                >
                  <span className="day-picker-day">{d.name}</span>
                  <span className="mono day-picker-date">{fmtShort(d.iso)}</span>
                  <span className="day-picker-current muted">{note}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
