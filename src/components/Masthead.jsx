import { NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useSettings } from '../context/SettingsContext'
import Icon from './Icon'
import Menu, { MenuDivider, MenuItem, MenuLabel } from './Menu'

export const NAV = [
  { to: '/', label: 'This week', icon: 'calendar', end: true },
  { to: '/recipes', label: 'Recipes', icon: 'book' },
  { to: '/groceries', label: 'Groceries', icon: 'cart' },
  { to: '/ingredients', label: 'Ingredients', icon: 'list' },
]

function initials(user) {
  const source = (user.displayName || user.email || '').trim()
  const parts = source.split(/[\s@._-]+/).filter(Boolean)
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?'
}

/**
 * The navy bar across the top: the name, the four sections, and the
 * theme, settings and account controls. On a phone the sections move to
 * a bar along the bottom (BottomNav) and only the controls stay up here.
 */
export default function Masthead({ onOpenAuth, onOpenSettings }) {
  const { user, firebaseReady, signOut } = useAuth()
  const { theme, toggleTheme } = useSettings()

  return (
    <header className="masthead">
      <div className="masthead-inner">
        <NavLink to="/" className="masthead-brand" aria-label="What's for Dinner, this week">
          <span className="masthead-mark">
            <Icon name="pot" size={18} strokeWidth={2} />
          </span>
          <span className="masthead-title">What's for Dinner</span>
        </NavLink>

        <nav className="masthead-nav" aria-label="Main">
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `tab${isActive ? ' tab-active' : ''}`}>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="masthead-side">
          <button
            type="button"
            className="btn btn-icon masthead-btn"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
          >
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
          </button>
          <button type="button" className="btn btn-icon masthead-btn" onClick={onOpenSettings} aria-label="Settings" title="Settings">
            <Icon name="settings" />
          </button>
          {firebaseReady ? (
            user ? (
              <Menu
                label={`Account: ${user.displayName || user.email}`}
                buttonContent={initials(user)}
                align="end"
                buttonClass="avatar-btn"
                menuLabel="Account"
              >
                <MenuLabel>{user.email}</MenuLabel>
                <MenuDivider />
                <MenuItem icon="close" onSelect={signOut}>
                  Sign out
                </MenuItem>
              </Menu>
            ) : (
              <button type="button" className="btn btn-sm btn-primary masthead-signin" onClick={onOpenAuth}>
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

/** The sections as a tab bar along the bottom, shown on phones only. */
export function BottomNav() {
  return (
    <nav className="bottom-nav" aria-label="Main">
      {NAV.map((item) => (
        <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `bottom-nav-item${isActive ? ' bottom-nav-active' : ''}`}>
          <Icon name={item.icon} size={22} strokeWidth={1.8} />
          <span>{item.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
