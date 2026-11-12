import { useEffect, useRef, useState } from 'react'
import { useSettings } from '../context/SettingsContext'
import { describePinterestError, loadBoard, pinDestination } from '../lib/pinterest'
import { extractRecipeFromUrl } from '../lib/spoonacular'

/**
 * Bring recipes in from a public Pinterest board. Paste the board's link
 * once (it's remembered); pins show as a grid, and Import reads the recipe
 * from the site the pin links to, then opens it in the recipe editor to check
 * before saving. Pins already imported are marked.
 */
export default function PinterestImport({ onImport, onClose }) {
  const { settings, update } = useSettings()
  const [boardUrl, setBoardUrl] = useState(settings.pinterestBoard || '')
  const [board, setBoard] = useState(null) // { board, pins }
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState({}) // pin id -> 'working' | error message
  const imported = new Set(settings.pinterestImported || [])
  const inputRef = useRef(null)

  const load = async (url = boardUrl) => {
    if (!url.trim()) return
    setLoading(true)
    setError(null)
    try {
      const data = await loadBoard(url.trim())
      setBoard(data)
      if (url.trim() !== settings.pinterestBoard) update({ pinterestBoard: url.trim() })
    } catch (err) {
      setError(describePinterestError(err.code))
      setBoard(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    if (settings.pinterestBoard) load(settings.pinterestBoard)
    else inputRef.current?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const importPin = async (pin) => {
    setBusy((b) => ({ ...b, [pin.id]: 'working' }))
    try {
      const link = await pinDestination(pin)
      if (!link) throw new Error("This pin doesn't link to a recipe site.")
      let recipe
      try {
        recipe = await extractRecipeFromUrl(link)
      } catch (err) {
        throw new Error(
          err.code === 'quota_exceeded'
            ? "This site doesn't share its recipe in a readable form, and today's Spoonacular quota is used up. Try again tomorrow."
            : "Couldn't read a recipe from that site."
        )
      }
      if (!recipe?.ingredients?.length) throw new Error("Couldn't find a recipe on that site.")
      setBusy((b) => {
        const next = { ...b }
        delete next[pin.id]
        return next
      })
      onImport({ ...recipe, image: recipe.image || pin.image, sourceUrl: recipe.sourceUrl || link }, pin)
    } catch (err) {
      setBusy((b) => ({ ...b, [pin.id]: err.message }))
    }
  }

  return (
    <div className="modal-scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal pinterest-import" role="dialog" aria-modal="true" aria-label="Import from Pinterest">
        <button type="button" className="btn btn-ghost modal-close" onClick={onClose} aria-label="Close">
          ✕
        </button>
        <h2>Import from Pinterest</h2>
        <p className="muted">Paste the link to one of your public boards. The app shows its 50 newest pins.</p>

        <form
          className="pinterest-board-form"
          onSubmit={(e) => {
            e.preventDefault()
            load()
          }}
        >
          <input
            ref={inputRef}
            className="input"
            type="url"
            placeholder="https://www.pinterest.com/you/dinner-ideas/"
            value={boardUrl}
            onChange={(e) => setBoardUrl(e.target.value)}
            aria-label="Pinterest board link"
          />
          <button type="submit" className="btn btn-primary" disabled={loading || !boardUrl.trim()}>
            {loading ? 'Loading…' : board ? 'Refresh' : 'Load board'}
          </button>
        </form>

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        {board && (
          <>
            <p className="pinterest-board-name">
              <strong>{board.board}</strong> <span className="muted">· {board.pins.length} pins</span>
            </p>
            <ul className="pin-grid">
              {board.pins.map((pin) => {
                const state = busy[pin.id]
                const done = imported.has(pin.id)
                return (
                  <li key={pin.id} className="pin-card">
                    <a href={pin.pinUrl} target="_blank" rel="noreferrer" className="pin-image" aria-label={`Open on Pinterest: ${pin.title}`}>
                      {pin.image ? <img src={pin.image} alt="" loading="lazy" /> : <span className="pin-noimage" />}
                    </a>
                    <p className="pin-title" title={pin.title}>
                      {pin.title}
                    </p>
                    {state && state !== 'working' && <p className="pin-error">{state}</p>}
                    <button
                      type="button"
                      className={`btn btn-sm ${done ? 'btn-secondary' : 'btn-soft'}`}
                      onClick={() => importPin(pin)}
                      disabled={state === 'working'}
                    >
                      {state === 'working' ? 'Reading recipe…' : done ? 'Imported · again' : 'Import'}
                    </button>
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}
