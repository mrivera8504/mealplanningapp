/**
 * Small hand-drawn-feel glyphs for meal categories — used where Spoonacular
 * photos don't exist (the house collection) so cards still have a face.
 */
const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' }

const GLYPHS = {
  soup: (
    <g {...S}>
      <path d="M5 13h14a7 7 0 0 1-14 0z" />
      <path d="M9 9.5c0-1.4 1-1.4 1-2.8M13.5 9.5c0-1.4 1-1.4 1-2.8" className="anim-steam" />
    </g>
  ),
  stew: (
    <g {...S}>
      <path d="M6 11h12v4a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5v-4z" />
      <path d="M4.5 11h15M12 11V8.5M12 8.5a2 2 0 1 0-2-2" />
    </g>
  ),
  braise: (
    <g {...S}>
      <path d="M5.5 12h13v3.5a4.5 4.5 0 0 1-4.5 4.5h-4a4.5 4.5 0 0 1-4.5-4.5V12z" />
      <path d="M4 12h16M8 8.5c2.5-1.5 5.5-1.5 8 0" />
    </g>
  ),
  baked: (
    <g {...S}>
      <rect x="4.5" y="9" width="15" height="10" rx="2" />
      <path d="M4.5 13h15M9.5 16h5" />
    </g>
  ),
  roast: (
    <g {...S}>
      <ellipse cx="11" cy="14" rx="6.5" ry="4.5" />
      <path d="M17 11.5l2.6-2.6M19.5 11.5l.6-3.1-3.1.6" />
    </g>
  ),
  pasta: (
    <g {...S}>
      <path d="M5 13h14a7 7 0 0 1-14 0z" />
      <path d="M8 10c1-3 1.5-4.5 4-6M12 10c1-2.5 1.5-3.5 3.5-5" />
    </g>
  ),
  grill: (
    <g {...S}>
      <path d="M5 10h14a7 7 0 0 1-14 0z" transform="rotate(180 12 11.5)" />
      <path d="M8 16.5l-1.5 3M16 16.5l1.5 3M12 16.5v3" />
    </g>
  ),
  salad: (
    <g {...S}>
      <path d="M5 12h14a7 7 0 0 1-14 0z" />
      <path d="M8.5 9c.5-2 2-3.5 3.5-4M12 9c1.5-1.5 3-2 5-2M9.5 9C8 8 6.5 8 5.5 8.5" />
    </g>
  ),
  cold: (
    <g {...S}>
      <path d="M12 4v16M6.5 7.5l11 9M17.5 7.5l-11 9" />
      <path d="M12 4l-1.6 1.6M12 4l1.6 1.6M12 20l-1.6-1.6M12 20l1.6-1.6" />
    </g>
  ),
  quick: (
    <g {...S}>
      <circle cx="12" cy="13" r="7" />
      <path d="M12 13V8.5M12 13l3 2M9.5 3.5h5" />
    </g>
  ),
}

export default function CategoryGlyph({ category, size = 24 }) {
  const glyph = GLYPHS[category] || GLYPHS.stew
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      {glyph}
    </svg>
  )
}
