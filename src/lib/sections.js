/**
 * Store sections for the grocery list, and how an ingredient finds its section:
 *  1. the household's own choice (stored per ingredient in meta/ingredients)
 *  2. the aisle Spoonacular supplies with recipe ingredients
 *  3. a built-in keyword list, for personal and house recipes
 *  4. otherwise "Other"
 */

export const SECTIONS = [
  'Produce',
  'Meat and seafood',
  'Dairy and eggs',
  'Bakery',
  'Pantry',
  'Canned and jarred',
  'Spices and baking',
  'Frozen',
  'Beverages',
  'Other',
]

export const OTHER = 'Other'

/** Spoonacular aisle names (lowercased, first part before any ";") → our sections. */
const AISLES = {
  produce: 'Produce',
  'dried fruits': 'Produce',
  meat: 'Meat and seafood',
  seafood: 'Meat and seafood',
  'grilling supplies': 'Meat and seafood',
  'milk, eggs, other dairy': 'Dairy and eggs',
  cheese: 'Dairy and eggs',
  refrigerated: 'Dairy and eggs',
  'bakery/bread': 'Bakery',
  bread: 'Bakery',
  'pasta and rice': 'Pantry',
  'oil, vinegar, salad dressing': 'Pantry',
  condiments: 'Pantry',
  'ethnic foods': 'Pantry',
  nuts: 'Pantry',
  cereal: 'Pantry',
  'nut butters, jams, and honey': 'Pantry',
  'health foods': 'Pantry',
  gourmet: 'Pantry',
  'gluten free': 'Pantry',
  'savory snacks': 'Pantry',
  'sweet snacks': 'Pantry',
  'canned and jarred': 'Canned and jarred',
  baking: 'Spices and baking',
  'spices and seasonings': 'Spices and baking',
  frozen: 'Frozen',
  beverages: 'Beverages',
  'alcoholic beverages': 'Beverages',
  'tea and coffee': 'Beverages',
}

export function sectionFromAisle(aisle) {
  if (!aisle) return null
  const first = String(aisle).split(';')[0].trim().toLowerCase()
  return AISLES[first] || null
}

/**
 * Keyword fallback, checked in order -- the first section with a matching
 * word wins, so "chicken broth" lands in Canned and jarred (broth) before
 * Meat and seafood (chicken), and "frozen peas" in Frozen before Produce.
 */
const KEYWORDS = [
  ['Frozen', ['frozen', 'ice cream']],
  ['Canned and jarred', ['canned', 'can of', 'broth', 'stock', 'tomato paste', 'tomato sauce', 'crushed tomatoes', 'diced tomatoes', 'salsa', 'beans', 'chickpeas', 'coconut milk', 'olives', 'pickles', 'capers', 'marinara']],
  ['Spices and baking', ['salt', 'pepper flakes', 'black pepper', 'ground pepper', 'cumin', 'paprika', 'oregano', 'thyme', 'chili powder', 'cinnamon', 'nutmeg', 'turmeric', 'coriander', 'garam masala', 'curry powder', 'bay leaf', 'bay leaves', 'flour', 'sugar', 'baking powder', 'baking soda', 'yeast', 'vanilla', 'cocoa', 'cornstarch', 'chocolate chips', 'seasoning', 'spice']],
  ['Dairy and eggs', ['milk', 'butter', 'cheese', 'cheddar', 'parmesan', 'mozzarella', 'feta', 'ricotta', 'cream', 'yogurt', 'egg', 'eggs', 'sour cream', 'half and half']],
  ['Meat and seafood', ['chicken', 'beef', 'pork', 'turkey', 'lamb', 'sausage', 'bacon', 'ham', 'steak', 'ground', 'shrimp', 'salmon', 'fish', 'cod', 'tilapia', 'tuna', 'chorizo', 'prosciutto', 'pancetta', 'thighs', 'breast']],
  ['Bakery', ['bread', 'bun', 'buns', 'roll', 'rolls', 'tortilla', 'tortillas', 'pita', 'naan', 'baguette', 'sourdough', 'bagel']],
  ['Beverages', ['wine', 'beer', 'juice', 'coffee', 'tea', 'soda', 'sparkling water']],
  ['Pantry', ['rice', 'pasta', 'spaghetti', 'penne', 'orzo', 'noodles', 'quinoa', 'oats', 'oil', 'vinegar', 'soy sauce', 'honey', 'maple syrup', 'mustard', 'ketchup', 'mayonnaise', 'peanut butter', 'lentils', 'breadcrumbs', 'panko', 'nuts', 'almonds', 'walnuts', 'sesame', 'sriracha', 'hot sauce', 'worcestershire', 'fish sauce']],
  ['Produce', ['onion', 'onions', 'garlic', 'shallot', 'potato', 'potatoes', 'carrot', 'carrots', 'celery', 'tomato', 'tomatoes', 'lettuce', 'spinach', 'kale', 'cabbage', 'broccoli', 'cauliflower', 'pepper', 'peppers', 'zucchini', 'squash', 'cucumber', 'mushroom', 'mushrooms', 'lemon', 'lime', 'orange', 'apple', 'banana', 'avocado', 'cilantro', 'parsley', 'basil', 'mint', 'dill', 'ginger', 'scallion', 'scallions', 'green onion', 'jalapeno', 'corn', 'peas', 'green beans', 'asparagus', 'eggplant', 'leek', 'leeks', 'berries', 'herbs', 'arugula', 'sweet potato']],
]

// Whole words only, with an optional plural ending, so "apples" finds "apple" but "eggplant" doesn't find "egg".
const hasWord = (text, word) =>
  new RegExp(`(^|\\s)${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(e?s)?(\\s|$)`).test(text)

export function sectionFromKeywords(name) {
  const text = String(name || '').toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!text) return null
  for (const [section, words] of KEYWORDS) {
    if (words.some((w) => hasWord(text, w))) return section
  }
  return null
}

/** The section for one grocery item. `chosen` is the household's own pick, if any. */
export function sectionFor({ chosen, aisle, name }) {
  if (chosen && SECTIONS.includes(chosen)) return chosen
  return sectionFromAisle(aisle) || sectionFromKeywords(name) || OTHER
}

/** The household's section order: their saved order first, then any section it doesn't mention. */
export function orderedSections(saved) {
  const known = (saved || []).filter((s) => SECTIONS.includes(s))
  return [...known, ...SECTIONS.filter((s) => !known.includes(s))]
}
