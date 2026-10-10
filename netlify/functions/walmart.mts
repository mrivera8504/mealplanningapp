import type { Config, Context } from "@netlify/functions";
import { createPrivateKey, createSign } from "node:crypto";

const API_BASE = "https://developer.api.walmart.com/api-proxy/service/affil/product/v2";

const json = (body: unknown, status = 200, cache = "no-store") =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": cache },
  });

/** Accepts a PEM (with real or escaped newlines) or a bare base64 PKCS#8 body. */
function loadKey(raw: string) {
  let pem = raw.replace(/\\n/g, "\n").trim();
  if (!pem.includes("BEGIN")) {
    const body = pem.replace(/\s+/g, "").match(/.{1,64}/g)?.join("\n") ?? "";
    pem = `-----BEGIN PRIVATE KEY-----\n${body}\n-----END PRIVATE KEY-----`;
  }
  return createPrivateKey(pem);
}

/**
 * Walmart's affiliate API authenticates each request with an RSA-SHA256
 * signature over the consumer id, timestamp and key version (sorted by
 * header name, each newline-terminated).
 */
function authHeaders(consumerId: string, keyVersion: string, privateKey: string) {
  const timestamp = Date.now().toString();
  const signer = createSign("RSA-SHA256");
  signer.update(`${consumerId}\n${timestamp}\n${keyVersion}\n`);
  return {
    "WM_CONSUMER.ID": consumerId,
    "WM_CONSUMER.INTIMESTAMP": timestamp,
    "WM_SEC.KEY_VERSION": keyVersion,
    "WM_SEC.AUTH_SIGNATURE": signer.sign(loadKey(privateKey), "base64"),
  };
}

// deno-lint-ignore no-explicit-any
function normalizeItem(item: any) {
  return {
    itemId: String(item.itemId),
    name: item.name,
    price: item.salePrice ?? item.msrp ?? null,
    size: item.size || null,
    image: item.thumbnailImage || item.mediumImage || null,
    available: item.stock ? item.stock !== "Not available" : item.availableOnline !== false,
  };
}

/**
 * Proxy for the Walmart affiliate product API so credentials stay server-side.
 *   GET /api/walmart/search?q=…   → up to 10 products
 *   GET /api/walmart/item/:id     → one product (used to fill in a pasted link)
 */
export default async (req: Request, context: Context) => {
  const consumerId = Netlify.env.get("WALMART_CONSUMER_ID");
  const privateKey = Netlify.env.get("WALMART_PRIVATE_KEY");
  const keyVersion = Netlify.env.get("WALMART_KEY_VERSION") || "1";
  const publisherId = Netlify.env.get("WALMART_PUBLISHER_ID");
  if (!consumerId || !privateKey) return json({ error: "not_configured" }, 503);
  if (req.method !== "GET") return json({ error: "method_not_allowed" }, 405);

  const id = context.params?.id;
  let upstream: URL;
  if (id) {
    if (!/^\d+$/.test(id)) return json({ error: "bad_id" }, 400);
    upstream = new URL(`${API_BASE}/items/${id}`);
  } else {
    const q = new URL(req.url).searchParams.get("q")?.trim();
    if (!q) return json({ error: "missing_query" }, 400);
    upstream = new URL(`${API_BASE}/search`);
    upstream.searchParams.set("query", q.slice(0, 120));
    upstream.searchParams.set("numItems", "10");
  }
  if (publisherId) upstream.searchParams.set("publisherId", publisherId);

  let headers: Record<string, string>;
  try {
    headers = authHeaders(consumerId, keyVersion, privateKey);
  } catch {
    return json({ error: "bad_key" }, 500);
  }

  const res = await fetch(upstream.toString(), { headers: { ...headers, Accept: "application/json" } });
  if (res.status === 429) return json({ error: "rate_limited" }, 429);
  if (res.status === 404) return json({ error: "not_found" }, 404);
  if (!res.ok) return json({ error: "upstream_error", status: res.status }, 502);

  const data = await res.json();
  const body = id ? { item: normalizeItem(data) } : { items: (data.items || []).map(normalizeItem) };
  return json(body, 200, "public, max-age=3600");
};

export const config: Config = {
  path: ["/api/walmart/search", "/api/walmart/item/:id"],
};
