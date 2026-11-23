import { describe, expect, it } from 'vitest'
import { isBlockedPage, looksLikeJunk, parseDuration, parseIngredientLine, recipeFromHtml, withoutJunk } from './recipeFromPage'
import { isPinLink } from './pinterest'
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

  it('picks the recipe matching the hint on a round-up page', () => {
    const two = `<script type="application/ld+json">[{"@type":"Recipe","name":"Classic Mac","recipeIngredient":["1 lb pasta"]},{"@type":"Recipe","name":"Lobster Mac and Cheese","recipeIngredient":["1 lb lobster"]}]</script>`
    expect(recipeFromHtml(two, 'x').title).toBe('Classic Mac')
    expect(recipeFromHtml(two, 'x', 'Fancy lobster mac and cheese for the slow cooker').title).toBe('Lobster Mac and Cheese')
  })

  it('returns null without a recipe block', () => {
    expect(recipeFromHtml('<html><script type="application/ld+json">{"@type":"Article"}</script></html>', 'x')).toBeNull()
    expect(recipeFromHtml('<html></html>', 'x')).toBeNull()
  })
})

describe('reading messier pages', () => {
  const ld = (body) => `<html><head><script type="application/ld+json">${body}</script></head><body></body></html>`

  it('forgives raw line breaks inside strings and trailing commas', () => {
    const r = recipeFromHtml(
      ld(`{"@type":"Recipe","name":"Chili
Night","recipeIngredient":["1 lb beef","2 cans beans",],"recipeInstructions":"Brown the beef.
Add beans.",}`),
      'https://x.test/'
    )
    expect(r.title).toBe('Chili Night')
    expect(r.extendedIngredients).toHaveLength(2)
    expect(r.analyzedInstructions[0].steps.map((s) => s.step)).toEqual(['Brown the beef.', 'Add beans.'])
  })

  it('reads @type written as a schema.org URL, and blocks wrapped in HTML comments', () => {
    const r = recipeFromHtml(ld(`<!--{"@type":"http://schema.org/Recipe","name":"Soup","recipeIngredient":["water"]}-->`), 'https://x.test/')
    expect(r.title).toBe('Soup')
  })

  it('reads a recipe from an ItemList round-up', () => {
    const r = recipeFromHtml(
      ld(`{"@type":"ItemList","itemListElement":[{"@type":"ListItem","item":{"@type":"Recipe","name":"Tacos","recipeIngredient":["tortillas"]}}]}`),
      'https://x.test/'
    )
    expect(r.title).toBe('Tacos')
  })

  it('falls back to microdata when there is no JSON-LD', () => {
    const html = `<div itemscope itemtype="https://schema.org/Recipe"><h1 itemprop="name">Pot Roast</h1>
      <li itemprop="recipeIngredient">3 lb chuck roast</li><li itemprop="recipeIngredient">4 carrots</li>
      <div itemprop="recipeInstructions">Roast low and slow.</div></div>`
    const r = recipeFromHtml(html, 'https://x.test/')
    expect(r.title).toBe('Pot Roast')
    expect(r.extendedIngredients.map((i) => i.name)).toEqual(['chuck roast', 'carrots'])
  })

  it('drops script text that ended up in the instructions', () => {
    const r = recipeFromHtml(
      ld(`{"@type":"Recipe","name":"Pie","recipeIngredient":["1 crust"],"recipeInstructions":[{"text":"Bake it."},{"text":"window.dataLayer = window.dataLayer || []; function gtag(){dataLayer.push(arguments);}"}]}`),
      'https://x.test/'
    )
    expect(r.analyzedInstructions[0].steps.map((s) => s.step)).toEqual(['Bake it.'])
  })
})

describe('junk from scrapers', () => {
  it('spots page code, bot checks and cookie banners', () => {
    expect(looksLikeJunk('var _sf_async_config = {}; _sf_async_config.uid = 1234;')).toBe(true)
    expect(looksLikeJunk('Please enable JavaScript to continue')).toBe(true)
    expect(looksLikeJunk('Just a moment...')).toBe(true)
    expect(looksLikeJunk('Accept all cookies')).toBe(true)
    expect(looksLikeJunk('Preheat the oven to 350°F and grease a 9x13 pan (or two 8-inch pans).')).toBe(false)
    expect(looksLikeJunk('1 (14 oz) can diced tomatoes')).toBe(false)
  })

  it('rejects a scraped "recipe" that is all junk, and cleans one that is partly junk', () => {
    const junk = { title: 'Just a moment...', extendedIngredients: [{ original: 'function(){}' }] }
    expect(withoutJunk(junk)).toBeNull()
    const mixed = {
      title: 'Lasagna',
      extendedIngredients: [{ original: '1 lb ricotta', name: 'ricotta' }, { original: 'googletag.cmd.push(function() {})' }],
      analyzedInstructions: [{ steps: [{ number: 1, step: 'Layer it.' }, { number: 2, step: 'document.getElementById("x").remove();' }] }],
    }
    const cleaned = withoutJunk(mixed)
    expect(cleaned.extendedIngredients).toHaveLength(1)
    expect(cleaned.analyzedInstructions[0].steps).toEqual([{ number: 1, step: 'Layer it.' }])
  })

  it('recognizes a bot-check page', () => {
    expect(isBlockedPage('<html><head><title>Just a moment...</title>')).toBe(true)
    expect(isBlockedPage('<html><head><title>Easy Chili</title>')).toBe(false)
  })
})

describe('Pinterest pin links', () => {
  it('tells a pin link from a recipe link', () => {
    expect(isPinLink('https://www.pinterest.com/pin/123456789/')).toBe(true)
    expect(isPinLink('https://pin.it/3xYz')).toBe(true)
    expect(isPinLink('pinterest.com/pin/easy-chili--12345/')).toBe(true)
    expect(isPinLink('https://www.pinterest.com/marci/dinners/')).toBe(false)
    expect(isPinLink('https://www.allrecipes.com/recipe/1/chili/')).toBe(false)
  })
})
