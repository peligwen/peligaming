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
  ["24h", 300],   // daily OHLC block; short default covers today's still-filling
                   // day — a *complete* past day gets a long TTL below instead.
                   // Undocumented: works on both v1 and v2 but isn't on the
                   // wiki's published endpoint list, so it could move/vanish.
  ["volumes", 3600],
  ["mapping", 86400],
  ["timeseries", 900],
  ["official", 21600], // the guide price updates roughly daily
  ["hiscores", 600],   // levels move slowly; keeps lookups off Jagex's back
]);

// timestamp-bucketed endpoints: how long a block covers, keyed the same as
// ENDPOINTS. A request naming a block that's fully elapsed (timestamp+period
// <= now) is asking for history that will never change again, so it earns a
// far longer cache than the endpoint's default (which has to stay short to
// catch a still-open block being revised).
const PERIOD = { "24h": 86400, "1h": 3600, "5m": 300 };
const LONG_TTL = { "24h": 604800, "1h": 86400, "5m": 86400 }; // 7d, 1d, 1d

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
  let ttl = ENDPOINTS.get(ep);
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
    const tsRaw = url.searchParams.get("timestamp");
    let timestamp = null;
    if (tsRaw != null) {
      if (!/^\d{1,12}$/.test(tsRaw)) return new Response("bad timestamp", { status: 400 });
      timestamp = Number(tsRaw);
      qs.set("timestamp", tsRaw);
    }
    // 24h only serves whole UTC days; a misaligned timestamp is a client
    // bug worth a clear 400 rather than a wasted upstream round trip (the
    // API itself 400s here too, so we're just failing the same way sooner).
    if (ep === "24h" && timestamp != null && timestamp % 86400 !== 0) {
      return new Response("timestamp must be divisible by 86400", { status: 400 });
    }
    const period = PERIOD[ep];
    if (timestamp != null && period != null && timestamp + period <= Math.floor(Date.now() / 1000)) {
      ttl = LONG_TTL[ep];
    }
    upstream = `${UPSTREAM}/${ep}${qs.toString() ? "?" + qs : ""}`;
  }

  const cache = caches.default;
  const cacheKey = new Request(upstream); // one shared entry per endpoint+params
  let res = await cache.match(cacheKey);
  if (!res) {
    // the fetch layer caches too, and it can't see inside the body — so a
    // daily block only ever gets the short TTL there; the long-lived entry
    // for a finished day is the explicit cache.put below, after the check
    const up = await fetch(upstream, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      cf: { cacheTtl: ep === "24h" ? ENDPOINTS.get("24h") : ttl, cacheEverything: true },
    });
    // a hiscores 404 is an answer (no such player), not an upstream failure
    if (up.status === 404 && ep === "hiscores") return new Response("player not found", { status: 404 });
    if (!up.ok) return new Response("upstream " + up.status, { status: 502 });

    if (ep === "24h") {
      // only ~380KB and only ever parsed on a cache miss — cheap enough to
      // look inside and see whether the wiki has actually filled this day
      // in yet. Today's (still-open) day comes back 200 with data: {}, and
      // that emptiness is exactly what we must never bake into a 7-day cache
      // entry — the wiki backfills it over the next day or two.
      const text = await up.text();
      let day = null;
      try { day = JSON.parse(text).data; } catch { /* treat as empty below */ }
      const empty = !day || Object.keys(day).length === 0;
      const cacheTtl = empty ? ENDPOINTS.get("24h") : ttl;
      res = new Response(text, {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": `public, max-age=${cacheTtl}`,
          "Access-Control-Allow-Origin": "*",
        },
      });
      if (!empty) ctx.waitUntil(cache.put(cacheKey, res.clone()));
    } else {
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
  }
  return res;
}
