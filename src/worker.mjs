// gaming.peliglot.com worker: serves the static tools, and proxies the OSRS
// Wiki price API under /api/osrs/* so the whole site shares ONE edge cache —
// fifty open tabs cost the wiki one upstream request per cache window instead
// of fifty — and so requests carry the descriptive User-Agent the wiki asks
// for (browsers can't send one).

const UPSTREAM = "https://prices.runescape.wiki/api/v1/osrs";
const UA = "flip-desk edge proxy @ gaming.peliglot.com (shared cache for all site visitors)";

// per-endpoint edge-cache TTLs (seconds), matched to how often the data moves
const ENDPOINTS = new Map([
  ["latest", 60],
  ["5m", 300],
  ["1h", 900],
  ["volumes", 3600],
  ["mapping", 86400],
  ["timeseries", 600],
]);

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/api/osrs/")) return osrs(req, url, ctx);
    return env.ASSETS.fetch(req);
  },
};

async function osrs(req, url, ctx) {
  if (req.method !== "GET") return new Response("GET only", { status: 405 });
  const ep = url.pathname.slice("/api/osrs/".length);
  const ttl = ENDPOINTS.get(ep);
  if (ttl == null) return new Response("unknown endpoint", { status: 404 });

  // pass through only the query params the wiki API actually takes
  const qs = new URLSearchParams();
  for (const k of ["timestep", "id"]) {
    const v = url.searchParams.get(k);
    if (v != null && /^[\w-]{1,32}$/.test(v)) qs.set(k, v);
  }
  const upstream = `${UPSTREAM}/${ep}${qs.toString() ? "?" + qs : ""}`;

  const cache = caches.default;
  const cacheKey = new Request(upstream); // one shared entry per endpoint+params
  let res = await cache.match(cacheKey);
  if (!res) {
    const up = await fetch(upstream, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      cf: { cacheTtl: ttl, cacheEverything: true },
    });
    if (!up.ok) return new Response("upstream " + up.status, { status: 502 });
    res = new Response(up.body, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": `public, max-age=${ttl}`,
        "Access-Control-Allow-Origin": "*",
      },
    });
    ctx.waitUntil(cache.put(cacheKey, res.clone()));
  }
  return res;
}
