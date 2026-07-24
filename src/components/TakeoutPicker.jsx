import { useEffect, useMemo, useRef, useState } from 'react'
import { takeoutDeck, takeoutMeal } from '../lib/takeout'

/**
 * Takeout suggester: one idea at a time — take it or pass.
 * Weather-matched ideas come up first (ramen on a rainy night, poke in a heat wave).
 */
export default function TakeoutPicker({ dayName, moodKey, onAccept, onClose }) {
  const deck = useMemo(() => takeoutDeck(moodKey), [moodKey])
  const [index, setIndex] = useState(0)
  const acceptRef = useRef(null)

  useEffect(() => {
    acceptRef.current?.focus()
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const idea = deck[index % deck.length]
  const wrapped = index >= deck.length

  return (
    <div className="modal-scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal takeout-picker" role="dialog" aria-modal="true" aria-label="Takeout suggestion">
        <button type="button" className="btn btn-ghost modal-close" onClick={onClose} aria-label="Close">
          ✕
        </button>
        <p className="overline">Night off · {dayName}</p>
        <h2 className="takeout-title">{idea.title}?</h2>
        <p className="note takeout-blurb">{idea.blurb}</p>
        {wrapped && <p className="muted">That’s the whole menu — going around again.</p>}
        <div className="takeout-actions">
          <button
            ref={acceptRef}
            type="button"
            className="btn btn-primary"
            onClick={() => onAccept(takeoutMeal(idea))}
          >
            That’s dinner
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => setIndex((i) => i + 1)}>
            Pass — next idea
          </button>
        </div>
      </div>
    </div>
  )
}
