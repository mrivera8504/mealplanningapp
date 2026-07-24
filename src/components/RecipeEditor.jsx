import { useEffect, useRef, useState } from 'react'
import { CATEGORY_LABELS } from '../lib/houseRecipes'
import { uploadRecipeImage } from '../lib/storage'

const EMPTY_ING = { amount: '', unit: '', name: '' }

/**
 * Create or edit a personal recipe. Ingredients are structured rows so the
 * grocery list can merge quantities; steps are one per line.
 */
export default function RecipeEditor({ recipe, onSave, onClose, user }) {
  const editing = Boolean(recipe)
  const [title, setTitle] = useState(recipe?.title || '')
  const [minutes, setMinutes] = useState(recipe?.readyInMinutes || '')
  const [servings, setServings] = useState(recipe?.servings || '')
  const [cuisine, setCuisine] = useState(recipe?.cuisine || '')
  const [categories, setCategories] = useState(recipe?.categories || [])
  const [ingredients, setIngredients] = useState(
    recipe?.ingredients?.length
      ? recipe.ingredients.map((i) => ({ amount: i.amount ?? '', unit: i.unit || '', name: i.name || '' }))
      : [{ ...EMPTY_ING }, { ...EMPTY_ING }, { ...EMPTY_ING }]
  )
  const [stepsText, setStepsText] = useState((recipe?.steps || []).join('\n'))
  const [imageFile, setImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState(recipe?.image || null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(null)
  const firstField = useRef(null)

  useEffect(() => {
    firstField.current?.focus()
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const toggleCategory = (cat) =>
    setCategories((c) => (c.includes(cat) ? c.filter((x) => x !== cat) : [...c, cat]))

  const setIng = (i, field, value) =>
    setIngredients((list) => list.map((row, idx) => (idx === i ? { ...row, [field]: value } : row)))

  const handleImageChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
  }

  const submit = async (e) => {
    e.preventDefault()
    const cleanIngredients = ingredients
      .filter((row) => row.name.trim())
      .map((row) => ({
        name: row.name.trim(),
        amount: row.amount === ‘’ ? null : Number(row.amount),
        unit: row.unit.trim(),
      }))
    if (!title.trim()) {
      setError(‘Give it a name — even “Dad’s Tuesday pasta” works.’)
      return
    }
    if (!cleanIngredients.length) {
      setError(‘Add at least one ingredient so the grocery list can do its job.’)
      return
    }

    const recipeId = recipe?.id || `mine-${Date.now()}`
    let imageUrl = recipe?.image || null

    if (imageFile && user) {
      setUploading(true)
      try {
        imageUrl = await uploadRecipeImage(user.uid, recipeId, imageFile)
      } catch {
        setError(‘Photo upload failed — recipe was saved without it.’)
      } finally {
        setUploading(false)
      }
    }

    onSave({
      id: recipeId,
      mine: true,
      title: title.trim(),
      image: imageUrl,
      categories,
      cuisine: cuisine.trim() || null,
      diets: recipe?.diets || [],
      readyInMinutes: minutes === ‘’ ? null : Number(minutes),
      servings: servings === ‘’ ? null : Number(servings),
      summary: recipe?.summary || ‘’,
      sourceUrl: null,
      ingredients: cleanIngredients,
      steps: stepsText.split(‘\n’).map((s) => s.trim()).filter(Boolean),
      nutrition: recipe?.nutrition || null,
    })
  }

  return (
    <div className="modal-scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal recipe-editor" role="dialog" aria-modal="true" aria-label={editing ? 'Edit recipe' : 'Add a recipe'}>
        <button type="button" className="btn btn-ghost modal-close" onClick={onClose} aria-label="Close">
          ✕
        </button>
        <h2>{editing ? 'Edit recipe' : 'Add to your recipe book'}</h2>

        <form onSubmit={submit} className="editor-form">
          <div className="field">
            <label htmlFor="re-title">Name</label>
            <input
              id="re-title"
              ref={firstField}
              className="input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Grandma’s arroz con pollo"
            />
          </div>

          {user && (
            <div className="field editor-image-field">
              <label className="editor-image-label">
                {imagePreview ? (
                  <img src={imagePreview} alt="Recipe preview" className="editor-image-preview" />
                ) : (
                  <div className="editor-image-placeholder">
                    <span>Add a photo</span>
                  </div>
                )}
                <input type="file" accept="image/*" className="editor-image-input" onChange={handleImageChange} />
              </label>
              {imagePreview && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm editor-image-remove"
                  onClick={() => { setImageFile(null); setImagePreview(null) }}
                >
                  Remove photo
                </button>
              )}
            </div>
          )}

          <div className="editor-row">
            <div className="field">
              <label htmlFor="re-min">Minutes</label>
              <input id="re-min" className="input mono" type="number" min="1" value={minutes} onChange={(e) => setMinutes(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="re-serves">Serves</label>
              <input id="re-serves" className="input mono" type="number" min="1" value={servings} onChange={(e) => setServings(e.target.value)} />
            </div>
            <div className="field editor-cuisine">
              <label htmlFor="re-cuisine">Cuisine</label>
              <input id="re-cuisine" className="input" value={cuisine} onChange={(e) => setCuisine(e.target.value)} placeholder="optional" />
            </div>
          </div>

          <fieldset className="field editor-cats">
            <legend>Good for (helps weather suggestions)</legend>
            <div className="chip-row">
              {Object.entries(CATEGORY_LABELS).map(([cat, label]) => (
                <button
                  key={cat}
                  type="button"
                  className={`chip chip-toggle${categories.includes(cat) ? ' chip-on' : ''}`}
                  aria-pressed={categories.includes(cat)}
                  onClick={() => toggleCategory(cat)}
                >
                  {label}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="field">
            <legend>Ingredients</legend>
            <div className="editor-ings">
              {ingredients.map((row, i) => (
                <div key={i} className="editor-ing-row">
                  <input
                    className="input mono editor-ing-amt"
                    inputMode="decimal"
                    placeholder="2"
                    aria-label={`Amount ${i + 1}`}
                    value={row.amount}
                    onChange={(e) => setIng(i, 'amount', e.target.value)}
                  />
                  <input
                    className="input mono editor-ing-unit"
                    placeholder="cups"
                    aria-label={`Unit ${i + 1}`}
                    value={row.unit}
                    onChange={(e) => setIng(i, 'unit', e.target.value)}
                  />
                  <input
                    className="input editor-ing-name"
                    placeholder="ingredient"
                    aria-label={`Ingredient ${i + 1}`}
                    value={row.name}
                    onChange={(e) => setIng(i, 'name', e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn btn-danger-ghost btn-sm"
                    onClick={() => setIngredients((list) => list.filter((_, idx) => idx !== i))}
                    aria-label={`Remove ingredient ${i + 1}`}
                    disabled={ingredients.length <= 1}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-sm editor-add-ing"
              onClick={() => setIngredients((list) => [...list, { ...EMPTY_ING }])}
            >
              + Add ingredient
            </button>
          </fieldset>

          <div className="field">
            <label htmlFor="re-steps">Method (one step per line)</label>
            <textarea
              id="re-steps"
              className="input editor-steps"
              rows={5}
              value={stepsText}
              onChange={(e) => setStepsText(e.target.value)}
              placeholder={'Brown the chicken.\nAdd rice and stock.\nSimmer 20 minutes.'}
            />
          </div>

          {error && <p className="form-error" role="alert">{error}</p>}

          <div className="editor-actions">
            <button type="submit" className="btn btn-primary" disabled={uploading}>
              {uploading ? 'Uploading photo…' : editing ? 'Save changes' : 'Save recipe'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
