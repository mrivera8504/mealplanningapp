import CategoryGlyph from './CategoryGlyph'
import { CATEGORY_LABELS } from '../lib/houseRecipes'

export default function RecipeCard({ recipe, saved, onView, onToggleSave, onAddToDay, onEdit, onDelete }) {
  const primaryCat = recipe.categories?.[0] || 'stew'
  return (
    <article className="recipe-card">
      <button type="button" className="recipe-card-media" onClick={onView} aria-label={`View recipe: ${recipe.title}`}>
        {recipe.image ? (
          <img src={recipe.image} alt="" loading="lazy" />
        ) : (
          <span className="recipe-card-glyph">
            <CategoryGlyph category={primaryCat} size={44} />
          </span>
        )}
      </button>
      <div className="recipe-card-body">
        <h3 className="recipe-card-title">
          <button type="button" className="link-quiet" onClick={onView}>
            {recipe.title}
          </button>
        </h3>
        <p className="recipe-card-meta mono">
          {recipe.readyInMinutes ? `${recipe.readyInMinutes} min` : '— min'}
          {recipe.servings ? ` · serves ${recipe.servings}` : ''}
        </p>
        <div className="chip-row">
          {(recipe.categories || []).slice(0, 3).map((c) => (
            <span key={c} className="chip">{CATEGORY_LABELS[c] || c}</span>
          ))}
          {recipe.diets?.slice(0, 1).map((d) => (
            <span key={d} className="chip chip-diet">{d}</span>
          ))}
        </div>
      </div>
      <div className="recipe-card-actions">
        {onToggleSave && (
          <button
            type="button"
            className={`btn btn-sm ${saved ? 'btn-basil' : 'btn-secondary'}`}
            onClick={onToggleSave}
            aria-pressed={saved}
          >
            {saved ? 'Saved ✓' : 'Save'}
          </button>
        )}
        {onEdit && (
          <button type="button" className="btn btn-sm btn-secondary" onClick={onEdit}>
            Edit
          </button>
        )}
        {onAddToDay && (
          <button type="button" className="btn btn-sm btn-primary" onClick={onAddToDay}>
            Add to plan
          </button>
        )}
        {onDelete && (
          <button type="button" className="btn btn-danger-ghost btn-sm" onClick={onDelete} aria-label={`Delete ${recipe.title}`}>
            ✕
          </button>
        )}
      </div>
    </article>
  )
}
