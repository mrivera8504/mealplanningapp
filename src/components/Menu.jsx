import { createContext, useContext, useEffect, useId, useRef, useState } from 'react'
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
  const wrap = useRef(null)
  const list = useRef(null)
  const id = useId()

  const setOpenState = (v) => {
    setOpen(v)
    onOpenChange?.(v)
  }

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
          className={`menu-list menu-list-${align}`}
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
