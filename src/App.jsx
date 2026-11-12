import { useState } from 'react'
import { Route, Routes } from 'react-router-dom'
import Masthead, { BottomNav } from './components/Masthead'
import AuthModal from './components/AuthModal'
import SettingsModal from './components/SettingsModal'
import WeekView from './views/WeekView'
import RecipesView from './views/RecipesView'
import GroceryView from './views/GroceryView'
import IngredientsView from './views/IngredientsView'
import { useAuth } from './context/AuthContext'

export default function App() {
  const { loading } = useAuth()
  const [authOpen, setAuthOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  if (loading) {
    return (
      <div className="boot">
        <p className="muted">Loading…</p>
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
          <Route path="/ingredients" element={<IngredientsView />} />
        </Routes>
      </main>
      <footer className="app-footer">
        <p>Forecast by Open-Meteo · Recipes by Spoonacular and the house collection</p>
      </footer>
      <BottomNav />
      {authOpen && <AuthModal onClose={() => setAuthOpen(false)} />}
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}
