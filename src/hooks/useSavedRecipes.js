import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'

export function useSavedRecipes() {
  const { repo } = useAuth()
  const [saved, setSaved] = useState([])

  useEffect(() => {
    let alive = true
    repo.loadSavedRecipes().then((list) => alive && setSaved(list))
    return () => {
      alive = false
    }
  }, [repo])

  const isSaved = useCallback((id) => saved.some((r) => r.id === id), [saved])

  const toggleSave = useCallback(
    async (recipe) => {
      if (isSaved(recipe.id)) {
        setSaved((s) => s.filter((r) => r.id !== recipe.id))
        await repo.removeRecipe(recipe.id)
        return false
      }
      setSaved((s) => [...s, recipe])
      await repo.saveRecipe(recipe)
      return true
    },
    [repo, isSaved]
  )

  /** Replace a saved recipe in place (e.g. to file it under another course). */
  const updateSaved = useCallback(
    async (recipe) => {
      setSaved((s) => s.map((r) => (r.id === recipe.id ? recipe : r)))
      await repo.saveRecipe(recipe)
    },
    [repo]
  )

  return { saved, isSaved, toggleSave, updateSaved }
}
