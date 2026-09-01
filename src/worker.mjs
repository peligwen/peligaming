// gaming.peliglot.com worker: serves the static tools, and proxies the OSRS
// data APIs under /api/osrs/* so the whole site shares ONE edge cache —
// fifty open tabs cost the upstream one request per cache window instead of
// fifty — and so requests carry the descriptive User-Agent the wiki asks
// for (browsers can't send one). Jagex's own endpoints (hiscores) send no
// CORS headers at all, so for those the proxy is the only way in.

// The wiki now documents /api/v2/osrs as the primary base (timeseries there
// takes lookback= instead of timestep=); v1 still serves and the clients
// speak v1, so migrate here — behind this one seam — when v1 sunsets.
const UPSTREAM = "https://prices.runescape.wiki/api/v1/osrs";
// The official in-game guide prices, mirrored daily by the wiki as one bulk
// JSON module — a different upstream and cadence than the real-time API.
const OFFICIAL = "https://oldschool.runescape.wiki/w/Module:GEPrices/data.json?action=raw";
// Jagex's public hiscores (per-player level and xp by skill; no auth exists).
const HISCORES = "https://secure.runescape.com/m=hiscore_oldschool/index_lite.json";
const UA = "flip-desk edge proxy @ gaming.peliglot.com (shared cache for all site visitors)";

// per-endpoint edge-cache TTLs (seconds), matched to how often the data moves
const ENDPOINTS = new Map([
  ["latest", 60],
  ["5m", 300],
  ["1h", 900],
  ["volumes", 3600],
  ["mapping", 86400],
  ["timeseries", 600],
  ["official", 21600], // the guide price updates roughly daily
  ["hiscores", 600],   // levels move slowly; keeps lookups off Jagex's back
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

  // pass through only the query params each upstream actually takes
  let upstream;
  if (ep === "official") {
    upstream = OFFICIAL;
  } else if (ep === "hiscores") {
    // OSRS names: 1–12 chars of letters, digits, spaces, hyphens, underscores.
    // Lowercased with collapsed spaces so every spelling shares one cache entry.
    const raw = (url.searchParams.get("player") || "").trim().replace(/\s+/g, " ");
    if (!/^[\w -]{1,12}$/.test(raw)) return new Response("bad player name", { status: 400 });
    upstream = `${HISCORES}?player=${encodeURIComponent(raw.toLowerCase())}`;
  } else {
    const qs = new URLSearchParams();
    for (const k of ["timestep", "id"]) {
      const v = url.searchParams.get(k);
      if (v != null && /^[\w-]{1,32}$/.test(v)) qs.set(k, v);
    }
    upstream = `${UPSTREAM}/${ep}${qs.toString() ? "?" + qs : ""}`;
  }

  const cache = caches.default;
  const cacheKey = new Request(upstream); // one shared entry per endpoint+params
  let res = await cache.match(cacheKey);
  if (!res) {
    const up = await fetch(upstream, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      cf: { cacheTtl: ttl, cacheEverything: true },
    });
    // a hiscores 404 is an answer (no such player), not an upstream failure
    if (up.status === 404 && ep === "hiscores") return new Response("player not found", { status: 404 });
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
