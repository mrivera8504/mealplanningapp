import type { Config, Context } from "@netlify/functions";

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
 */
export default async (req: Request, context: Context) => {
  const apiKey = Netlify.env.get("SPOONACULAR_API_KEY");
  if (!apiKey) {
    return json({ error: "not_configured" }, 503);
  }
  if (req.method !== "GET") {
    return json({ error: "method_not_allowed" }, 405);
  }

  const id = context.params?.id;
  let upstream: URL;

  if (id) {
    if (!/^\d+$/.test(id)) return json({ error: "bad_id" }, 400);
    upstream = new URL(`${API_BASE}/recipes/${id}/information`);
    upstream.searchParams.set("includeNutrition", "true");
  } else {
    const inUrl = new URL(req.url);
    upstream = new URL(`${API_BASE}/recipes/complexSearch`);
    const allowed = ["query", "cuisine", "diet", "type", "includeIngredients", "maxReadyTime", "offset"];
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
  if (res.status === 402) return json({ error: "quota_exceeded" }, 402);
  if (!res.ok) return json({ error: "upstream_error", status: res.status }, 502);

  const data = await res.json();
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=300",
    },
  });
};

export const config: Config = {
  path: ["/api/recipes", "/api/recipes/:id"],
};
