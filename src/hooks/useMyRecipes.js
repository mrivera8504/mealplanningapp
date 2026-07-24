import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'

/** The user's own recipe book: create, update, delete. */
export function useMyRecipes() {
  const { repo } = useAuth()
  const [mine, setMine] = useState([])

  useEffect(() => {
    let alive = true
    repo.loadMyRecipes().then((list) => alive && setMine(list))
    return () => {
      alive = false
    }
  }, [repo])

  const upsertMine = useCallback(
    async (recipe) => {
      setMine((m) => [...m.filter((r) => r.id !== recipe.id), recipe])
      await repo.saveMyRecipe(recipe)
    },
    [repo]
  )

  const removeMine = useCallback(
    async (recipeId) => {
      setMine((m) => m.filter((r) => r.id !== recipeId))
      await repo.removeMyRecipe(recipeId)
    },
    [repo]
  )

  return { mine, upsertMine, removeMine }
}
