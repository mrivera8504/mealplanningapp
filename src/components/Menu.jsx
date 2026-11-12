import { createContext, useContext, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import Icon from './Icon'

const CloseContext = createContext(() => {})

/**
 * A dropdown menu: one button that opens a list of actions. Closes on a
 * choice, outside click or Escape; arrow keys move between items.
 *
 * <Menu label="Options" icon="more" align="end">
 *   <MenuLabel>Dinner</MenuLabel>
 *   <MenuItem icon="refresh" onSelect={…}>Another idea</MenuItem>
 *   <MenuDivider />
 * </Menu>
 *
 * `label` is the button's text, or its accessible name when `iconOnly`.
 * Children can be a function of `close`, for menus that switch views
 * (like "Move to…") without closing.
 *
 * `align` is only a preference: when the menu would run off the screen it
 * opens toward the side that has room, upward when there's more room above,
 * and scrolls when it's taller than the room it has.
 */
export default function Menu({
  label,
  icon,
  iconOnly = false,
  align = 'start',
  buttonClass = 'btn btn-secondary',
  menuLabel,
  disabled,
  children,
  onOpenChange,
  buttonContent, // custom button inside (an avatar, say); `label` is then its accessible name
}) {
  const [open, setOpen] = useState(false)
  const [fit, setFit] = useState(null) // { side: 'start'|'end'|'pinned', up, shift }
  const wrap = useRef(null)
  const list = useRef(null)
  const id = useId()

  const setOpenState = (v) => {
    setOpen(v)
    if (!v) setFit(null)
    onOpenChange?.(v)
  }

  // Keep the open menu on screen. Measure it where `align` puts it; if it
  // overflows, try the other side; if neither fits (a narrow phone), pin it
  // inside the screen edges. Then flip it upward if it would run off the bottom.
  useLayoutEffect(() => {
    if (!open || fit || !list.current) return
    const margin = 8
    const vw = document.documentElement.clientWidth
    const vh = window.innerHeight
    const button = wrap.current.getBoundingClientRect()
    const menu = list.current.getBoundingClientRect()
    const fitsStart = button.left + menu.width <= vw - margin
    const fitsEnd = button.right - menu.width >= margin
    let side = align
    let shift = 0
    if (side === 'start' && !fitsStart) side = fitsEnd ? 'end' : 'pinned'
    else if (side === 'end' && !fitsEnd) side = fitsStart ? 'start' : 'pinned'
    if (side === 'pinned') {
      // Left edge relative to the button, clamped so the whole menu is on screen.
      const left = Math.min(Math.max(margin, button.left), vw - margin - menu.width)
      shift = Math.max(margin, left) - button.left
    }
    // Room above and below, not counting the sticky header or the phone's bottom bar.
    const top = document.querySelector('.masthead')?.getBoundingClientRect().bottom || 0
    const navBar = document.querySelector('.bottom-nav')
    const bottom = navBar && getComputedStyle(navBar).display !== 'none' ? navBar.getBoundingClientRect().top : vh
    const below = bottom - button.bottom - margin - 6
    const above = button.top - top - margin - 6
    const up = menu.height > below && above > below
    const room = Math.max(up ? above : below, 160)
    setFit({ side, up, shift, maxHeight: menu.height > room ? room : null })
  }, [open, fit, align])

  useEffect(() => {
    if (!open) return undefined
    const onDown = (e) => {
      if (!wrap.current?.contains(e.target)) setOpenState(false)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setOpenState(false)
        wrap.current?.querySelector('button')?.focus()
      }
    }
    document.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey)
    // Focus the first item, so the keyboard can carry on from the button.
    requestAnimationFrame(() => list.current?.querySelector('[role="menuitem"]:not(:disabled)')?.focus())
    return () => {
      document.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const onListKey = (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const items = [...list.current.querySelectorAll('[role="menuitem"]:not(:disabled)')]
    const i = items.indexOf(document.activeElement)
    const next = e.key === 'ArrowDown' ? items[(i + 1) % items.length] : items[(i - 1 + items.length) % items.length]
    next?.focus()
  }

  const close = () => setOpenState(false)
  const content = typeof children === 'function' ? children(close) : children

  return (
    <div className="menu" ref={wrap}>
      <button
        type="button"
        className={buttonClass}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={iconOnly || buttonContent ? label : undefined}
        title={iconOnly || buttonContent ? label : undefined}
        disabled={disabled}
        onClick={() => setOpenState(!open)}
      >
        {buttonContent || (
          <>
            {icon && <Icon name={icon} size={iconOnly ? 18 : 16} />}
            {!iconOnly && label}
            {!iconOnly && !icon && <Icon name="chevronDown" size={14} />}
          </>
        )}
      </button>
      {open && (
        <div
          id={id}
          ref={list}
          role="menu"
          aria-label={menuLabel || label}
          className={`menu-list menu-list-${fit?.side === 'end' ? 'end' : 'start'}${fit?.up ? ' menu-list-up' : ''}`}
          style={
            fit
              ? { ...(fit.side === 'pinned' ? { left: fit.shift } : {}), ...(fit.maxHeight ? { maxHeight: fit.maxHeight } : {}) }
              : { visibility: 'hidden' }
          }
          onKeyDown={onListKey}
        >
          <CloseContext.Provider value={close}>{content}</CloseContext.Provider>
        </div>
      )}
    </div>
  )
}

export function MenuItem({ icon, onSelect, danger, disabled, keepOpen, trailing, children }) {
  const close = useContext(CloseContext)
  return (
    <button
      type="button"
      role="menuitem"
      className={`menu-item${danger ? ' menu-item-danger' : ''}`}
      disabled={disabled}
      onClick={() => {
        if (!keepOpen) close()
        onSelect?.()
      }}
    >
      <span className="menu-item-icon">{icon && <Icon name={icon} size={16} />}</span>
      <span className="menu-item-text">{children}</span>
      {trailing && <span className="menu-item-trailing">{trailing}</span>}
    </button>
  )
}

export function MenuLabel({ children }) {
  return <p className="menu-label">{children}</p>
}

export function MenuDivider() {
  return <div className="menu-divider" role="separator" />
}
