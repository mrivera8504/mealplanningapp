import type { Config, Context } from "@netlify/functions";
import { recipeFromHtml } from "../../src/lib/recipeFromPage.js";

const API_BASE = "https://api.spoonacular.com";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/**
 * Proxy for Spoonacular so the API key never reaches the client.
 *   GET /api/recipes?query=…&cuisine=…&diet=…&type=…&includeIngredients=…
 *   GET /api/recipes/:id            → full recipe information (with nutrition)
 *   GET /api/recipes/random         → 10 random dinners (no nutrition: ~1.1 points;
 *                                     the client caches the batch for a week)
 *   GET /api/recipes/extract?url=…  → a recipe from a web page: the page's own
 *                                     recipe block if it has one (free), else Spoonacular
 */
const PAGE_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml",
  "Accept-Language": "en-US,en;q=0.9",
};

/**
 * The recipe a page publishes for search engines (schema.org JSON-LD), read
 * for free. `hint` (a pin's title, say) picks the right one on round-up pages
 * that hold several. Returns { recipe } or { reason } saying why not.
 */
async function readRecipePage(recipeUrl: string, hint: string) {
  try {
    const url = new URL(recipeUrl);
    if (!/^https?:$/.test(url.protocol)) return { reason: "bad_url" };
    const res = await fetch(url, { headers: PAGE_HEADERS, redirect: "follow", signal: AbortSignal.timeout(8000) });
    if (!res.ok) return { reason: `http_${res.status}` };
    const recipe = recipeFromHtml(await res.text(), res.url || recipeUrl, hint);
    return recipe ? { recipe } : { reason: "no_recipe_block" };
  } catch (err) {
    return { reason: (err as Error).name === "TimeoutError" ? "timeout" : "fetch_failed" };
  }
}

export default async (req: Request, context: Context) => {
  let pageReason = ""; // why the page itself couldn't be read, reported alongside a fallback
  // Importing from a link reads the page itself first; Spoonacular (which
  // costs quota) is only asked when the page has no recipe block.
  if (context.params?.id === "extract" && req.method === "GET") {
    const recipeUrl = new URL(req.url).searchParams.get("url");
    if (!recipeUrl) return json({ error: "missing_url" }, 400);
    const page = await readRecipePage(recipeUrl, new URL(req.url).searchParams.get("hint") || "");
    if (page.recipe) return json(page.recipe);
    pageReason = page.reason;
  }

  const apiKey = Netlify.env.get("SPOONACULAR_API_KEY");
  if (!apiKey) {
    return json({ error: "not_configured" }, 503);
  }
  if (req.method !== "GET") {
    return json({ error: "method_not_allowed" }, 405);
  }

  const id = context.params?.id;
  const inUrl = new URL(req.url);
  let upstream: URL;

  if (id === "random") {
    upstream = new URL(`${API_BASE}/recipes/random`);
    upstream.searchParams.set("number", "10");
    upstream.searchParams.set("include-tags", "main course");
    upstream.searchParams.set("includeNutrition", "false");
  } else if (id === "extract") {
    const recipeUrl = inUrl.searchParams.get("url");
    if (!recipeUrl) return json({ error: "missing_url" }, 400);
    upstream = new URL(`${API_BASE}/recipes/extract`);
    upstream.searchParams.set("url", recipeUrl);
    upstream.searchParams.set("forceExtraction", "true");
    upstream.searchParams.set("analyze", "true");
    upstream.searchParams.set("includeNutrition", "true");
  } else if (id) {
    if (!/^\d+$/.test(id)) return json({ error: "bad_id" }, 400);
    upstream = new URL(`${API_BASE}/recipes/${id}/information`);
    upstream.searchParams.set("includeNutrition", "true");
  } else {
    upstream = new URL(`${API_BASE}/recipes/complexSearch`);
    const allowed = ["query", "cuisine", "diet", "type", "includeIngredients", "maxReadyTime", "offset", "sort", "sortDirection"];
    for (const key of allowed) {
      const value = inUrl.searchParams.get(key);
      if (value) upstream.searchParams.set(key, value.slice(0, 200));
    }
    upstream.searchParams.set("number", "12");
    upstream.searchParams.set("addRecipeInformation", "true");
    upstream.searchParams.set("fillIngredients", "true");
    upstream.searchParams.set("instructionsRequired", "true");
  }

  upstream.searchParams.set("apiKey", apiKey);

  const res = await fetch(upstream.toString());
  if (res.status === 402) return json({ error: "quota_exceeded", page: pageReason || undefined }, 402);
  if (!res.ok) return json({ error: "upstream_error", status: res.status }, 502);

  const data = await res.json();
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      // Random results must never be served from cache, or every refill would repeat the last one.
      "Cache-Control": id === "random" || inUrl.searchParams.get("sort") === "random" ? "no-store" : "public, max-age=300",
    },
  });
};

export const config: Config = {
  path: ["/api/recipes", "/api/recipes/:id", "/api/recipes/extract", "/api/recipes/random"],
};
