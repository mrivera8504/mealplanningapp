import { doc, getDoc, setDoc, deleteDoc, collection, getDocs } from 'firebase/firestore'
import { db } from './firebase'

/**
 * Persistence with two backends behind one interface:
 *  - signed in  → Firestore under users/{uid}/…
 *  - signed out → localStorage ("notebook mode"), so the app is fully usable
 *    before an account exists.
 */

const LS_PREFIX = 'wfd:'

function lsGet(key) {
  try {
    const raw = localStorage.getItem(LS_PREFIX + key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function lsSet(key, value) {
  try {
    localStorage.setItem(LS_PREFIX + key, JSON.stringify(value))
  } catch {
    /* storage full or blocked — nothing useful to do */
  }
}


const userDoc = (uid, ...path) => doc(db, 'users', uid, ...path)

export function makeRepo(user) {
  if (user && db) {
    const uid = user.uid
    return {
      cloud: true,
      async loadPlan(weekId) {
        const snap = await getDoc(userDoc(uid, 'plans', weekId))
        return snap.exists() ? snap.data() : null
      },
      async savePlan(weekId, plan) {
        await setDoc(userDoc(uid, 'plans', weekId), plan)
      },
      async loadSavedRecipes() {
        const snap = await getDocs(collection(db, 'users', uid, 'savedRecipes'))
        return snap.docs.map((d) => d.data())
      },
      async saveRecipe(recipe) {
        await setDoc(userDoc(uid, 'savedRecipes', recipe.id), recipe)
      },
      async removeRecipe(recipeId) {
        await deleteDoc(userDoc(uid, 'savedRecipes', recipeId))
      },
      async loadGrocery(weekId) {
        const snap = await getDoc(userDoc(uid, 'grocery', weekId))
        return snap.exists() ? snap.data() : null
      },
      async saveGrocery(weekId, data) {
        await setDoc(userDoc(uid, 'grocery', weekId), data)
      },
      async loadSettings() {
        const snap = await getDoc(userDoc(uid, 'meta', 'settings'))
        return snap.exists() ? snap.data() : null
      },
      async saveSettings(settings) {
        await setDoc(userDoc(uid, 'meta', 'settings'), settings)
      },
    }
  }

  return {
    cloud: false,
    async loadPlan(weekId) {
      return lsGet(`plan:${weekId}`)
    },
    async savePlan(weekId, plan) {
      lsSet(`plan:${weekId}`, plan)
    },
    async loadSavedRecipes() {
      return lsGet('saved') || []
    },
    async saveRecipe(recipe) {
      const saved = lsGet('saved') || []
      lsSet('saved', [...saved.filter((r) => r.id !== recipe.id), recipe])
    },
    async removeRecipe(recipeId) {
      const saved = lsGet('saved') || []
      lsSet('saved', saved.filter((r) => r.id !== recipeId))
    },
    async loadGrocery(weekId) {
      return lsGet(`grocery:${weekId}`)
    },
    async saveGrocery(weekId, data) {
      lsSet(`grocery:${weekId}`, data)
    },
    async loadSettings() {
      return lsGet('settings')
    },
    async saveSettings(settings) {
      lsSet('settings', settings)
    },
  }
}

/**
 * One-time hand-off when someone signs in after planning as a guest:
 * copy local data into the cloud wherever the cloud copy is empty.
 */
export async function migrateLocalToCloud(cloudRepo, weekId) {
  const localRepo = makeRepo(null)
  const [localPlan, cloudPlan] = await Promise.all([localRepo.loadPlan(weekId), cloudRepo.loadPlan(weekId)])
  if (localPlan && !cloudPlan) await cloudRepo.savePlan(weekId, localPlan)

  const [localSaved, cloudSaved] = await Promise.all([localRepo.loadSavedRecipes(), cloudRepo.loadSavedRecipes()])
  if (localSaved.length && !cloudSaved.length) {
    await Promise.all(localSaved.map((r) => cloudRepo.saveRecipe(r)))
  }
}
