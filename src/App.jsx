import { useState } from 'react'
import { Route, Routes } from 'react-router-dom'
import Masthead from './components/Masthead'
import AuthModal from './components/AuthModal'
import SettingsModal from './components/SettingsModal'
import WeekView from './views/WeekView'
import RecipesView from './views/RecipesView'
import GroceryView from './views/GroceryView'
import { useAuth } from './context/AuthContext'

export default function App() {
  const { loading } = useAuth()
  const [authOpen, setAuthOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  if (loading) {
    return (
      <div className="boot">
        <p className="note">Setting the table…</p>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <Masthead onOpenAuth={() => setAuthOpen(true)} onOpenSettings={() => setSettingsOpen(true)} />
      <main className="app-main">
        <Routes>
          <Route path="/" element={<WeekView onOpenSettings={() => setSettingsOpen(true)} />} />
          <Route path="/recipes" element={<RecipesView />} />
          <Route path="/groceries" element={<GroceryView />} />
        </Routes>
      </main>
      <footer className="app-footer">
        <p className="mono">forecast by open-meteo · recipes by spoonacular &amp; the house</p>
      </footer>
      {authOpen && <AuthModal onClose={() => setAuthOpen(false)} />}
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}
