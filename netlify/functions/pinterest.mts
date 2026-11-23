import type { Config, Context } from "@netlify/functions";

/**
 * Reads a public Pinterest board, without Pinterest's API (which needs an
 * approved developer app). Two public routes are tried in turn:
 *   1. the JSON behind Pinterest's embeddable board widget, which includes
 *      each pin's destination link (the recipe site);
 *   2. the board's RSS feed (board URL + ".rss"), which has the pins but
 *      usually not their destination, so those are looked up per pin.
 * Neither is documented by Pinterest, so both are best-effort: failures come
 * back as { error } with a reason the app can show.
 *
 *   GET /api/pinterest/board?url=<board link>  → { board, pins: [{ id, title, image, link, pinUrl }], source }
 *   GET /api/pinterest/pin?id=<pin id>          → { link }   (the pin's destination, or null)
 *   GET /api/pinterest/pin?url=<pin link>       → the same, from a pin link or pin.it short link
 */

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=300" },
  });

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
  Accept: "application/json, text/html, application/rss+xml, */*",
  "Accept-Language": "en-US,en;q=0.9",
};

const isPinterestHost = (host: string) => /(^|\.)pinterest\.[a-z.]+$/.test(host) || host === "pin.it";

/** "https://www.pinterest.com/marci/weeknight-dinners/" → { user, board }. Follows pin.it short links. */
async function parseBoard(raw: string): Promise<{ user: string; board: string } | null> {
  let url: URL;
  try {
    url = new URL(raw.trim().startsWith("http") ? raw.trim() : `https://${raw.trim()}`);
  } catch {
    return null;
  }
  if (!isPinterestHost(url.hostname)) return null;
  if (url.hostname === "pin.it") {
    const res = await fetch(url, { redirect: "follow", headers: HEADERS }).catch(() => null);
    if (!res) return null;
    url = new URL(res.url);
  }
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length < 2 || ["pin", "search", "ideas", "today"].includes(parts[0])) return null;
  return { user: parts[0], board: parts[1].replace(/\.rss$/, "") };
}

const decode = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .trim();

const external = (link: unknown) => {
  if (typeof link !== "string" || !link.startsWith("http")) return null;
  try {
    return isPinterestHost(new URL(link).hostname) ? null : link;
  } catch {
    return null;
  }
};

const pinTitle = (p: any) =>
  decode(String(p.title || p.grid_title || p.rich_metadata?.title || p.description || "Untitled pin"))
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 140);

/**
 * GET JSON from the widget API. It's served from two hosts, and both now and
 * then refuse a request that works a moment later, so each gets two tries.
 */
async function widgetJson(path: string) {
  let last = "widget failed";
  for (const host of ["widgets.pinterest.com", "api.pinterest.com", "widgets.pinterest.com"]) {
    try {
      const res = await fetch(`https://${host}${path}`, { headers: HEADERS, signal: AbortSignal.timeout(6000) });
      if (res.status === 404) throw Object.assign(new Error("widget 404"), { final: true });
      if (!res.ok) {
        last = `widget ${res.status}`;
        continue;
      }
      return await res.json();
    } catch (err) {
      if ((err as any).final) throw err;
      last = (err as Error).name === "TimeoutError" ? "widget timeout" : (err as Error).message || last;
    }
  }
  throw new Error(last);
}

async function fromWidget(user: string, board: string) {
  const data: any = await widgetJson(`/v3/pidgets/boards/${encodeURIComponent(user)}/${encodeURIComponent(board)}/pins/`);
  const pins: any[] = data?.data?.pins || [];
  if (!pins.length) throw new Error("widget empty");
  return {
    board: data?.data?.board?.name || board,
    pins: pins.map((p) => ({
      id: String(p.id),
      title: pinTitle(p),
      image: p.images?.["564x"]?.url || p.images?.["237x"]?.url || null,
      link: external(typeof p.link === "string" ? decode(p.link) : p.link),
      pinUrl: `https://www.pinterest.com/pin/${p.id}/`,
    })),
  };
}

async function fromRss(user: string, board: string) {
  const res = await fetch(`https://www.pinterest.com/${encodeURIComponent(user)}/${encodeURIComponent(board)}.rss`, {
    headers: HEADERS,
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) throw new Error(`rss ${res.status}`);
  const xml = await res.text();
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => m[1]);
  if (!items.length) throw new Error("rss empty");
  const tag = (item: string, name: string) => decode(item.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`))?.[1] || "");
  const channel = decode(xml.match(/<channel>[\s\S]*?<title>([\s\S]*?)<\/title>/)?.[1] || board);
  return {
    board: channel,
    pins: items.map((item) => {
      const pinUrl = tag(item, "link") || tag(item, "guid");
      const description = tag(item, "description");
      return {
        id: pinUrl.match(/\/pin\/([\w-]+)/)?.[1] || pinUrl,
        title: tag(item, "title") || description.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 140) || "Untitled pin",
        image: description.match(/<img[^>]+src="([^"]+)"/)?.[1] || null,
        link: null as string | null,
        pinUrl,
      };
    }),
  };
}

/** A pin's destination (the recipe site), via the widget pin endpoint, then the pin page itself. */
async function pinLink(id: string) {
  try {
    const data: any = await widgetJson(`/v3/pidgets/pins/info/?pin_ids=${encodeURIComponent(id)}`);
    const link = external(data?.data?.[0]?.link);
    if (link) return link;
  } catch {
    /* fall through */
  }
  const res = await fetch(`https://www.pinterest.com/pin/${encodeURIComponent(id)}/`, { headers: HEADERS, signal: AbortSignal.timeout(6000) });
  if (!res.ok) {
    console.log(`pinterest: pin page ${res.status}`);
    return null;
  }
  const html = await res.text();
  for (const m of html.matchAll(/"link"\s*:\s*"(https?:[^"]+)"/g)) {
    const link = external(JSON.parse(`"${m[1]}"`));
    if (link) return link;
  }
  return null;
}

export default async (req: Request, context: Context) => {
  if (req.method !== "GET") return json({ error: "method_not_allowed" }, 405);
  const what = context.params?.what;
  const inUrl = new URL(req.url);

  if (what === "pin") {
    let id = inUrl.searchParams.get("id") || "";
    // A pin link (pinterest.com/pin/123/ or a pin.it short link) instead of an id.
    const pinUrl = inUrl.searchParams.get("url");
    if (pinUrl) {
      try {
        let url = new URL(pinUrl);
        if (url.hostname === "pin.it") {
          const res = await fetch(url, { redirect: "follow", headers: HEADERS, signal: AbortSignal.timeout(6000) });
          url = new URL(res.url);
        }
        id = url.pathname.match(/\/pin\/(?:[^/]*--)?([\w-]+)/)?.[1] || "";
      } catch {
        id = "";
      }
    }
    if (!/^[\w-]{1,80}$/.test(id)) return json({ error: "bad_pin" }, 400);
    try {
      return json({ link: await pinLink(id) });
    } catch (err) {
      console.log(`pinterest: pin lookup failed: ${(err as Error).message}`);
      return json({ error: "unreachable" }, 502);
    }
  }

  if (what === "board") {
    const parsed = await parseBoard(inUrl.searchParams.get("url") || "");
    if (!parsed) return json({ error: "bad_board" }, 400);
    const reasons: string[] = [];
    for (const [source, read] of [
      ["widget", fromWidget],
      ["rss", fromRss],
    ] as const) {
      try {
        const result = await read(parsed.user, parsed.board);
        return json({ ...result, source });
      } catch (err) {
        reasons.push(String((err as Error).message));
      }
    }
    // A 404 from both means the board isn't public (or doesn't exist); anything else, Pinterest refused us.
    const notFound = reasons.every((r) => / 404$|empty$/.test(r));
    console.log(`pinterest: board not loaded: ${reasons.join("; ")}`);
    return json({ error: notFound ? "not_found" : "blocked", detail: reasons }, notFound ? 404 : 502);
  }

  return json({ error: "not_found" }, 404);
};

export const config: Config = {
  path: "/api/pinterest/:what",
};
