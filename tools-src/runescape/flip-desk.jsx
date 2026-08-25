import React, { useState, useEffect, useMemo, useCallback } from "react";
import RECIPES from "./recipes.json";
import SNAPSHOT from "./flip-desk-snapshot.json";

/* baked snapshot lives in flip-desk-snapshot.json — v1 rows are raw prints,
   v2 rows (scripts/capture-snapshot.mjs) carry tape-averaged pricing */

const API = "https://prices.runescape.wiki/api/v1/osrs";
const SNAP_DATE = new Date(SNAPSHOT.ts * 1000);

/* ================= GE mechanics ================= */
// 2% tax on the sale price of each item, rounded down, capped at 5m/item.
// Items that sell below 50 gp are exempt — the classic penny-flipper edge.
// Old School Bonds (13190) are exempt outright.
const TAX_EXEMPT_IDS = new Set([13190]);
const geTax = (sell, id) => (sell < 50 || TAX_EXEMPT_IDS.has(id) ? 0 : Math.min(Math.floor(sell * 0.02), 5_000_000));

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* ================= formatting ================= */
const fmtGp = (n) => {
  if (n == null || isNaN(n)) return "–";
  const neg = n < 0 ? "-" : "";
  const x = Math.abs(n);
  if (x >= 1e9) return neg + (x / 1e9).toFixed(x >= 1e10 ? 1 : 2) + "b";
  if (x >= 1e6) return neg + (x / 1e6).toFixed(x >= 1e7 ? 1 : 2) + "m";
  if (x >= 10000) return neg + (x / 1000).toFixed(1) + "k";
  return neg + Math.round(x).toLocaleString();
};
const fmtFull = (n) => (n == null ? "–" : Math.round(n).toLocaleString());
const fmtQty = (n) => {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "m";
  if (n >= 10000) return (n / 1000).toFixed(0) + "k";
  return Math.round(n).toLocaleString();
};
const agoStr = (min) => {
  if (min < 1) return "<1m ago";
  if (min < 60) return Math.round(min) + "m ago";
  if (min < 1440) return (min / 60).toFixed(1) + "h ago";
  return (min / 1440).toFixed(1) + "d ago";
};
// duration in hours -> compact human string
const fmtDur = (h) => {
  if (h == null || !isFinite(h)) return "never";
  const m = h * 60;
  if (m < 1) return "under a minute";
  if (m < 60) return Math.round(m) + " min";
  if (h < 48) return (h < 10 ? +h.toFixed(1) : Math.round(h)) + " hr";
  return Math.round(h / 24) + " days";
};
const fmtDurShort = (h) => {
  if (h == null || !isFinite(h)) return "—";
  const m = h * 60;
  if (m < 1) return "<1 min";
  if (m < 60) return Math.round(m) + " min";
  if (h < 48) return (h < 10 ? h.toFixed(1) : Math.round(h)) + " hr";
  return Math.round(h / 24) + " days";
};
// colour a fill-time: fast fills green, slow fills red
const durClass = (h) => (!isFinite(h) ? "bad" : h <= 0.25 ? "good" : h <= 2 ? "" : h <= 8 ? "warn" : "bad");

/* ================= data shaping ================= */
/* v2 rows (capture-snapshot.mjs): [id,name,limit,members,low,high,hvLo,hvHi,
   lastLow,lastHigh,staleLo,staleHi,dv,is5m] — tape-averaged pricing, baked.
   v1 rows: raw prints and combined flow — the lowest confidence there is.
   Either way a snapshot is old news, so every row is graded C. */
const rowToItem = (r) => SNAPSHOT.version === 2
  ? {
      id: r[0], name: r[1], limit: r[2], members: !!r[3],
      low: r[4], high: r[5], hv: r[6] + r[7], hvLo: r[6], hvHi: r[7],
      lastLow: r[8], lastHigh: r[9], staleLo: r[10], staleHi: r[11],
      crossed: r[8] != null && r[9] != null && r[9] < r[8],
      dv: r[12], tier: "C", src: r[13] ? "snap5m" : "snap1h",
    }
  : {
      id: r[0], name: r[1], limit: r[2], members: !!r[3],
      low: r[4], high: r[5], hv: r[6], dv: r[7],
      // v1 stores combined hourly flow; assume an even split
      hvLo: r[6] / 2, hvHi: r[6] / 2,
      staleHi: r[9], staleLo: r[9],
      lastLow: r[4], lastHigh: r[5], crossed: false, tier: "C", src: "prints",
    };
const BASE_ITEMS = SNAPSHOT.items.map(rowToItem);

/* ================= fill-time model =================
   The GE queue is price-time priority. At the touch (buy at the insta-sell
   price, sell at the insta-buy price) you sit behind everyone already quoted
   there — assume you capture ~25% of the counter-flow. Stepping even 1 gp
   inside the spread jumps the whole queue at that price, so capture leaps;
   deeper steps only outbid other steppers, so it tops out near 60%.
   Your buy order fills from insta-sellers (hvLo), your sell from insta-buyers (hvHi). */
const SHARE_TOUCH = 0.25;
const shareOf = (step, maxStep) =>
  step <= 0 ? SHARE_TOUCH : 0.5 + 0.1 * (maxStep > 0 ? step / maxStep : 1);

const maxStepOf = (it) => Math.max(0, Math.floor((it.high - it.low - 1) / 2));

/* one priced order pair: step gp inside the spread on each side, qty units */
function quoteOrders(it, step, qty) {
  const maxStep = maxStepOf(it);
  step = clamp(step, 0, maxStep);
  const buyP = it.low + step;
  const sellP = it.high - step;
  const tax = geTax(sellP, it.id);
  const margin = sellP - buyP - tax;
  const roi = buyP > 0 ? (margin / buyP) * 100 : 0;
  const share = clamp(shareOf(step, maxStep), 0.05, 0.95);
  const buyRate = it.hvLo * share;   // units/hour your buy offer absorbs
  const sellRate = it.hvHi * share;
  const q = clamp(Math.round(qty) || 1, 1, it.limit);
  const tBuyH = buyRate > 0 ? Math.max(q / buyRate, 1 / 60) : Infinity;
  const tSellH = sellRate > 0 ? Math.max(q / sellRate, 1 / 60) : Infinity;
  return {
    step, maxStep, buyP, sellP, tax, margin, roi, share, buyRate, sellRate,
    qty: q, tBuyH, tSellH, cycleH: tBuyH + tSellH,
    cost: q * buyP, back: q * (sellP - tax), profit: q * margin,
  };
}

/* touch-price stats for the board: margin, ROI, and the round trip for a full limit */
function assess(it) {
  const tax = geTax(it.high, it.id);
  const margin = it.high - it.low - tax;
  const roi = it.low > 0 ? (margin / it.low) * 100 : 0;
  const bR = it.hvLo * SHARE_TOUCH, sR = it.hvHi * SHARE_TOUCH;
  const flipH = (bR > 0 ? it.limit / bR : Infinity) + (sR > 0 ? it.limit / sR : Infinity);
  return { ...it, tax, margin, roi, flipH };
}

/* ================= api citizenship =================
   The wiki's price API is a free community service run for RuneLite users.
   This board is deliberately polite with it:
   - every endpoint is cached at its natural update cadence (latest ~1min,
     5m blocks every 5min, 1h refreshed 15min, volumes hourly, mapping ~weekly)
   - concurrent callers share a single in-flight request
   - errors back off exponentially PER ENDPOINT, serving stale data meanwhile
   - a hidden tab never polls; the refresh button can't bust the cache      */
const TTL = {
  latest: 85_000, "5m": 300_000, "1h": 900_000,
  volumes: 3_600_000, mapping: 7 * 86_400_000,
};
const memCache = new Map();   // path -> {ts, data}
const inflight = new Map();   // path -> Promise
const cooloff = new Map();    // kind -> {streak, until}

// Served from the site, requests go through our own /api/osrs proxy: one shared
// Cloudflare edge cache for every visitor, and a descriptive User-Agent for the
// wiki. Anywhere else (file://, previews) — or if the proxy misbehaves — fall
// back to the wiki directly.
let apiBase =
  typeof location !== "undefined" && /^https?:$/.test(location.protocol) ? "/api/osrs" : API;

async function apiGet(kind, path) {
  const ttl = TTL[kind] ?? 300_000;
  const hit = memCache.get(path);
  if (hit && Date.now() - hit.ts < ttl) return hit.data;
  const cool = cooloff.get(kind);
  if (cool && Date.now() < cool.until) {
    if (hit) return hit.data;               // stale beats hammering a hurting API
    throw new Error("cooling off");
  }
  if (inflight.has(path)) return inflight.get(path);
  const one = async (base) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10_000);
    try {
      const res = await fetch(base + path, { signal: ctrl.signal, headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error("HTTP " + res.status);
      return await res.json();
    } finally { clearTimeout(t); }
  };
  const p = (async () => {
    try {
      let data;
      try {
        data = await one(apiBase);
      } catch (e) {
        if (apiBase === API) throw e;
        apiBase = API;                       // proxy unavailable — go direct from now on
        data = await one(API);
      }
      cooloff.delete(kind);
      memCache.set(path, { ts: Date.now(), data });
      return data;
    } catch (e) {
      const streak = (cooloff.get(kind)?.streak || 0) + 1;
      cooloff.set(kind, { streak, until: Date.now() + Math.min(45_000 * 2 ** (streak - 1), 900_000) });
      if (hit) return hit.data;
      throw e;
    } finally { inflight.delete(path); }
  })();
  inflight.set(path, p);
  return p;
}

/* the full tradeable universe from /mapping, slimmed and cached ~weekly */
async function loadUniverse() {
  const LS = "fd:universe-v1";
  try {
    const j = JSON.parse(localStorage.getItem(LS));
    if (j && Date.now() - j.ts < TTL.mapping && j.items?.length > 500) return j.items;
  } catch (e) { /* no storage / stale — refetch */ }
  try {
    const map = await apiGet("mapping", "/mapping");
    if (!Array.isArray(map) || map.length < 500) return null;
    const items = map
      .filter((m) => m.id != null && m.name && m.limit > 0)
      .map((m) => ({ id: m.id, name: m.name, limit: m.limit, members: !!m.members }));
    try { localStorage.setItem(LS, JSON.stringify({ ts: Date.now(), items })); } catch (e) {}
    return items;
  } catch (e) { return null; }
}

/* ================= pricing =================
   The two /latest prints are asynchronous last trades, not a fillable two-way
   quote — one bot dump, bait print or impatient buyer skews them for everyone
   reading the feed. So the board prices every row from windowed VOLUME-WEIGHTED
   AVERAGES instead: the 5-minute window when both sides traded meaningfully,
   falling back to the 1-hour window; raw prints only date the row. Books the
   averages can't price honestly stay off the board and are counted:
   - one-sided: a side with no traded average (an offer there just sits)
   - crossed averages: buy avg above sell avg — the price is in motion
   - dislocated: a wide spread on a busy book; real competition would have
     closed it, so it's a data artifact or a knife, not an opportunity      */
async function pullLive() {
  const [latest, h1, vols, uni] = await Promise.all([
    apiGet("latest", "/latest"),
    apiGet("1h", "/1h"),
    apiGet("volumes", "/volumes"),
    loadUniverse(),
  ]);
  let m5 = null;
  try { m5 = await apiGet("5m", "/5m"); } catch (e) { /* 1h pricing covers */ }
  const meta = uni || BASE_ITEMS;      // no mapping? fall back to the baked classics
  const now = Math.floor(Date.now() / 1000);
  const items = [];
  const hidden = { oneSided: 0, crossedAvg: 0, dislocated: 0 };
  for (const base of meta) {
    const p = latest.data?.[base.id];
    const h = h1.data?.[base.id] || {};
    const f = m5?.data?.[base.id] || {};
    // highPriceVolume = trades at insta-buy (fills YOUR sell offer); lowPriceVolume = insta-sells (fills YOUR buy offer)
    const hvHi = h.highPriceVolume || 0;
    const hvLo = h.lowPriceVolume || 0;
    if (!p && !hvHi && !hvLo) continue; // nothing traded at all — not a market
    const ok5 = f.avgLowPrice && f.avgHighPrice && (f.lowPriceVolume || 0) >= 5 && (f.highPriceVolume || 0) >= 5;
    const ok1 = h.avgLowPrice && h.avgHighPrice && hvLo >= 1 && hvHi >= 1;
    if (!ok5 && !ok1) { hidden.oneSided++; continue; }
    // GE orders are whole gp — round the averages to enterable prices
    const low = Math.round(ok5 ? f.avgLowPrice : h.avgLowPrice);
    const high = Math.round(ok5 ? f.avgHighPrice : h.avgHighPrice);
    if (high < low) { hidden.crossedAvg++; continue; }
    const dv = vols.data?.[base.id] ?? 0;
    const spreadPct = low > 0 ? ((high - low) / low) * 100 : 0;
    if (high >= 50 && spreadPct > 10 && dv > 20_000) { hidden.dislocated++; continue; }
    // raw prints date the row and flag disagreement — they never price it
    const staleHi = p?.highTime ? Math.round((now - p.highTime) / 60) : 999;
    const staleLo = p?.lowTime ? Math.round((now - p.lowTime) / 60) : 999;
    const crossed = !!(p && p.high && p.low && p.high < p.low);
    const stale = Math.max(staleHi, staleLo);
    const tier = crossed || stale > 60 ? "C" : ok5 && stale <= 15 ? "A" : "B";
    items.push({
      id: base.id, name: base.name, limit: base.limit, members: base.members,
      low, high, hv: hvHi + hvLo, hvHi, hvLo,
      lastLow: p?.low ?? null, lastHigh: p?.high ?? null, crossed,
      dv, staleHi, staleLo, tier, src: ok5 ? "5m" : "1h",
    });
  }
  if (items.length < 20) throw new Error("thin response");
  return { items, universe: !!uni, hidden };
}

/* ================= styles — old-school interface ================= */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700&display=swap');
.ge-root {
  --stone:#3e3529; --stone-hi:#554a38; --stone-lo:#241f18; --edge:#0d0b08;
  --inset:#2b2620; --inset2:#211d17;
  --orange:#ff981f; --yellow:#ffe93f; --white:#f3ecdc; --tan:#b3a284; --dark-tan:#8a7a5f;
  --good:#57d957; --warn:#e8b13c; --bad:#f26060;
  --mono:ui-monospace,'Cascadia Code','SF Mono',Menlo,Consolas,monospace;
  --disp:'Cinzel',Georgia,'Times New Roman',serif;
  background:#1b1712; color:var(--white); min-height:100vh;
  font-family:'Segoe UI',system-ui,-apple-system,Roboto,sans-serif;
  font-size:14px; line-height:1.45;
}
.ge-root *, .ge-root *::before, .ge-root *::after { box-sizing:border-box; }
.ge-wrap { max-width:1020px; margin:0 auto; padding:18px 14px 48px; }
.ge-shadow { text-shadow:1px 1px 0 #000; }

/* the classic beveled stone panel */
.ge-panel {
  background:var(--stone);
  border:1px solid var(--edge); border-radius:2px;
  box-shadow:inset 1px 1px 0 var(--stone-hi), inset -1px -1px 0 var(--stone-lo);
  padding:12px 14px; margin-bottom:12px;
}
.ge-inset {
  background:var(--inset);
  border:1px solid var(--edge); border-radius:2px;
  box-shadow:inset 1px 1px 0 #1a1712, inset -1px -1px 0 #38322a;
}

/* masthead */
.ge-mast { display:flex; align-items:flex-end; justify-content:space-between; gap:10px; flex-wrap:wrap; margin-bottom:10px; }
.ge-title { font-family:var(--disp); font-weight:700; font-size:clamp(24px,4.5vw,36px); letter-spacing:.05em;
  color:var(--orange); margin:0; line-height:1.05; text-shadow:2px 2px 0 #000; }
.ge-sub { font-size:12.5px; color:var(--tan); margin:4px 0 0; letter-spacing:.14em; text-transform:uppercase; text-shadow:1px 1px 0 #000; }
.ge-rule { height:2px; border:none; margin:0 0 14px;
  background:linear-gradient(90deg,transparent,#8a6f3d 10%,var(--orange) 50%,#8a6f3d 90%,transparent); }
.ge-status { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.ge-chip { display:inline-flex; align-items:center; gap:6px; font-family:var(--mono); font-size:11px; letter-spacing:.1em;
  padding:4px 10px; border:1px solid var(--edge); border-radius:2px; background:var(--inset); white-space:nowrap;
  box-shadow:inset 1px 1px 0 #1a1712; }
.ge-chip.live { color:var(--good); }
.ge-chip.snap { color:var(--warn); }
.ge-chip.load { color:var(--tan); }
.ge-dot { width:6px; height:6px; border-radius:50%; background:currentColor; animation:ge-pulse 2s ease-in-out infinite; }
@keyframes ge-pulse { 0%,100%{opacity:1} 50%{opacity:.3} }
@media (prefers-reduced-motion: reduce){ .ge-dot{animation:none} }

/* stone button */
.ge-btn {
  font-family:inherit; font-size:12.5px; color:var(--white); text-shadow:1px 1px 0 #000;
  background:var(--stone); border:1px solid var(--edge); border-radius:2px; padding:5px 13px; cursor:pointer;
  box-shadow:inset 1px 1px 0 var(--stone-hi), inset -1px -1px 0 var(--stone-lo);
}
.ge-btn:hover { color:var(--yellow); }
.ge-btn:active { box-shadow:inset 1px 1px 0 var(--stone-lo), inset -1px -1px 0 var(--stone-hi); }
.ge-btn:disabled { opacity:.45; cursor:default; color:var(--tan); }
.ge-root button:focus-visible, .ge-root input:focus-visible, .ge-root select:focus-visible, .ge-root a:focus-visible, .ge-root tr:focus-visible { outline:2px solid var(--yellow); outline-offset:1px; }

/* warning banner */
.ge-warn { border:1px solid #6e5426; background:#33270f; color:#f1d08a; border-radius:2px;
  padding:9px 12px; margin-bottom:12px; font-size:13px; text-shadow:1px 1px 0 #000; }
.ge-warn b { color:var(--yellow); }

/* market line */
.ge-read { font-size:13px; color:var(--tan); margin:0 0 12px; text-shadow:1px 1px 0 #000; }
.ge-read b { color:var(--orange); }

/* filter bar */
.ge-filters { display:flex; gap:10px; flex-wrap:wrap; align-items:center; }
.ge-filters .grow { flex:1 1 180px; }
.ge-in, .ge-sel {
  font-family:inherit; font-size:13px; color:var(--white); width:100%;
  background:var(--inset); border:1px solid var(--edge); border-radius:2px; padding:6px 9px;
  box-shadow:inset 1px 1px 0 #1a1712;
}
.ge-sel { width:auto; cursor:pointer; }
.ge-in::placeholder { color:var(--dark-tan); }
.ge-tog { display:inline-flex; align-items:center; gap:6px; font-size:13px; color:var(--white); cursor:pointer;
  user-select:none; white-space:nowrap; text-shadow:1px 1px 0 #000; }
.ge-tog input { accent-color:var(--orange); width:15px; height:15px; }

/* the board */
.ge-tablewrap { overflow:auto; max-height:calc(100vh - 130px); }
.ge-tablewrap::-webkit-scrollbar { width:12px; height:12px; }
.ge-tablewrap::-webkit-scrollbar-track { background:var(--inset2); }
.ge-tablewrap::-webkit-scrollbar-thumb { background:var(--stone); border:1px solid var(--edge); }
table.ge-t { border-collapse:collapse; width:100%; font-size:13px; min-width:700px; }
.ge-t thead th { position:sticky; top:0; z-index:2; background:var(--stone); color:var(--orange);
  font-weight:600; font-size:11px; letter-spacing:.12em; text-transform:uppercase; text-align:right;
  padding:8px 10px; border-bottom:2px solid var(--edge); cursor:pointer; white-space:nowrap;
  text-shadow:1px 1px 0 #000; box-shadow:inset 0 1px 0 var(--stone-hi); }
.ge-t thead th:first-child { text-align:left; }
.ge-t thead th.on { color:var(--yellow); }
.ge-t thead th .arr { font-size:9px; margin-left:3px; }
.ge-t tbody td { padding:6px 10px; text-align:right; font-family:var(--mono); font-size:12.5px;
  border-bottom:1px solid #221d16; white-space:nowrap; }
.ge-t tbody td:first-child { text-align:left; font-family:inherit; font-size:13px; }
.ge-t tbody tr { cursor:pointer; }
.ge-t tbody tr:hover { background:#332c22; }
.ge-t tbody tr:hover td:first-child .nm { color:var(--yellow); }
.ge-t .nm { color:var(--white); text-shadow:1px 1px 0 #000; }
.ge-t .good { color:var(--good); } .ge-t .bad { color:var(--bad); } .ge-t .warn { color:var(--warn); }
.ge-t .mut { color:var(--tan); } .ge-t .gold { color:var(--orange); }
.ge-mem { color:#d0a0e8; font-size:10px; margin-left:6px; border:1px solid #5a4470; border-radius:2px; padding:0 4px; font-family:var(--mono); }
.ge-flag { color:var(--warn); font-size:10px; margin-left:6px; border:1px dashed #6e5426; border-radius:2px; padding:0 4px; font-family:var(--mono); cursor:help; }
.ge-flag.tC { color:var(--bad); border-color:#6e2f26; }
.ge-more { padding:9px 12px; font-size:12px; color:var(--tan); text-align:center; }
@media (max-width:720px){ .hide-sm{display:none} table.ge-t{min-width:520px} }
@media (max-width:480px){ .hide-xs{display:none} table.ge-t{min-width:0}
  .ge-t tbody td:first-child{max-width:160px; overflow:hidden; text-overflow:ellipsis} }

/* popup */
.ge-overlay { position:fixed; inset:0; background:rgba(0,0,0,.65); z-index:50;
  display:flex; align-items:center; justify-content:center; padding:14px; }
.ge-modal { width:min(660px,100%); max-height:92vh; overflow:auto;
  background:var(--stone); border:2px solid var(--edge); border-radius:3px;
  box-shadow:inset 1px 1px 0 var(--stone-hi), inset -1px -1px 0 var(--stone-lo), 0 12px 40px rgba(0,0,0,.7); }
.ge-mhead { display:flex; align-items:center; justify-content:space-between; gap:10px;
  padding:10px 14px; border-bottom:2px solid var(--edge); }
.ge-mhead h2 { margin:0; font-family:var(--disp); font-weight:700; font-size:19px; color:var(--orange);
  letter-spacing:.03em; text-shadow:2px 2px 0 #000; }
.ge-x { width:26px; height:26px; flex:none; display:flex; align-items:center; justify-content:center;
  background:#7a1f1f; color:#fff; font-size:13px; font-weight:700; cursor:pointer;
  border:1px solid var(--edge); border-radius:2px;
  box-shadow:inset 1px 1px 0 #a34040, inset -1px -1px 0 #4d1010; }
.ge-x:hover { background:#933030; }
.ge-mbody { padding:12px 14px 16px; }
.ge-meta { display:flex; gap:6px 16px; flex-wrap:wrap; font-size:12px; color:var(--tan);
  margin:0 0 12px; text-shadow:1px 1px 0 #000; }
.ge-meta b { color:var(--white); font-family:var(--mono); font-weight:600; }

/* the two order tickets */
.ge-orders { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:12px; }
@media (max-width:560px){ .ge-orders{grid-template-columns:1fr} }
.ge-order { padding:10px 12px; }
.ge-order .k { font-size:10.5px; letter-spacing:.18em; text-transform:uppercase; font-weight:600;
  margin-bottom:6px; text-shadow:1px 1px 0 #000; }
.ge-order.buy .k { color:var(--good); } .ge-order.sell .k { color:var(--bad); }
.ge-order .p { font-family:var(--mono); font-size:19px; font-weight:600; color:var(--orange); text-shadow:1px 1px 0 #000; }
.ge-order .p span { font-size:12px; color:var(--tan); font-weight:400; }
.ge-order .fill { font-size:12.5px; margin-top:6px; font-family:var(--mono); }
.ge-order .fill b { font-weight:600; }
.ge-order .fill .good { color:var(--good); } .ge-order .fill .warn { color:var(--warn); } .ge-order .fill .bad { color:var(--bad); }
.ge-order .sub { font-size:11px; color:var(--dark-tan); margin-top:4px; line-height:1.4; }

/* margin slider */
.ge-slider { margin-bottom:12px; padding:10px 12px; }
.ge-slider .lab { display:flex; justify-content:space-between; align-items:baseline; gap:10px; flex-wrap:wrap;
  font-size:12px; color:var(--tan); margin-bottom:6px; text-shadow:1px 1px 0 #000; }
.ge-slider .lab b { font-family:var(--mono); font-size:14px; color:var(--yellow); font-weight:600; }
input.ge-range { -webkit-appearance:none; appearance:none; width:100%; height:20px; background:transparent; cursor:pointer; margin:0; display:block; }
input.ge-range::-webkit-slider-runnable-track { height:6px; border-radius:2px; background:var(--inset2); border:1px solid var(--edge); }
input.ge-range::-webkit-slider-thumb { -webkit-appearance:none; width:16px; height:16px; border-radius:2px; margin-top:-6px;
  background:linear-gradient(180deg,#ffd06a,var(--orange) 60%,#b06510); border:1px solid var(--edge); box-shadow:0 1px 3px rgba(0,0,0,.6); }
input.ge-range::-moz-range-track { height:6px; border-radius:2px; background:var(--inset2); border:1px solid var(--edge); }
input.ge-range::-moz-range-thumb { width:15px; height:15px; border-radius:2px; background:var(--orange); border:1px solid var(--edge); }
input.ge-range:disabled { opacity:.4; cursor:default; }
.ge-ends { display:flex; justify-content:space-between; font-size:10.5px; color:var(--dark-tan); margin-top:3px; }
.ge-hint { font-size:11.5px; color:var(--tan); margin-top:7px; line-height:1.45; }

/* qty + summary */
.ge-qtyrow { display:flex; align-items:center; gap:10px; flex-wrap:wrap; font-size:13px; margin-bottom:12px; text-shadow:1px 1px 0 #000; }
.ge-qtyrow input { width:110px; font-family:var(--mono); }
.ge-qtyrow .cap { color:var(--dark-tan); font-size:11.5px; }
.ge-sumrow { display:flex; gap:8px 22px; flex-wrap:wrap; padding:10px 12px; font-family:var(--mono); font-size:13px; margin-bottom:10px; }
.ge-sumrow div span { display:block; font-family:'Segoe UI',system-ui,sans-serif; font-size:10.5px; color:var(--tan);
  letter-spacing:.1em; text-transform:uppercase; margin-bottom:2px; text-shadow:1px 1px 0 #000; }
.ge-sumrow div b { font-weight:600; color:var(--white); }
.ge-sumrow .good { color:var(--good); } .ge-sumrow .bad { color:var(--bad); } .ge-sumrow .gold { color:var(--orange); }
.ge-note { font-size:11.5px; color:var(--tan); line-height:1.5; margin:8px 0 0; }
.ge-note.caution { color:#f1c286; }
.ge-link { color:var(--orange); text-decoration:none; border-bottom:1px dotted var(--orange); font-size:12px; }
.ge-link:hover { color:var(--yellow); border-color:var(--yellow); }

.ge-foot { text-align:center; color:var(--dark-tan); font-size:11px; margin-top:18px; line-height:1.6; }

/* tabs */
.ge-tabs { display:flex; gap:6px; margin-bottom:12px; }
.ge-tab {
  font-family:var(--disp); font-weight:600; font-size:13px; letter-spacing:.08em; text-transform:uppercase;
  color:var(--tan); text-shadow:1px 1px 0 #000; background:var(--inset2);
  border:1px solid var(--edge); border-bottom:none; border-radius:3px 3px 0 0; padding:7px 18px 6px; cursor:pointer;
  box-shadow:inset 1px 1px 0 #1a1712;
}
.ge-tab.on {
  color:var(--orange); background:var(--stone);
  box-shadow:inset 1px 1px 0 var(--stone-hi);
}
.ge-tab:hover { color:var(--yellow); }

/* job board */
.ge-modebar { display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
.ge-mode { font-size:12.5px; }
.ge-mode.on { color:var(--yellow); box-shadow:inset 1px 1px 0 var(--stone-lo), inset -1px -1px 0 var(--stone-hi); }
.ge-sheet { display:flex; gap:8px 14px; align-items:center; flex-wrap:wrap; font-size:12.5px; text-shadow:1px 1px 0 #000; }
.ge-sheet .sk { display:inline-flex; align-items:center; gap:5px; color:var(--tan); }
.ge-sheet .sk input { width:52px; text-align:right; font-family:var(--mono); padding:4px 6px; }
.ge-job { padding:0; overflow:hidden; }
.ge-jobhead { display:flex; align-items:baseline; justify-content:space-between; gap:10px; flex-wrap:wrap;
  padding:9px 13px 7px; }
.ge-jobhead h3 { margin:0; font-family:var(--disp); font-weight:700; font-size:16.5px; color:var(--orange);
  letter-spacing:.02em; text-shadow:2px 2px 0 #000; }
.ge-pay { font-family:var(--mono); font-size:17px; font-weight:600; text-shadow:1px 1px 0 #000; white-space:nowrap; }
.ge-pay.good { color:var(--good); } .ge-pay.bad { color:var(--bad); }
.ge-jobmeta { display:flex; gap:5px 14px; flex-wrap:wrap; font-size:11.5px; color:var(--tan);
  padding:0 13px 8px; text-shadow:1px 1px 0 #000; }
.ge-req { font-family:var(--mono); font-size:11px; border:1px solid var(--edge); border-radius:2px; padding:0 5px; }
.ge-req.ok { color:var(--good); } .ge-req.no { color:var(--bad); } .ge-req.unk { color:var(--tan); }
.ge-joblines { margin:0 13px 10px; padding:8px 11px; font-family:var(--mono); font-size:12.5px; line-height:1.75; }
.ge-joblines .op { display:inline-block; width:52px; font-weight:700; letter-spacing:.06em; font-size:11px; }
.ge-joblines .op.buy { color:var(--good); } .ge-joblines .op.work { color:var(--orange); } .ge-joblines .op.sell { color:var(--bad); }
.ge-joblines .clock { color:var(--dark-tan); font-size:11.5px; }
.ge-jobsum { display:flex; align-items:center; justify-content:space-between; gap:8px 18px; flex-wrap:wrap;
  padding:8px 13px 11px; border-top:1px solid #221d16; }
.ge-jobsum .facts { display:flex; gap:6px 20px; flex-wrap:wrap; font-family:var(--mono); font-size:12.5px; }
.ge-jobsum .facts div span { display:block; font-family:'Segoe UI',system-ui,sans-serif; font-size:10px; color:var(--tan);
  letter-spacing:.1em; text-transform:uppercase; margin-bottom:1px; text-shadow:1px 1px 0 #000; }
.ge-jobsum .facts div b { font-weight:600; color:var(--white); }
.ge-jobsum .facts .good { color:var(--good); } .ge-jobsum .facts .bad { color:var(--bad); } .ge-jobsum .facts .gold { color:var(--orange); }
.ge-batch { display:inline-flex; align-items:center; gap:6px; font-family:var(--mono); font-size:12.5px; }
.ge-batch .ge-btn { padding:3px 9px; font-family:var(--mono); }
.ge-batch b { min-width:52px; text-align:center; color:var(--yellow); }
`;

/* ================= item popup ================= */
function ItemPopup({ it, status, onClose }) {
  const maxStep = maxStepOf(it);
  // the slider stops where profit does: the deepest step that still breaks even
  // after tax (tax grows as a share of a shrinking spread, so margin can go
  // negative well before the prices meet in the middle)
  const marginAt = (s) => it.high - it.low - 2 * s - geTax(it.high - s, it.id);
  let bkStep = 0;
  if (marginAt(0) > 0) {
    let lo = 0, hi = maxStep;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (marginAt(mid) >= 0) lo = mid; else hi = mid - 1;
    }
    bkStep = lo;
  }
  const [step, setStep] = useState(0);
  const [qty, setQty] = useState(it.limit);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [onClose]);

  const o = quoteOrders(it, step, qty);
  const wikiName = it.name.replace(/ /g, "_");

  return (
    <div className="ge-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="ge-modal" role="dialog" aria-modal="true" aria-label={it.name}>
        <div className="ge-mhead">
          <h2>{it.name}</h2>
          <button className="ge-x" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="ge-mbody">

          <div className="ge-meta">
            <span>{it.members ? "Members" : "Free-to-play"}</span>
            <span>Buy limit <b>{it.limit.toLocaleString()}</b> / 4h</span>
            <span>Traded <b>{fmtQty(it.dv)}</b> / day</span>
            {o.tax === 0 && <span style={{ color: "var(--good)" }}>No GE tax</span>}
            <span>{{ "5m": "priced from the 5-min tape", "1h": "priced from the 1-hour tape",
              snap5m: "priced from the baked 5-min tape (offline)", snap1h: "priced from the baked 1-hour tape (offline)" }[it.src] || "priced from raw prints (offline)"}</span>
          </div>

          {/* the recommended orders */}
          <div className="ge-orders">
            <div className="ge-order buy ge-inset">
              <div className="k">Buy Offer</div>
              <div className="p">{fmtFull(o.buyP)} <span>gp each × {fmtFull(o.qty)}</span></div>
              <div className="fill">fills in ≈ <b className={durClass(o.tBuyH)}>{fmtDur(o.tBuyH)}</b></div>
              <div className="sub">
                {o.buyRate > 0
                  ? <>~{fmtQty(it.hvLo)} insta-sold last hour; your share ≈ {Math.round(o.share * 100)}%. Last insta-sell {agoStr(it.staleLo)}.</>
                  : <>Nobody insta-sold this in the last hour — a buy offer here just sits.</>}
              </div>
            </div>
            <div className="ge-order sell ge-inset">
              <div className="k">Sell Offer</div>
              <div className="p">{fmtFull(o.sellP)} <span>gp each × {fmtFull(o.qty)}</span></div>
              <div className="fill">fills in ≈ <b className={durClass(o.tSellH)}>{fmtDur(o.tSellH)}</b></div>
              <div className="sub">
                {o.tax > 0 ? <>GE tax takes {fmtFull(o.tax)} gp each. </> : null}
                {o.sellRate > 0
                  ? <>~{fmtQty(it.hvHi)} insta-bought last hour; your share ≈ {Math.round(o.share * 100)}%. Last insta-buy {agoStr(it.staleHi)}.</>
                  : <>Nobody insta-bought this in the last hour — a sell offer here just sits.</>}
              </div>
            </div>
          </div>

          {/* margin slider */}
          <div className="ge-slider ge-inset">
            <div className="lab">
              <span>Margin per item: <b>{fmtFull(o.margin)} gp</b> <span style={{ color: o.margin > 0 ? "var(--good)" : "var(--bad)" }}>({o.roi.toFixed(o.roi >= 10 ? 0 : 1)}% after tax)</span></span>
              <span>round trip ≈ <b style={{ color: "var(--white)" }}>{fmtDurShort(o.cycleH)}</b></span>
            </div>
            <input className="ge-range" type="range" min={0} max={bkStep} step={1}
              value={step} onChange={(e) => setStep(+e.target.value)}
              disabled={bkStep === 0} aria-label="Margin — trade profit for fill speed" />
            <div className="ge-ends"><span>full margin · patient</span><span>break-even · fast fills</span></div>
            <div className="ge-hint">
              {maxStep === 0
                ? "The spread is only 1 gp wide — there is no room to price inside it."
                : bkStep === 0
                  ? "The GE tax already eats this whole spread at the touch — there is no profitable room inside it."
                  : step === 0
                    ? "Quoted at the touch — the standard flip: buy at the insta-sell price, sell at the insta-buy price, and wait your turn in the queue."
                    : <>Priced {fmtFull(step)} gp inside the spread on each side. A better price heads the GE queue, so fills speed up — at the cost of margin.
                      {step >= bkStep && bkStep < maxStep ? " This is break-even: any deeper and the tax eats the whole margin." : ""}</>}
            </div>
          </div>

          {/* quantity */}
          <div className="ge-qtyrow">
            <label htmlFor="ge-qty">Quantity</label>
            <input id="ge-qty" className="ge-in" type="number" min={1} max={it.limit} value={qty}
              onChange={(e) => setQty(clamp(Math.round(+e.target.value || 1), 1, it.limit))} />
            <span className="cap">of the {it.limit.toLocaleString()} you can buy per 4 hours</span>
          </div>

          {/* summary */}
          <div className="ge-sumrow ge-inset">
            <div><span>You lay out</span><b>{fmtGp(o.cost)} gp</b></div>
            <div><span>Back after tax</span><b>{fmtGp(o.back)} gp</b></div>
            <div><span>Profit</span><b className={o.profit > 0 ? "good" : "bad"}>{o.profit > 0 ? "+" : ""}{fmtGp(o.profit)} gp</b></div>
            <div><span>Round trip</span><b className="gold">{fmtDurShort(o.cycleH)}</b></div>
          </div>

          {it.lastLow != null && it.lastHigh != null && (it.lastLow !== it.low || it.lastHigh !== it.high) && it.src !== "prints" && (
            <p className="ge-note">
              Last raw prints: {fmtFull(it.lastLow)} / {fmtFull(it.lastHigh)} ({agoStr(it.staleLo)} / {agoStr(it.staleHi)}) —
              the offers above are anchored to what actually traded, not to single prints.
            </p>
          )}
          {it.crossed && (
            <p className="ge-note caution">
              ⚠ The last two prints are crossed (insta-buy below insta-sell) — the price is moving right now
              and the averages will lag it. Probe with 1 before committing the stack.
            </p>
          )}
          {it.tier === "C" && !it.crossed && (
            <p className="ge-note caution">
              ⚠ Low-confidence book: the last trade is old or the data is sparse. Treat the margin as a rumour
              until a 1-unit probe confirms it.
            </p>
          )}
          {status === "snapshot" && (
            <p className="ge-note caution">⚠ Offline snapshot prices — check the live tape before placing these orders.</p>
          )}
          <p className="ge-note">
            Fill clocks assume your offer captures ~25% of the counter-flow at the touch and ~50–60% when
            priced inside the spread, at the last hour's pace. Estimates, not promises.{" "}
            <a className="ge-link" href={`https://prices.runescape.wiki/osrs/item/${it.id}`} target="_blank" rel="noreferrer">
              Price history on the wiki ↗
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

/* ================= the job board =================
   Resource-processing work priced by the market itself: buy the inputs, do the
   skilling, sell the product. Focus is the whole job — what it pays, what it
   costs to start, how long it takes, and whether you have the levels — never
   gp/hr: it's low-intensity work and your GE slots run concurrently anyway.

   "Take the market" crosses the spread on both ends (insta-buy the inputs,
   insta-sell the product): thinner pay, but the job starts and ends NOW.
   "Quote and wait" prices at the touch on both ends for the full margin,
   with fill clocks on each leg. */
const SKILL_LIST = ["Smithing", "Crafting", "Fletching", "Cooking", "Herblore"];
// seconds per action by facility — desk assumptions (banking overhead added on top)
const RATE = {
  Furnace: 3.0, Anvil: 3.0, "Cooking range": 2.4, Fire: 2.4,
  "Spinning wheel": 3.0, Loom: 4.8, "Pottery Oven": 3.0, "Potter's Wheel": 3.0,
  "Dairy churn": 3.0, "": 1.8,
};
const OVERHEAD = 1.15; // bank trips, misclicks, being human
const verbOf = (r) => {
  if (r.f === "Furnace") return "Smelt";
  if (r.f === "Anvil") return "Smith";
  if (r.f === "Cooking range" || r.f === "Fire") return "Cook";
  if (r.f === "Spinning wheel") return "Spin";
  if (r.f === "Loom") return "Weave";
  if (r.f === "Pottery Oven" || r.f === "Potter's Wheel") return "Form";
  if (r.f === "Dairy churn") return "Churn";
  return { Herblore: "Mix", Fletching: "Fletch", Cooking: "Prepare", Smithing: "Superheat" }[r.s] || "Craft";
};
const niceRound = (n) => {
  if (n <= 10) return Math.max(1, Math.round(n));
  const pow = 10 ** Math.floor(Math.log10(n));
  const m = n / pow;
  return Math.round((m < 1.5 ? 1 : m < 2.5 ? 2 : m < 3.5 ? 3 : m < 4.5 ? 4 : m < 7.5 ? 5 : 10) * pow);
};

// group recipe variants by output name index once
const RECIPES_BY_OUT = (() => {
  const m = new Map();
  for (const r of RECIPES.recipes) {
    if (!m.has(r.o)) m.set(r.o, []);
    m.get(r.o).push(r);
  }
  return m;
})();

/* the cheapest way to get one unit of `nameIdx`: buy it off the exchange, or
   craft it from parts (recursively, when crafting beats buying by >3%). */
function sourceUnit(nameIdx, mode, byName, memo, visiting) {
  if (memo.has(nameIdx)) return memo.get(nameIdx);
  const name = RECIPES.names[nameIdx];
  if (name === "Coins") {
    const plan = { cost: 1, secs: 0, buys: [], steps: [], coins: 1 };
    memo.set(nameIdx, plan);
    return plan;
  }
  const it = byName.get(name);
  const buyCost = it ? (mode === "express" ? it.high : it.low) : null;
  let best = buyCost != null
    ? { cost: buyCost, secs: 0, buys: [[nameIdx, 1]], steps: [], coins: 0 }
    : null;

  if (!visiting.has(nameIdx) && visiting.size < 3) {
    visiting.add(nameIdx);
    for (const r of RECIPES_BY_OUT.get(nameIdx) || []) {
      let cost = 0, secs = (RATE[r.f] ?? 3.0) / r.q, coins = 0, ok = true;
      const buys = new Map(), steps = new Map([[JSON.stringify(r), 1 / r.q]]);
      for (const [mi, mq] of r.m) {
        const sub = sourceUnit(mi, mode, byName, memo, visiting);
        if (!sub) { ok = false; break; }
        const per = mq / r.q;
        cost += sub.cost * per; secs += sub.secs * per; coins += sub.coins * per;
        for (const [bi, bq] of sub.buys) buys.set(bi, (buys.get(bi) || 0) + bq * per);
        for (const [sk, sc] of sub.steps) steps.set(sk, (steps.get(sk) || 0) + sc * per);
      }
      if (!ok) continue;
      // craft only when it genuinely beats the exchange (or the exchange has no price)
      if (best == null || cost < best.cost * 0.97) {
        best = { cost, secs, buys: [...buys], steps: [...steps], coins };
      }
    }
    visiting.delete(nameIdx);
  }
  memo.set(nameIdx, best);
  return best;
}

/* every job worth posting for the current mode: one card per craftable,
   tradeable output whose sale beats the cost of its parts */
function buildJobs(items, mode) {
  const byName = new Map(items.map((it) => [it.name, it]));
  const memo = new Map();
  const jobs = [];
  for (const [outIdx, variants] of RECIPES_BY_OUT) {
    const out = byName.get(RECIPES.names[outIdx]);
    if (!out) continue;
    const sellRaw = mode === "express" ? out.low : out.high;
    const sellUnit = sellRaw - geTax(sellRaw, out.id);
    let best = null;
    for (const r of variants) {
      // force the final step through THIS recipe; parts sourced their cheapest way
      let cost = 0, secs = (RATE[r.f] ?? 3.0) / r.q, coins = 0, ok = true;
      const buys = new Map(), steps = new Map([[JSON.stringify(r), 1 / r.q]]);
      const visiting = new Set([outIdx]);
      for (const [mi, mq] of r.m) {
        const sub = sourceUnit(mi, mode, byName, memo, visiting);
        if (!sub) { ok = false; break; }
        const per = mq / r.q;
        cost += sub.cost * per; secs += sub.secs * per; coins += sub.coins * per;
        for (const [bi, bq] of sub.buys) buys.set(bi, (buys.get(bi) || 0) + bq * per);
        for (const [sk, sc] of sub.steps) steps.set(sk, (steps.get(sk) || 0) + sc * per);
      }
      if (!ok) continue;
      const profitUnit = sellUnit - cost;
      if (best == null || profitUnit > best.profitUnit) {
        best = { r, cost, secs: secs * OVERHEAD, coins, buys, steps, profitUnit };
      }
    }
    if (!best || best.profitUnit <= 0) continue;

    // requirements across every step — listed in work order, raw materials first
    const levels = new Map(); const facilities = new Set(); let members = out.members;
    const stepList = [...best.steps].reverse().map(([sk, perUnit]) => ({ r: JSON.parse(sk), perUnit }));
    for (const s of stepList) {
      levels.set(s.r.s, Math.max(levels.get(s.r.s) || 0, s.r.l));
      if (s.r.f) facilities.add(s.r.f);
    }
    const buyList = [...best.buys].map(([bi, perUnit]) => ({ it: byName.get(RECIPES.names[bi]), perUnit }));
    if (buyList.some((b) => !b.it)) continue;
    for (const b of buyList) if (b.it.members) members = true;

    // how many units the market and the 4h limits can actually take
    const caps = [];
    for (const b of buyList) {
      caps.push(Math.floor(b.it.limit / b.perUnit)); // rolling 4h buy limit
      caps.push(mode === "express"
        ? Math.floor((0.10 * b.it.dv) / b.perUnit)          // don't move the book
        : Math.floor((b.it.hvLo * SHARE_TOUCH * 4) / b.perUnit)); // ~4h of patient fills
    }
    caps.push(mode === "express" ? Math.floor(0.10 * out.dv) : Math.floor(out.hvHi * SHARE_TOUCH * 4));
    const maxN = Math.max(0, Math.min(...caps));
    if (maxN < 1) continue;

    jobs.push({
      key: outIdx + ":" + mode, out, mode, ...best,
      sellUnit, stepList, buyList, maxN, members,
      levels: [...levels].map(([s, l]) => ({ s, l })),
      facilities: [...facilities],
      defaultN: Math.min(niceRound(450 / best.secs), maxN),
    });
  }
  jobs.sort((a, b) => b.profitUnit * b.defaultN - a.profitUnit * a.defaultN);
  return jobs;
}

/* one job posting */
function JobCard({ job, n, setN, sheet }) {
  const { out, mode } = job;
  const clockH = (units, flow) => (flow > 0 ? Math.max(units / (flow * SHARE_TOUCH), 1 / 60) : Infinity);
  const workH = (n * job.secs) / 3600;
  const buyClock = mode === "patient" ? Math.max(0, ...job.buyList.map((b) => clockH(b.perUnit * n, b.it.hvLo))) : 0;
  const sellClock = mode === "patient" ? clockH(n, out.hvHi) : 0;
  const totalH = workH + buyClock + sellClock + 2 / 60;
  const cost = Math.round(n * job.cost);
  const profit = Math.round(n * job.profitUnit);
  const lvlChip = (q) => {
    // a blank skill counts as level 1 — the board never assumes training you haven't claimed
    const have = sheet.skills[q.s];
    const lvl = have === "" || have == null ? 1 : +have;
    const cls = lvl >= q.l ? "ok" : "no";
    return <span key={q.s} className={"ge-req " + cls}>{q.s} {q.l}{cls === "ok" ? " ✓" : " ✗"}</span>;
  };
  const capNote = n >= job.maxN
    ? (mode === "express" ? "capped — a bigger batch would move these books" : "capped — the books can't fill more inside ~4h")
    : null;
  return (
    <section className="ge-panel ge-job">
      <div className="ge-jobhead">
        <h3>{verbOf(job.r)} {fmtFull(n)}× {out.name}</h3>
        <span className={"ge-pay " + (profit > 0 ? "good" : "bad")}>{profit > 0 ? "+" : ""}{fmtGp(profit)} gp</span>
      </div>
      <div className="ge-jobmeta">
        {job.levels.map(lvlChip)}
        {job.facilities.map((f) => <span key={f} className="ge-req unk">{f}</span>)}
        {[...new Set(job.stepList.map((s) => s.r.g).filter(Boolean))].map((g) => (
          <span key={g} className="ge-req unk" title="Hand tool required — a few gp from a shop">{g}</span>
        ))}
        {job.members && <span className="ge-mem">P2P</span>}
        <span>margin {fmtFull(Math.round(job.profitUnit))} gp per item</span>
      </div>
      <div className="ge-joblines ge-inset">
        {job.buyList.map((b) => {
          const q = Math.ceil(b.perUnit * n);
          const unit = mode === "express" ? b.it.high : b.it.low;
          return (
            <div key={b.it.id}>
              <span className="op buy">BUY</span>
              {fmtFull(q)}× {b.it.name} @ {fmtFull(unit)} — {fmtGp(q * unit)} gp
              {mode === "patient" && <span className="clock"> · fills ≈ {fmtDurShort(clockH(q, b.it.hvLo))}</span>}
            </div>
          );
        })}
        {job.coins > 0 && (
          <div><span className="op buy">PAY</span>{fmtGp(Math.round(job.coins * n))} gp in fees</div>
        )}
        {job.stepList.map((s, i) => {
          const count = Math.ceil(s.perUnit * n);
          return (
            <div key={i}>
              <span className="op work">{verbOf(s.r).toUpperCase()}</span>
              {fmtFull(count)}× {RECIPES.names[s.r.o]}{s.r.f ? ` at ${s.r.f.toLowerCase()}` : ""}
              <span className="clock"> · ≈ {fmtDurShort((count * (RATE[s.r.f] ?? 3.0) * OVERHEAD) / 3600)}</span>
            </div>
          );
        })}
        <div>
          <span className="op sell">SELL</span>
          {fmtFull(n)}× {out.name} @ {fmtFull(mode === "express" ? out.low : out.high)}
          {geTax(mode === "express" ? out.low : out.high, out.id) > 0 ? " less tax" : ""} — {fmtGp(Math.round(n * job.sellUnit))} gp
          {mode === "patient" && <span className="clock"> · fills ≈ {fmtDurShort(sellClock)}</span>}
        </div>
      </div>
      <div className="ge-jobsum">
        <div className="facts">
          <div><span>You lay out</span><b>{fmtGp(cost)} gp</b></div>
          <div><span>The job pays</span><b className={profit > 0 ? "good" : "bad"}>{profit > 0 ? "+" : ""}{fmtGp(profit)} gp</b></div>
          <div><span>Return</span><b>{cost > 0 ? ((profit / cost) * 100).toFixed(1) : "–"}%</b></div>
          <div><span>Takes about</span><b className="gold">{fmtDurShort(totalH)}</b></div>
        </div>
        <div className="ge-batch">
          <button className="ge-btn" onClick={() => setN(Math.max(1, niceRound(n / 2)))} aria-label="Halve batch">−</button>
          <b>{fmtFull(n)}</b>
          <button className="ge-btn" onClick={() => setN(Math.min(job.maxN, niceRound(n * 2)))} aria-label="Double batch">+</button>
          <button className="ge-btn" onClick={() => setN(job.maxN)}>Max</button>
        </div>
      </div>
      {capNote && <p className="ge-note caution" style={{ padding: "0 13px 10px", margin: 0 }}>⚠ {capNote}.</p>}
    </section>
  );
}

function JobBoard({ items, status }) {
  const [mode, setMode] = useState("express");
  const [search, setSearch] = useState("");
  const [hideCant, setHideCant] = useState(true);
  const [batches, setBatches] = useState({}); // job key -> chosen n
  const [sheet, setSheet] = useState(() => {
    try { return JSON.parse(localStorage.getItem("fd-sheet-v1")) || { members: true, skills: {} }; }
    catch (e) { return { members: true, skills: {} }; }
  });
  useEffect(() => { try { localStorage.setItem("fd-sheet-v1", JSON.stringify(sheet)); } catch (e) {} }, [sheet]);

  const jobs = useMemo(() => buildJobs(items, mode), [items, mode]);

  const canDo = (job) => {
    if (job.members && !sheet.members) return false;
    for (const q of job.levels) {
      const have = sheet.skills[q.s];
      const lvl = have === "" || have == null ? 1 : +have; // blank = level 1
      if (lvl < q.l) return false;
    }
    return true;
  };
  const q = search.trim().toLowerCase();
  const shown = jobs
    .filter((j) => (!hideCant || canDo(j)) && (!q || j.out.name.toLowerCase().includes(q)))
    .slice(0, 30);

  return (
    <>
      <section className="ge-panel">
        <div className="ge-modebar" style={{ marginBottom: 10 }}>
          <button className={"ge-btn ge-mode" + (mode === "express" ? " on" : "")} onClick={() => setMode("express")}>
            Take the market — start now
          </button>
          <button className={"ge-btn ge-mode" + (mode === "patient" ? " on" : "")} onClick={() => setMode("patient")}>
            Quote &amp; wait — full margin
          </button>
          <span className="ge-read" style={{ margin: 0 }}>
            {mode === "express"
              ? "Prices cross the spread on both ends: thinner pay, but every leg fills at once."
              : "Prices quote at the touch on both ends: the full margin, with a wait on each leg."}
          </span>
        </div>
        <div className="ge-filters">
          <div className="grow">
            <input className="ge-in" placeholder="Search the job board… e.g. keel, bar, pie" value={search}
              onChange={(e) => setSearch(e.target.value)} aria-label="Search jobs" />
          </div>
          <label className="ge-tog"><input type="checkbox" checked={hideCant} onChange={(e) => setHideCant(e.target.checked)} />only jobs I can start</label>
        </div>
        <div className="ge-sheet" style={{ marginTop: 10 }}>
          <span style={{ color: "var(--orange)", textShadow: "1px 1px 0 #000" }}>Your levels:</span>
          {SKILL_LIST.map((s) => (
            <label key={s} className="sk">{s}
              <input className="ge-in" type="number" min={1} max={99} placeholder="–"
                value={sheet.skills[s] ?? ""}
                onChange={(e) => setSheet((sh) => ({ ...sh, skills: { ...sh.skills, [s]: e.target.value } }))} />
            </label>
          ))}
          <label className="ge-tog"><input type="checkbox" checked={sheet.members}
            onChange={(e) => setSheet((sh) => ({ ...sh, members: e.target.checked }))} />members</label>
        </div>
      </section>

      {status === "snapshot" && (
        <p className="ge-read">Offline snapshot — the job board only sees the {items.length} baked items, so most work is hidden until the live feed returns.</p>
      )}
      <p className="ge-read">
        <b>{jobs.length}</b> jobs pay on the exchange right now{shown.length < jobs.length ? <> · showing {shown.length}</> : null}.
        Blank skills count as level 1 — fill in your stats to unlock more of the board.
      </p>

      {shown.map((job) => (
        <JobCard key={job.key} job={job} sheet={sheet}
          n={clamp(batches[job.key] ?? job.defaultN, 1, job.maxN)}
          setN={(v) => setBatches((b) => ({ ...b, [job.key]: clamp(v, 1, job.maxN) }))} />
      ))}
      {shown.length === 0 && (
        <section className="ge-panel"><p className="ge-read" style={{ margin: 0 }}>
          No paying jobs match. {mode === "express"
            ? "Taking the market eats both spreads — try Quote & wait for the full margins."
            : "Loosen the search, or check back when the books move."}
        </p></section>
      )}

      <p className="ge-foot">
        Default batches are sized to roughly 5–10 minutes of work and capped by 4-hour buy limits and what the
        books can absorb (≈10% of daily volume when taking the market; ≈4 hours of patient fills when quoting).<br />
        Action speeds are desk assumptions per facility, +15% for banking. The market moves while you work — the
        pay is an estimate, not a contract.
      </p>
    </>
  );
}

/* ================= filters ================= */
const BANDS = [
  { k: "any", label: "Any price", lo: 0, hi: Infinity },
  { k: "p1", label: "Under 100 gp", lo: 0, hi: 100 },
  { k: "p2", label: "100 gp – 10k", lo: 100, hi: 10_000 },
  { k: "p3", label: "10k – 1m", lo: 10_000, hi: 1_000_000 },
  { k: "p4", label: "Over 1m", lo: 1_000_000, hi: Infinity },
];
const VOLS = [
  { k: "any", label: "Any volume", min: 0 },
  { k: "v1", label: "10k+ traded/day", min: 10_000 },
  { k: "v2", label: "100k+ traded/day", min: 100_000 },
  { k: "v3", label: "1m+ traded/day", min: 1_000_000 },
];

/* ================= app ================= */
export default function FlipDesk() {
  const [status, setStatus] = useState("loading"); // loading | live | snapshot
  const [live, setLive] = useState(null);          // {items, universe} | null
  const [updatedAt, setUpdatedAt] = useState(null);
  const [, setTick] = useState(0);                 // periodic re-render for the age chip

  const [search, setSearch] = useState("");
  const [band, setBand] = useState("any");
  const [minVol, setMinVol] = useState("any");
  const [f2pOnly, setF2pOnly] = useState(false);
  const [profOnly, setProfOnly] = useState(false);
  const [sortKey, setSortKey] = useState("dv");
  const [sortDir, setSortDir] = useState(-1);
  const [selId, setSelId] = useState(null);
  const [view, setView] = useState("market"); // market | jobs

  const refresh = useCallback(async (auto = false) => {
    if (!auto) setStatus("loading");
    try {
      const r = await pullLive();
      setLive(r);
      setUpdatedAt(new Date());
      setStatus("live");
    } catch (e) {
      // an auto tick that fails keeps showing the last good tape; the age chip tells the story
      setStatus((s) => (auto && s === "live" ? s : "snapshot"));
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  /* polite auto-poll: 90s cadence, only while the tab is visible; apiGet's
     per-endpoint caches mean each tick costs at most one /latest request */
  useEffect(() => {
    const iv = setInterval(() => { if (!document.hidden) refresh(true); }, 90_000);
    const onVis = () => { if (!document.hidden) refresh(true); };
    document.addEventListener("visibilitychange", onVis);
    const age = setInterval(() => setTick((x) => x + 1), 30_000);
    return () => { clearInterval(iv); clearInterval(age); document.removeEventListener("visibilitychange", onVis); };
  }, [refresh]);

  const assessed = useMemo(() => (live?.items ?? BASE_ITEMS).map(assess), [live]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const b = BANDS.find((x) => x.k === band) || BANDS[0];
    const v = VOLS.find((x) => x.k === minVol) || VOLS[0];
    return assessed.filter((it) =>
      it.low >= b.lo && it.low < b.hi &&
      it.dv >= v.min &&
      (!f2pOnly || !it.members) &&
      (!profOnly || it.margin > 0) &&
      (!q || it.name.toLowerCase().includes(q))
    );
  }, [assessed, search, band, minVol, f2pOnly, profOnly]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      const va = sortKey === "name" ? a.name : a[sortKey];
      const vb = sortKey === "name" ? b.name : b[sortKey];
      return (va < vb ? -1 : va > vb ? 1 : 0) * sortDir;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const clickSort = (k, dir = -1) => {
    if (sortKey === k) setSortDir((d) => -d);
    else { setSortKey(k); setSortDir(dir); }
  };
  const Th = ({ k, dir, children, cls = "" }) => (
    <th className={(sortKey === k ? "on " : "") + cls} onClick={() => clickSort(k, dir)}>
      {children}{sortKey === k && <span className="arr">{sortDir === -1 ? "▼" : "▲"}</span>}
    </th>
  );

  const sel = useMemo(() => assessed.find((p) => p.id === selId) || null, [assessed, selId]);
  const hiddenN = live?.hidden ? live.hidden.oneSided + live.hidden.crossedAvg + live.hidden.dislocated : 0;
  const snapAgeH = Math.round((Date.now() / 1000 - SNAPSHOT.ts) / 3600);
  const snapAgeStr = snapAgeH > 48 ? `~${Math.round(snapAgeH / 24)} days old` : `~${snapAgeH}h old`;
  const SHOW = 400;

  return (
    <div className="ge-root">
      <style>{CSS}</style>
      <div className="ge-wrap">

        {/* masthead */}
        <header className="ge-mast">
          <div>
            <h1 className="ge-title">Grand Exchange</h1>
            <p className="ge-sub">The market as it stands</p>
          </div>
          <div className="ge-status">
            {status === "live" && (
              <span className="ge-chip live"><i className="ge-dot" />LIVE · {updatedAt ? agoStr((Date.now() - updatedAt.getTime()) / 60000).replace(" ago", "").toUpperCase() : ""}</span>
            )}
            {status === "snapshot" && <span className="ge-chip snap">◈ SNAPSHOT · {SNAP_DATE.toLocaleDateString([], { day: "numeric", month: "short" })}</span>}
            {status === "loading" && <span className="ge-chip load">… polling exchange</span>}
            <button className="ge-btn" onClick={() => refresh(false)} disabled={status === "loading"}>↻ Refresh</button>
          </div>
        </header>
        <hr className="ge-rule" />

        {/* tabs */}
        <div className="ge-tabs" role="tablist">
          <button className={"ge-tab" + (view === "market" ? " on" : "")} role="tab"
            aria-selected={view === "market"} onClick={() => setView("market")}>Market Board</button>
          <button className={"ge-tab" + (view === "jobs" ? " on" : "")} role="tab"
            aria-selected={view === "jobs"} onClick={() => setView("jobs")}>Job Board</button>
        </div>

        {status === "snapshot" && (
          <div className="ge-warn" role="alert">
            <b>Live feed unreachable.</b> Showing the baked snapshot from{" "}
            {SNAP_DATE.toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
            {snapAgeH > 1 ? ` (${snapAgeStr})` : ""} — prices drift by the minute, so treat these as a teaching tape.
          </div>
        )}

        {view === "jobs" && <JobBoard items={assessed} status={status} />}

        {view === "market" && <>
        <p className="ge-read">
          <b>{assessed.length.toLocaleString()}</b> items on the exchange
          {filtered.length !== assessed.length && <> · <b>{filtered.length.toLocaleString()}</b> match your filters</>}
          {hiddenN > 0 && <> · {hiddenN.toLocaleString()} unpriceable books set aside (one-sided, crossed or dislocated)</>}
          {" "}· tap an item for its recommended flip.
        </p>

        {/* filters */}
        <section className="ge-panel">
          <div className="ge-filters">
            <div className="grow">
              <input className="ge-in" placeholder="Search the exchange… e.g. rune, shark, whip" value={search}
                onChange={(e) => setSearch(e.target.value)} aria-label="Search items" />
            </div>
            <select className="ge-sel" value={band} onChange={(e) => setBand(e.target.value)} aria-label="Price bracket">
              {BANDS.map((b) => <option key={b.k} value={b.k}>{b.label}</option>)}
            </select>
            <select className="ge-sel" value={minVol} onChange={(e) => setMinVol(e.target.value)} aria-label="Minimum daily volume">
              {VOLS.map((v) => <option key={v.k} value={v.k}>{v.label}</option>)}
            </select>
            <label className="ge-tog"><input type="checkbox" checked={f2pOnly} onChange={(e) => setF2pOnly(e.target.checked)} />F2P only</label>
            <label className="ge-tog"><input type="checkbox" checked={profOnly} onChange={(e) => setProfOnly(e.target.checked)} />in profit</label>
          </div>
        </section>

        {/* the board */}
        <div className="ge-tablewrap ge-inset">
          <table className="ge-t">
            <thead>
              <tr>
                <Th k="name" dir={1}>Item</Th>
                <Th k="low">Buy</Th>
                <Th k="high" cls="hide-sm">Sell</Th>
                <Th k="margin">Margin</Th>
                <Th k="roi">ROI</Th>
                <Th k="dv" cls="hide-xs">Traded/day</Th>
                <Th k="limit" cls="hide-sm">Limit/4h</Th>
                <Th k="flipH" dir={1} cls="hide-sm">Flip a limit</Th>
              </tr>
            </thead>
            <tbody>
              {sorted.slice(0, SHOW).map((it) => (
                <tr key={it.id} tabIndex={0}
                  onClick={() => setSelId(it.id)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelId(it.id); } }}>
                  <td>
                    <span className="nm">{it.name}</span>
                    {it.members && <span className="ge-mem">P2P</span>}
                    {it.tier === "B" && <span className="ge-flag" title="Priced from the 1-hour average book (the 5-minute tape was too thin), or the last trade is over 15 minutes old.">B</span>}
                    {it.tier === "C" && <span className="ge-flag tC" title="Low-confidence pricing: stale, crossed prints, or raw offline data. Probe with 1 before trusting the margin.">C</span>}
                  </td>
                  <td className="gold">{fmtGp(it.low)}</td>
                  <td className="gold hide-sm">{fmtGp(it.high)}</td>
                  <td className={it.margin > 0 ? "good" : it.margin < 0 ? "bad" : "mut"}>{fmtGp(it.margin)}</td>
                  <td className={it.margin > 0 ? "good" : it.margin < 0 ? "bad" : "mut"}>{it.roi.toFixed(1)}%</td>
                  <td className="mut hide-xs">{fmtQty(it.dv)}</td>
                  <td className="mut hide-sm">{fmtQty(it.limit)}</td>
                  <td className={"hide-sm " + durClass(it.flipH)}>{fmtDurShort(it.flipH)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {sorted.length === 0 && <div className="ge-more">Nothing on the exchange matches — loosen the filters.</div>}
          {sorted.length > SHOW && <div className="ge-more">Showing the top {SHOW} of {sorted.length.toLocaleString()} — search or filter to narrow the board.</div>}
        </div>

        <p className="ge-foot">
          Buy / Sell = what each side actually traded at, volume-weighted over the last 5 minutes (1-hour
          fallback) — never a single print, so one bait trade can't paint the board. Margin is per item after
          GE tax (2% of sale, capped at 5m; under 50 gp and bonds exempt).<br />
          A / B / C flags grade data confidence; unpriceable books (one-sided, crossed, dislocated) are set aside.<br />
          Live prices courtesy of the <a className="ge-link" href="https://prices.runescape.wiki" target="_blank" rel="noreferrer">OSRS Wiki price API</a> — estimates, not promises.
        </p>
        </>}
      </div>

      {sel && <ItemPopup key={sel.id} it={sel} status={status} onClose={() => setSelId(null)} />}
    </div>
  );
}
