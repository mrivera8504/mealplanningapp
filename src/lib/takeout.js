/**
 * Takeout night: a rotating deck of ideas, gently biased by the weather
 * (rainy → delivery comfort food, hot → cold/fresh). Accepting one places a
 * takeout "meal" on the day — no ingredients, so the grocery list skips it.
 */

export const TAKEOUT_IDEAS = [
  { id: 'pizza', title: 'Pizza night', blurb: 'The classic. Zero dishes.', moods: ['cozy', 'soup'] },
  { id: 'thai', title: 'Thai takeout', blurb: 'Curry and noodles travel well.', moods: ['cozy', 'soup'] },
  { id: 'sushi', title: 'Sushi night', blurb: 'Cool, clean, and no oven involved.', moods: ['grill', 'no-oven'] },
  { id: 'ramen', title: 'Ramen run', blurb: 'Broth on a grim night is self-care.', moods: ['soup', 'braise'] },
  { id: 'indian', title: 'Indian takeout', blurb: 'Curry, naan, leftovers for lunch.', moods: ['cozy', 'soup', 'braise'] },
  { id: 'burgers', title: 'Burger night', blurb: 'Somebody else flips them for once.', moods: ['open'] },
  { id: 'tacos', title: 'Taco truck night', blurb: 'Worth the drive.', moods: ['grill', 'no-oven', 'open'] },
  { id: 'chinese', title: 'Chinese takeout', blurb: 'Cartons on the counter, no plan needed.', moods: ['cozy', 'open'] },
  { id: 'mediterranean', title: 'Mediterranean night', blurb: 'Shawarma, falafel, all the pickles.', moods: ['grill', 'no-oven'] },
  { id: 'poke', title: 'Poke bowls', blurb: 'Dinner that doubles as air conditioning.', moods: ['grill', 'no-oven'] },
  { id: 'fried-chicken', title: 'Fried chicken night', blurb: 'Crunchy, glorious, occasionally necessary.', moods: ['cozy', 'open'] },
  { id: 'pho', title: 'Pho night', blurb: 'A giant bowl of steam and noodles.', moods: ['soup', 'braise'] },
]

/** One of the household's own takeout ideas, from a name and an optional note. */
export function customIdea(title, blurb = '') {
  const name = title.trim()
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || String(Date.now())
  return { id: `custom-${slug}`, title: name, blurb: blurb.trim(), moods: [], custom: true }
}

/**
 * Every idea the picker may offer: the built-ins that aren't hidden, plus the
 * household's own. prefs = settings.takeout: { custom: [idea], hidden: [id] }.
 */
export function takeoutIdeas(prefs = {}) {
  const hidden = new Set(prefs.hidden || [])
  return [...TAKEOUT_IDEAS.filter((t) => !hidden.has(t.id)), ...(prefs.custom || [])]
}

/**
 * Shuffled idea deck with weather-matched ideas floated to the front. The
 * household's own ideas have no weather tags, so they shuffle in with the rest.
 */
export function takeoutDeck(moodKey, prefs) {
  const ideas = takeoutIdeas(prefs)
  if (!ideas.length) return [...TAKEOUT_IDEAS]
  const shuffled = [...ideas].sort(() => Math.random() - 0.5)
  if (!moodKey) return shuffled
  return [
    ...shuffled.filter((t) => t.moods.includes(moodKey)),
    ...shuffled.filter((t) => !t.moods.includes(moodKey)),
  ]
}

/** The meal object a day slot holds when takeout is accepted. */
export function takeoutMeal(idea) {
  return {
    id: `takeout-${idea.id}`,
    title: idea.title,
    takeout: true,
    categories: ['takeout'],
    ingredients: [],
    steps: [],
    readyInMinutes: null,
    servings: null,
  }
}
