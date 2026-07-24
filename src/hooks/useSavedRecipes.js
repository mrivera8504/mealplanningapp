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

  return { saved, isSaved, toggleSave }
}
