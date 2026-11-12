import { describe, expect, it } from 'vitest'
import { parseDuration, parseIngredientLine, recipeFromHtml } from './recipeFromPage'
import { normalizeRecipe } from './spoonacular'

describe('parseIngredientLine', () => {
  const cases = [
    ['2 cups all-purpose flour', 2, 'cups', 'all-purpose flour'],
    ['1 1/2 tablespoons olive oil', 1.5, 'tbsp', 'olive oil'],
    ['½ teaspoon kosher salt', 0.5, 'tsp', 'kosher salt'],
    ['1½ lb boneless pork shoulder, cut into chunks', 1.5, 'lb', 'boneless pork shoulder'],
    ['2-3 cloves garlic, minced', 3, 'cloves', 'garlic'],
    ['1 (14 ounce) can diced tomatoes', 1, 'can', 'diced tomatoes'],
    ['3 large eggs', 3, '', 'eggs'],
    ['Salt and pepper to taste', null, '', 'Salt and pepper to taste'],
    ['1 onion, diced (about 1 cup)', 1, '', 'onion'],
    ['pinch of red pepper flakes', null, 'pinch', 'red pepper flakes'],
  ]
  for (const [line, amount, unit, name] of cases) {
    it(line, () => {
      const r = parseIngredientLine(line)
      expect(r.amount === null ? null : Math.round(r.amount * 100) / 100).toBe(amount)
      expect(r.unit).toBe(unit)
      expect(r.name).toBe(name)
    })
  }
})

describe('parseDuration', () => {
  it('reads ISO durations', () => {
    expect(parseDuration('PT1H15M')).toBe(75)
    expect(parseDuration('PT30M')).toBe(30)
    expect(parseDuration('')).toBeNull()
  })
})

describe('recipeFromHtml', () => {
  const page = `<html><head>
    <script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebPage","name":"x"},
      {"@type":["Recipe"],"name":"Easy Crockpot Carnitas &amp; Salsa","image":[{"url":"https://example.com/c.jpg"}],
       "recipeYield":["8","8 servings"],"totalTime":"PT8H10M","recipeCuisine":"Mexican","recipeCategory":"Main Course",
       "recipeIngredient":["3 lb pork shoulder","1 orange, juiced","2 teaspoons cumin"],
       "recipeInstructions":[{"@type":"HowToStep","text":"Season the pork."},{"@type":"HowToSection","itemListElement":[{"@type":"HowToStep","text":"Cook on low 8 hours."}]}]}]}
    </script></head><body></body></html>`

  it('finds a Recipe in @graph and shapes it like a Spoonacular extract', () => {
    const r = recipeFromHtml(page, 'https://example.com/carnitas')
    expect(r.title).toBe('Easy Crockpot Carnitas & Salsa')
    expect(r.image).toBe('https://example.com/c.jpg')
    expect(r.servings).toBe(8)
    expect(r.readyInMinutes).toBe(490)
    expect(r.extendedIngredients.map((i) => i.name)).toEqual(['pork shoulder', 'orange', 'cumin'])
    expect(r.analyzedInstructions[0].steps.map((s) => s.step)).toEqual(['Season the pork.', 'Cook on low 8 hours.'])
    expect(r.dishTypes).toEqual(['main course'])
  })

  it('normalizes into an app recipe', () => {
    const n = normalizeRecipe(recipeFromHtml(page, 'https://example.com/carnitas'))
    expect(n.title).toBe('Easy Crockpot Carnitas & Salsa')
    expect(n.cuisine).toBe('Mexican')
    expect(n.course).toBe('main')
    expect(n.ingredients[0]).toMatchObject({ name: 'pork shoulder', amount: 3, unit: 'lb' })
    expect(n.steps).toHaveLength(2)
    expect(n.sourceUrl).toBe('https://example.com/carnitas')
  })

  it('returns null without a recipe block', () => {
    expect(recipeFromHtml('<html><script type="application/ld+json">{"@type":"Article"}</script></html>', 'x')).toBeNull()
    expect(recipeFromHtml('<html></html>', 'x')).toBeNull()
  })
})
