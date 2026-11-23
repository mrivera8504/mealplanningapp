import type { Config, Context } from "@netlify/functions";
import { isBlockedPage, recipeFromHtml, withoutJunk } from "../../src/lib/recipeFromPage.js";

const API_BASE = "https://api.spoonacular.com";

const hostOf = (raw: string) => {
  try {
    return new URL(raw).hostname;
  } catch {
    return "?";
  }
};

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
// Two browser-like header sets: some sites turn away one and let the other in.
const PAGE_HEADERS = [
  {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1",
  },
  {
    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
  },
];

/** Strip tracking junk Pinterest and social apps add, which some sites answer with a different page. */
function tidyUrl(raw: string) {
  const url = new URL(raw.trim());
  for (const key of [...url.searchParams.keys()]) {
    if (/^(utm_|fbclid|gclid|mc_|epik|_branch|igshid)/i.test(key)) url.searchParams.delete(key);
  }
  return url;
}

/**
 * The recipe a page publishes for search engines (schema.org JSON-LD), read
 * for free. `hint` (a pin's title, say) picks the right one on round-up pages
 * that hold several. Returns { recipe } or { reason } saying why not.
 */
async function readRecipePage(recipeUrl: string, hint: string) {
  let url: URL;
  try {
    url = tidyUrl(recipeUrl);
  } catch {
    return { reason: "bad_url" };
  }
  if (!/^https?:$/.test(url.protocol)) return { reason: "bad_url" };
  let reason = "fetch_failed";
  for (const headers of PAGE_HEADERS) {
    try {
      const res = await fetch(url, { headers, redirect: "follow", signal: AbortSignal.timeout(7000) });
      const html = await res.text();
      if (!res.ok || isBlockedPage(html)) {
        reason = isBlockedPage(html) ? "blocked" : `http_${res.status}`;
        continue; // try the other header set
      }
      const recipe = recipeFromHtml(html, res.url || url.toString(), hint);
      if (recipe) return { recipe };
      return { reason: "no_recipe_block" };
    } catch (err) {
      reason = (err as Error).name === "TimeoutError" ? "timeout" : "fetch_failed";
    }
  }
  return { reason };
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
    // Only the site's host goes in the log -- enough to see which sites fail and why.
    console.log(`import: page not read (${pageReason}) host=${hostOf(recipeUrl)}`);
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

  let data = await res.json();
  if (id === "extract") {
    // Spoonacular scrapes the page itself, and on a site that blocks it or
    // builds the page with scripts it returns whatever text it found -- page
    // code, cookie banners. Keep only a real recipe.
    data = withoutJunk(data);
    if (!data) {
      console.log(`import: spoonacular returned no usable recipe (page: ${pageReason}) host=${hostOf(inUrl.searchParams.get("url") || "")}`);
      return json({ error: "unreadable", page: pageReason || undefined }, 422);
    }
  }
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
