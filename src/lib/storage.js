import { doc, getDoc, setDoc, deleteDoc, collection, getDocs } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { db, storage } from './firebase'

/**
 * Persistence with two backends behind one interface:
 *  - signed in  → Firestore under users/{uid}/…
 *  - signed out → localStorage ("notebook mode"), so the app is fully usable
 *    before an account exists.
 *
 * The meal plan is stored as a single document keyed 'current' (cloud) or
 * 'plan' (localStorage). It accumulates meals indexed by date and never
 * rotates, so there is no key-change data loss.
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
      async loadPlan() {
        const snap = await getDoc(userDoc(uid, 'plans', 'current'))
        return snap.exists() ? snap.data() : null
      },
      async loadLegacyPlans() {
        const snap = await getDocs(collection(db, 'users', uid, 'plans'))
        return snap.docs
          .filter((d) => d.id !== 'current')
          .map((d) => ({ key: d.id, data: d.data() }))
      },
      async savePlan(plan) {
        await setDoc(userDoc(uid, 'plans', 'current'), plan)
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
      async loadMyRecipes() {
        const snap = await getDocs(collection(db, 'users', uid, 'myRecipes'))
        return snap.docs.map((d) => d.data())
      },
      async saveMyRecipe(recipe) {
        await setDoc(userDoc(uid, 'myRecipes', recipe.id), recipe)
      },
      async removeMyRecipe(recipeId) {
        await deleteDoc(userDoc(uid, 'myRecipes', recipeId))
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
    async loadPlan() {
      return lsGet('plan')
    },
    async loadLegacyPlans() {
      const out = []
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i)
          if (!k || !k.startsWith(`${LS_PREFIX}plan:`)) continue
          const data = lsGet(k.slice(LS_PREFIX.length))
          if (data) out.push({ key: k.slice(`${LS_PREFIX}plan:`.length), data })
        }
      } catch {
        /* storage blocked — treat as no legacy data */
      }
      return out
    },
    async savePlan(plan) {
      lsSet('plan', plan)
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
    async loadMyRecipes() {
      return lsGet('mine') || []
    },
    async saveMyRecipe(recipe) {
      const mine = lsGet('mine') || []
      lsSet('mine', [...mine.filter((r) => r.id !== recipe.id), recipe])
    },
    async removeMyRecipe(recipeId) {
      const mine = lsGet('mine') || []
      lsSet('mine', mine.filter((r) => r.id !== recipeId))
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
 * Upload a recipe photo for the given user and recipe id.
 * Returns the public download URL, or null if Storage isn't available.
 */
export async function uploadRecipeImage(uid, recipeId, file) {
  if (!storage) return null
  const ext = file.name.split('.').pop()
  const path = `users/${uid}/recipes/${recipeId}.${ext}`
  const snap = await uploadBytes(ref(storage, path), file)
  return getDownloadURL(snap.ref)
}

/**
 * One-time hand-off when someone signs in after planning as a guest:
 * copy local data into the cloud wherever the cloud copy is empty.
 */
export async function migrateLocalToCloud(cloudRepo) {
  const localRepo = makeRepo(null)

  const [localPlan, cloudPlan] = await Promise.all([localRepo.loadPlan(), cloudRepo.loadPlan()])
  if (localPlan && !cloudPlan) await cloudRepo.savePlan(localPlan)

  const [localSaved, cloudSaved] = await Promise.all([localRepo.loadSavedRecipes(), cloudRepo.loadSavedRecipes()])
  if (localSaved.length && !cloudSaved.length) {
    await Promise.all(localSaved.map((r) => cloudRepo.saveRecipe(r)))
  }

  const [localMine, cloudMine] = await Promise.all([localRepo.loadMyRecipes(), cloudRepo.loadMyRecipes()])
  if (localMine.length && !cloudMine.length) {
    await Promise.all(localMine.map((r) => cloudRepo.saveMyRecipe(r)))
  }
}
