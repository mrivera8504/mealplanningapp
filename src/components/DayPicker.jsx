import { useEffect, useRef } from 'react'
import { fmtShort } from '../lib/dates'

/** "Add to which night?" — shown after choosing Add to plan on a recipe. */
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
            const existing = plan?.days?.[d.iso]?.dinner
            return (
              <li key={d.iso}>
                <button
                  ref={i === 0 ? firstBtn : undefined}
                  type="button"
                  className="day-picker-option"
                  onClick={() => onPick(d.iso)}
                >
                  <span className="day-picker-day">{d.name}</span>
                  <span className="mono day-picker-date">{fmtShort(d.iso)}</span>
                  <span className="day-picker-current muted">
                    {existing ? `replaces ${existing.title}` : 'open'}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
