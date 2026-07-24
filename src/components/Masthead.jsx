import { NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Masthead({ onOpenAuth, onOpenSettings }) {
  const { user, firebaseReady, signOut } = useAuth()

  return (
    <header className="masthead">
      <div className="masthead-inner">
        <div className="masthead-brand">
          <p className="masthead-kicker">The weekly menu of</p>
          <h1 className="masthead-title">
            <span className="masthead-whats">What’s for</span> Dinner
          </h1>
        </div>

        <nav className="masthead-nav" aria-label="Main">
          <NavLink to="/" end className={({ isActive }) => `tab${isActive ? ' tab-active' : ''}`}>
            This week
          </NavLink>
          <NavLink to="/recipes" className={({ isActive }) => `tab${isActive ? ' tab-active' : ''}`}>
            Recipes
          </NavLink>
          <NavLink to="/groceries" className={({ isActive }) => `tab${isActive ? ' tab-active' : ''}`}>
            Groceries
          </NavLink>
        </nav>

        <div className="masthead-side">
          <button type="button" className="btn btn-ghost btn-sm masthead-btn" onClick={onOpenSettings}>
            Settings
          </button>
          {firebaseReady ? (
            user ? (
              <div className="auth-chip">
                <span className="auth-chip-name" title={user.email}>
                  {user.displayName || user.email}
                </span>
                <button type="button" className="btn btn-ghost btn-sm masthead-btn" onClick={signOut}>
                  Sign out
                </button>
              </div>
            ) : (
              <button type="button" className="btn btn-sm btn-primary" onClick={onOpenAuth}>
                Sign in
              </button>
            )
          ) : (
            <span className="chip chip-note" title="Add Firebase config to enable accounts & sync across devices.">
              notebook mode
            </span>
          )}
        </div>
      </div>
    </header>
  )
}
