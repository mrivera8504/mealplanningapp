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

/** Shuffled idea deck with weather-matched ideas floated to the front. */
export function takeoutDeck(moodKey) {
  const shuffled = [...TAKEOUT_IDEAS].sort(() => Math.random() - 0.5)
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
