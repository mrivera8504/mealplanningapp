import { useEffect, useRef, useState } from 'react'
import CategoryGlyph from './CategoryGlyph'
import { CATEGORY_LABELS } from '../lib/houseRecipes'
import { getRecipeDetail } from '../lib/spoonacular'

/**
 * Full-recipe modal. Spoonacular search results arrive without complete
 * steps/nutrition, so this lazily fetches the full record on open.
 */
export default function RecipeDetail({ recipe, saved, onClose, onToggleSave, onAddToDay }) {
  const [full, setFull] = useState(recipe)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const closeRef = useRef(null)

  useEffect(() => {
    setFull(recipe)
    if (recipe?.spoonacularId && (!recipe.steps?.length || !recipe.nutrition)) {
      setLoadingDetail(true)
      getRecipeDetail(recipe.spoonacularId)
        .then((d) => setFull((prev) => ({ ...prev, ...d })))
        .catch(() => {})
        .finally(() => setLoadingDetail(false))
    }
  }, [recipe])

  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!recipe) return null

  return (
    <div className="modal-scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal recipe-detail" role="dialog" aria-modal="true" aria-label={recipe.title}>
        <header className="recipe-detail-head">
          {full.image ? (
            <img className="recipe-detail-img" src={full.image} alt="" />
          ) : (
            <div className="recipe-detail-img recipe-detail-img-glyph">
              <CategoryGlyph category={full.categories?.[0] || 'stew'} size={64} />
            </div>
          )}
          <div className="recipe-detail-title">
            <h2>{full.title}</h2>
            <p className="mono recipe-card-meta">
              {full.readyInMinutes ? `${full.readyInMinutes} min` : ''}
              {full.servings ? ` · serves ${full.servings}` : ''}
              {full.cuisine ? ` · ${full.cuisine}` : ''}
            </p>
            <div className="chip-row">
              {(full.categories || []).map((c) => (
                <span key={c} className="chip">{CATEGORY_LABELS[c] || c}</span>
              ))}
              {(full.diets || []).slice(0, 3).map((d) => (
                <span key={d} className="chip chip-diet">{d}</span>
              ))}
            </div>
          </div>
          <button ref={closeRef} type="button" className="btn btn-ghost modal-close" onClick={onClose} aria-label="Close recipe">
            ✕
          </button>
        </header>

        {full.summary && <p className="recipe-detail-summary note">{full.summary}</p>}

        <div className="recipe-detail-cols">
          <section aria-label="Ingredients">
            <h3 className="overline">Ingredients</h3>
            <ul className="ingredient-list">
              {(full.ingredients || []).map((ing, i) => (
                <li key={i}>
                  <span className="mono ingredient-qty">
                    {ing.amount != null ? `${Math.round(ing.amount * 100) / 100} ${ing.unit || ''}`.trim() : ''}
                  </span>
                  <span>{ing.name}</span>
                </li>
              ))}
            </ul>
          </section>
          <section aria-label="Steps">
            <h3 className="overline">Method</h3>
            {loadingDetail && !full.steps?.length ? (
              <p className="muted">Fetching the full recipe…</p>
            ) : (
              <ol className="step-list">
                {(full.steps || []).map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
            )}
          </section>
        </div>

        {full.nutrition && (
          <div className="nutrition-row mono" aria-label="Nutrition per serving">
            <span>{full.nutrition.calories} cal</span>
            <span>{full.nutrition.protein} protein</span>
            <span>{full.nutrition.carbs} carbs</span>
            <span>{full.nutrition.fat} fat</span>
          </div>
        )}

        <footer className="recipe-detail-actions">
          <button
            type="button"
            className={`btn ${saved ? 'btn-basil' : 'btn-secondary'}`}
            onClick={onToggleSave}
            aria-pressed={saved}
          >
            {saved ? 'Saved ✓' : 'Save recipe'}
          </button>
          {onAddToDay && (
            <button type="button" className="btn btn-primary" onClick={onAddToDay}>
              Add to plan
            </button>
          )}
          {full.sourceUrl && (
            <a className="btn btn-ghost" href={full.sourceUrl} target="_blank" rel="noreferrer">
              Source ↗
            </a>
          )}
        </footer>
      </div>
    </div>
  )
}
