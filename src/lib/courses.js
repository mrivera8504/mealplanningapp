import { normalizeName } from './grocery'

/**
 * Courses: every recipe is a main, a side or a dessert. A recipe with no
 * `course` is a main, so everything saved before courses existed still
 * behaves as it did. A night on the plan holds one dinner (a main), up to
 * MAX_SIDES sides, and one dessert.
 */

export const COURSES = [
  { value: 'main', label: 'Mains', one: 'main', spoonacularType: 'main course' },
  { value: 'side', label: 'Sides', one: 'side', spoonacularType: 'side dish' },
  { value: 'dessert', label: 'Desserts', one: 'dessert', spoonacularType: 'dessert' },
]

export const MAX_SIDES = 3

export const courseOf = (recipe) => recipe?.course || 'main'

export const courseInfo = (course) => COURSES.find((c) => c.value === course) || COURSES[0]

export const ofCourse = (recipes, course) => (recipes || []).filter((r) => courseOf(r) === course)

/**
 * Course from Spoonacular's dish types. Their lists are generous ("side
 * dish" often rides along with "main course"), so anything also tagged as a
 * main stays a main.
 */
export function courseFromDishTypes(dishTypes = []) {
  const types = dishTypes.map((t) => String(t).toLowerCase())
  if (types.includes('main course') || types.includes('main dish')) return 'main'
  if (types.includes('dessert')) return 'dessert'
  if (types.includes('side dish')) return 'side'
  return 'main'
}

/**
 * A side or dessert that's just a name ("garlic bread", "ice cream") -- most
 * don't need a recipe. Its id comes from the name, so the same entry typed
 * on another night counts as the same dish for rotation. With no ingredients
 * given, it goes on the grocery list as itself.
 */
export function quickEntry(title, course, ingredientsText = '') {
  const name = title.trim()
  const listed = ingredientsText
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return {
    id: `quick-${course}-${normalizeName(name).replace(/\s+/g, '-') || Date.now()}`,
    title: name,
    course,
    quick: true,
    categories: [],
    cuisine: null,
    ingredients: (listed.length ? listed : [name]).map((n) => ({ name: n, amount: null, unit: '' })),
    steps: [],
    readyInMinutes: null,
    servings: null,
  }
}

/**
 * What kind of side a recipe is, for pairing: a second starch next to pasta
 * is a poor suggestion, and a plate with no vegetable wants one. House sides
 * state theirs (`sideKind`); for everything else it's read off the title.
 */
const KIND_WORDS = [
  ['salad', ['salad', 'slaw', 'coleslaw']],
  ['bread', ['bread', 'roll', 'rolls', 'biscuit', 'biscuits', 'naan', 'cornbread', 'focaccia', 'toast', 'garlic knots', 'tortillas', 'pita']],
  ['starch', ['rice', 'potato', 'potatoes', 'fries', 'mashed', 'pasta', 'noodle', 'noodles', 'mac', 'macaroni', 'grits', 'polenta', 'couscous', 'quinoa', 'pilaf', 'stuffing', 'orzo', 'risotto', 'beans']],
  ['vegetable', ['broccoli', 'green beans', 'carrot', 'carrots', 'asparagus', 'brussels', 'spinach', 'zucchini', 'corn', 'peas', 'cauliflower', 'kale', 'squash', 'cabbage', 'vegetable', 'vegetables', 'veggies', 'greens', 'bok choy', 'peppers', 'mushrooms', 'beets', 'cucumber', 'cucumbers', 'tomato', 'tomatoes', 'eggplant', 'okra']],
]

export function sideKind(recipe) {
  if (recipe?.sideKind) return recipe.sideKind
  const title = ` ${String(recipe?.title || '').toLowerCase().replace(/[^a-z\s]/g, ' ')} `
  for (const [kind, words] of KIND_WORDS) {
    if (words.some((w) => title.includes(` ${w} `) || title.includes(` ${w}s `))) return kind
  }
  return 'other'
}

/** Whether a main already brings its own starch or its own greens, read off its style and title. */
export function mainBrings(main) {
  const title = ` ${String(main?.title || '').toLowerCase().replace(/[^a-z\s]/g, ' ')} `
  const cats = main?.categories || []
  const has = (words) => words.some((w) => title.includes(` ${w} `) || title.includes(` ${w}s `))
  return {
    starch: cats.includes('pasta') || has(['pasta', 'rice', 'noodle', 'potato', 'potatoes', 'orzo', 'risotto', 'gnocchi', 'lasagna', 'ziti', 'penne', 'spaghetti', 'taco', 'burger', 'sandwich', 'pizza', 'pot pie']),
    greens: cats.includes('salad') || has(['salad', 'slaw', 'kale', 'spinach', 'broccoli', 'vegetable', 'vegetables', 'greens']),
  }
}
