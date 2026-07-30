import { createContext, useContext, useEffect, useState } from 'react'
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as fbSignOut,
} from 'firebase/auth'
import { auth, firebaseReady, googleProvider } from '../lib/firebase'
import { makeRepo, migrateLocalToCloud } from '../lib/storage'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(firebaseReady)
  const [repo, setRepo] = useState(() => makeRepo(null))

  useEffect(() => {
    if (!firebaseReady) return undefined
    return onAuthStateChanged(auth, async (u) => {
      setUser(u)
      const nextRepo = makeRepo(u)
      if (u) {
        try {
          await migrateLocalToCloud(nextRepo)
        } catch {
          /* migration is best-effort */
        }
      }
      setRepo(nextRepo)
      setLoading(false)
    })
  }, [])

  const value = {
    firebaseReady,
    user,
    loading,
    repo,
    signUpEmail: (email, password) => createUserWithEmailAndPassword(auth, email, password),
    signInEmail: (email, password) => signInWithEmailAndPassword(auth, email, password),
    signInGoogle: () => signInWithPopup(auth, googleProvider),
    signOut: () => fbSignOut(auth),
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}
