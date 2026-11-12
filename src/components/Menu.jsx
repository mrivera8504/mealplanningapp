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
 * `align` is only a preference: the menu opens toward whichever side has
 * room, upward when there's more room above, and scrolls when it's taller
 * than the room it has.
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
  const [fit, setFit] = useState(null) // the open menu's fixed position: { left, top or bottom, maxHeight }
  const wrap = useRef(null)
  const list = useRef(null)
  const id = useId()

  const setOpenState = (v) => {
    setOpen(v)
    if (!v) setFit(null)
    onOpenChange?.(v)
  }

  // Keep the open menu on screen. It is positioned against the viewport
  // (position: fixed) from the button's current place: under the button on
  // its `align` side if that fits, the other side if not, pinned inside the
  // screen edges if neither does; upward when there's more room above; and
  // never taller than the room it has, counting the sticky header and the
  // phone's bottom bar. It follows the button while the page scrolls.
  useLayoutEffect(() => {
    if (!open) return undefined
    const place = () => {
      if (!list.current || !wrap.current) return
      const margin = 8
      const gap = 6
      const vw = document.documentElement.clientWidth
      const button = wrap.current.getBoundingClientRect()
      const width = list.current.offsetWidth
      const fullHeight = list.current.scrollHeight

      let left = align === 'end' ? button.right - width : button.left
      if (left + width > vw - margin) left = button.right - width
      if (left < margin) left = button.left
      left = Math.min(Math.max(margin, left), vw - margin - width)

      const top = document.querySelector('.masthead')?.getBoundingClientRect().bottom || 0
      const navBar = document.querySelector('.bottom-nav')
      const bottom = navBar && getComputedStyle(navBar).display !== 'none' ? navBar.getBoundingClientRect().top : window.innerHeight
      const below = bottom - button.bottom - gap - margin
      const above = button.top - top - gap - margin
      const up = fullHeight > below && above > below
      const maxHeight = Math.max(Math.min(up ? above : below, 420), 120)
      setFit(
        up
          ? { left, bottom: window.innerHeight - button.top + gap, maxHeight }
          : { left, top: button.bottom + gap, maxHeight }
      )
    }
    place()
    const onMove = () => requestAnimationFrame(place)
    window.addEventListener('scroll', onMove, { passive: true, capture: true })
    window.addEventListener('resize', onMove)
    return () => {
      window.removeEventListener('scroll', onMove, { capture: true })
      window.removeEventListener('resize', onMove)
    }
  }, [open, align])

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
    requestAnimationFrame(() => list.current?.querySelector('[role="menuitem"]:not(:disabled)')?.focus({ preventScroll: true }))
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
          className="menu-list"
          style={fit ? { position: 'fixed', ...fit } : { position: 'fixed', top: 0, left: 0, visibility: 'hidden' }}
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
