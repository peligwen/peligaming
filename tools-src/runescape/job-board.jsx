import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import RECIPES from "./recipes.json";
import SNAPSHOT from "./job-board-snapshot.json";
import { DAY, weekStats, completeDays, dayFills, cycleOrders, hourProfile, holdout } from "./day-model.js";
import { CHART_CSS, Sparkline, RangeBar, CycleChart, HourProfile } from "./day-charts.jsx";
import { FAMILIES, STAGES, PAIRS, SLOT_COLORS, ALL_COLOR, basketNames } from "./baskets.js";
import { buildCommodities, BAND_DAYS, MAX_GAP } from "./basket-model.js";
import { LevelChart, BASKET_CSS } from "./basket-charts.jsx";

/* baked snapshot lives in job-board-snapshot.json — v3 rows (scripts/capture-snapshot.mjs)
   carry tape-averaged pricing plus a week of daily rows; v2 rows carry the tape alone */

const API = "https://prices.runescape.wiki/api/v1/osrs";
const SNAP_DATE = new Date(SNAPSHOT.ts * 1000);

/* ================= the desk's horizon =================
   This is a day desk, not a tape reader: prices are what things went for over
   the week, and orders are priced to fill within a day of normal cycling.
   LOOKBACK complete UTC days feed every weekly number. CAPTURE is the share of
   an hour's counter-flow a standing offer at a better-than-going price is
   assumed to catch: you head the queue at that price, but so does every other
   desk reading the same tape, so assume half. */
const LOOKBACK = 7;
const CAPTURE = 0.5;

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
  if (n == null || isNaN(n)) return "–";
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
const fmtDurShort = (h) => {
  if (h == null || !isFinite(h)) return "—";
  const m = h * 60;
  if (m < 1) return "<1 min";
  if (m < 60) return Math.round(m) + " min";
  if (h < 48) return (h < 10 ? h.toFixed(1) : Math.round(h)) + " hr";
  return Math.round(h / 24) + " days";
};
// xp amounts: fine-grained when small, compact when big
const fmtXp = (n) => {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "m";
  if (n >= 10000) return (n / 1000).toFixed(1) + "k";
  if (n >= 100) return Math.round(n).toLocaleString();
  return String(+n.toFixed(1));
};
// gp per xp: sign carried by the caller's label
const fmtGpx = (g) => (Math.abs(g) >= 100 ? Math.round(Math.abs(g)).toLocaleString() : Math.abs(g).toFixed(Math.abs(g) >= 10 ? 1 : 2));
// signed % — the week's trend, today against the week, real trades against the GE price
const fmtDev = (d) => (d == null || !isFinite(d) ? "–" : (d > 0 ? "+" : "") + d.toFixed(Math.abs(d) >= 10 ? 0 : 1) + "%");
const devClass = (d) => (d == null ? "mut" : Math.abs(d) < 2 ? "mut" : Math.abs(d) < 10 ? "" : "warn");
const trendClass = (t) => (t == null ? "mut" : t > 1 ? "good" : t < -1 ? "bad" : "mut");
// an hour of the day, on the 24-hour clock
const hh = (h) => String(h).padStart(2, "0") + ":00";
const fmtDay = (ts) => { const d = new Date(ts * 1000); return `${d.getUTCDate()} ${d.toLocaleString("en", { month: "short", timeZone: "UTC" })}`; };

/* ================= data shaping ================= */
/* fold an item's daily rows into its weekly read: the going rate, the trend,
   the week's range, the typical day's after-tax spread, and where today sits */
function withWeek(it, week) {
  const wk = weekStats(week, (px) => geTax(px, it.id));
  const mid = (it.low + it.high) / 2;
  return {
    ...it, week,
    rate: wk.rate, rateLo: wk.rateLo, rateHi: wk.rateHi, trend: wk.trend,
    rangeLo: wk.rangeLo, rangeHi: wk.rangeHi, dayMargin: wk.dayMargin, dayRoi: wk.dayRoi,
    dv7: wk.dv, vLo7: wk.vLo, vHi7: wk.vHi, mids: wk.mids, nDays: wk.n2,
    todayVs: wk.rate > 0 ? ((mid - wk.rate) / wk.rate) * 100 : null,
  };
}
// the week's-range tooltip: today's price, and how far up the week's band it sits
const rangeLabel = (it) => (it.rangeLo != null && it.rangeHi != null
  ? `${fmtGp(it.mid)} today · ${it.rangePos != null && it.rangePos >= 0 && it.rangePos <= 1
    ? Math.round(it.rangePos * 100) + "% of the way up"
    : "outside"} the week's ${fmtGp(it.rangeLo)}–${fmtGp(it.rangeHi)} (left = the week's cheapest daily buy, right = its dearest daily sell)`
  : "no weekly range");
// a side's daily flow: the week's average, or the last hour scaled up when the week is silent
const dayFlow = (it, side) => (side === "lo"
  ? (it.vLo7 > 0 ? it.vLo7 : it.hvLo * 24)
  : (it.vHi7 > 0 ? it.vHi7 : it.hvHi * 24));

/* v3 rows: [id,name,limit,members,low,high,hvLo,hvHi,lastLow,lastHigh,staleLo,staleHi,dv,src,week]
   — src 2 = 5-min tape, 1 = 1-hour tape, 0 = the latest daily average; week = daily
   [lo,hi,vLo,vHi] rows (or null) aligned with SNAPSHOT.days. v2 rows run the same
   through dv, then an is5m flag and no week. A snapshot is old news either way,
   so every row is graded C. */
const rowToItem = (r) => {
  const v3 = SNAPSHOT.version >= 3;
  const src = v3 ? (["day", "1h", "5m"][r[13]] || "day") : (r[13] ? "5m" : "1h");
  return withWeek({
    id: r[0], name: r[1], limit: r[2], members: !!r[3],
    low: r[4], high: r[5], hv: r[6] + r[7], hvLo: r[6], hvHi: r[7], low1h: null, high1h: null,
    lastLow: r[8], lastHigh: r[9], staleLo: r[10], staleHi: r[11],
    crossed: r[8] != null && r[9] != null && r[9] < r[8],
    dv: r[12], tier: "C", src, snap: true, moving: false, movePct: 0, official: null, dev: 0, ha: 0, la: 0,
  }, v3 ? r[14] || [] : []);
};
const BASE_ITEMS = SNAPSHOT.items.map(rowToItem);

/* board stats: the week's read on every row — the going rate, the units
   through the book on a typical day and the gp they carry (units × rate: the
   size of the river, and the board's default rank), and where today's price
   sits in the week's range. The tape's own touch margin rides along for the
   popup's "right now" strip. */
function assess(it) {
  const tax = geTax(it.high, it.id);
  const margin = it.high - it.low - tax;
  const roi = it.low > 0 ? (margin / it.low) * 100 : 0;
  const mid = (it.low + it.high) / 2;
  const px = it.rate ?? mid;
  const units = it.dv7 > 0 ? it.dv7 : it.dv;
  const turnover = units * px;
  const rangePos = it.rangeHi > it.rangeLo ? (mid - it.rangeLo) / (it.rangeHi - it.rangeLo) : null;
  // the GE-price screen needs a real gap to judge: rows the GE price doesn't cover carry null
  const guideDev = it.official != null ? it.dev ?? 0 : null;
  return { ...it, tax, margin, roi, mid, px, units, turnover, rangePos, guideDev, dev: it.dev ?? 0 };
}

/* ================= api citizenship =================
   The wiki's price API is a free community service run for RuneLite users.
   This desk is deliberately polite with it:
   - every endpoint is cached at its natural update cadence (latest ~1min,
     5m blocks every 5min, 1h refreshed 15min, volumes hourly, mapping ~weekly,
     finished days for good — the proxy holds those for a week)
   - concurrent callers share a single in-flight request
   - errors back off exponentially PER ENDPOINT, serving stale data meanwhile
   - a hidden tab never polls; the refresh button can't bust the cache      */
const TTL = {
  latest: 85_000, "5m": 300_000, "1h": 900_000, "24h": 3_600_000, timeseries: 900_000,
  volumes: 3_600_000, mapping: 7 * 86_400_000, official: 6 * 3_600_000,
};
const memCache = new Map();   // path -> {ts, data}
const inflight = new Map();   // path -> Promise
const cooloff = new Map();    // kind -> {streak, until}

// Served from the site, requests go through our own /api/osrs proxy: one shared
// Cloudflare edge cache for every visitor, and a descriptive User-Agent for the
// wiki. Anywhere else (file://, previews) — or if the proxy misbehaves — fall
// back to the wiki directly.
const PROXIED = typeof location !== "undefined" && /^https?:$/.test(location.protocol);
let apiBase = PROXIED ? "/api/osrs" : API;

/* hiscores lookups exist only through the site's proxy (Jagex sends no CORS
   headers), and never touch the price-API fallback logic above */
async function fetchHiscores(rsn) {
  const res = await fetch("/api/osrs/hiscores?player=" + encodeURIComponent(rsn), {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error("HTTP " + res.status);
  return res.json();
}

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
    const t = setTimeout(() => ctrl.abort(), 15_000);
    try {
      const res = await fetch(base + path, { signal: ctrl.signal, headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error("HTTP " + res.status);
      return await res.json();
    } finally { clearTimeout(t); }
  };
  const p = (async () => {
    try {
      let data;
      // capture the base up front: concurrent callers each get their own
      // direct-API retry even after the first failure flips the shared base
      const base = apiBase;
      try {
        data = await one(base);
      } catch (e) {
        if (base === API) throw e;
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
  const LS = "fd:universe-v3"; // v3 carries both alch values for the Job Board
  try {
    localStorage.removeItem("fd:universe-v1");
    localStorage.removeItem("fd:universe-v2");
    const j = JSON.parse(localStorage.getItem(LS));
    if (j && Date.now() - j.ts < TTL.mapping && j.items?.length > 500) return j.items;
  } catch (e) { /* no storage / stale — refetch */ }
  try {
    const map = await apiGet("mapping", "/mapping");
    if (!Array.isArray(map) || map.length < 500) return null;
    const items = map
      .filter((m) => m.id != null && m.name && m.limit > 0)
      .map((m) => ({ id: m.id, name: m.name, limit: m.limit, members: !!m.members, ha: m.highalch || 0, la: m.lowalch || 0 }));
    try { localStorage.setItem(LS, JSON.stringify({ ts: Date.now(), items })); } catch (e) {}
    return items;
  } catch (e) { return null; }
}

/* ================= the week =================
   LOOKBACK complete UTC days of every item's daily averages, from the wiki's
   bulk daily endpoint. A finished day never changes, so the proxy holds each
   one for a week and a returning visitor fetches only the newest. Yesterday
   isn't always aggregated yet, so ask for one day more than needed and keep
   the newest LOOKBACK that came back with data. */
async function pullWeek() {
  const today = Math.floor(Date.now() / 1000 / DAY) * DAY;
  const want = [];
  for (let i = LOOKBACK + 1; i >= 1; i--) want.push(today - i * DAY);
  const got = await Promise.all(want.map((ts) => apiGet("24h", "/24h?timestamp=" + ts).catch(() => null)));
  const days = [];
  for (let i = 0; i < want.length; i++) {
    const data = got[i]?.data;
    if (data && Object.keys(data).length > 0) days.push({ ts: want[i], data });
  }
  return days.slice(-LOOKBACK);
}

/* ================= pricing =================
   The two /latest prints are asynchronous last trades, not a fillable two-way
   quote — one bot dump, bait print or impatient buyer skews them for everyone
   reading the feed. So the desk prices every row from windowed VOLUME-WEIGHTED
   AVERAGES: the week's daily rows carry the headline numbers, and "today" is
   the 5-minute window when both sides traded meaningfully, falling back to the
   1-hour window, falling back to the latest daily average when nobody touched
   the item this hour — a day desk doesn't need the last hour to price a market
   that traded both ways most of the week. Books nothing can price honestly
   stay off the board and are counted:
   - no market: neither the tape nor three days of the week traded both sides
   - crossed averages: buy avg above sell avg — the price is in motion
   - dislocated: a wide spread on a busy book; real competition would have
     closed it, so it's a data artifact or a knife, not an opportunity      */
async function pullLive() {
  const [latest, h1, vols, uni, days] = await Promise.all([
    apiGet("latest", "/latest"),
    apiGet("1h", "/1h"),
    apiGet("volumes", "/volumes"),
    loadUniverse(),
    pullWeek(),
  ]);
  let m5 = null;
  try { m5 = await apiGet("5m", "/5m"); } catch (e) { /* 1h pricing covers */ }
  // the official in-game GE price — Jagex's own lagged daily average of
  // EVERY trade, an independent sample the board tracks but never prices from
  let official = null;
  try { official = await apiGet("official", "/official"); } catch (e) { /* GE price optional */ }
  const meta = uni || BASE_ITEMS;      // no mapping? fall back to the baked classics
  const now = Math.floor(Date.now() / 1000);
  const items = [];
  // books the board can't price honestly, kept whole: a crossed or
  // dislocated tape can't head the Market Board, but the item still has a
  // week and a midpoint, and the Commodities grid keeps its place for it
  const aside = [];
  const hidden = { oneSided: 0, crossedAvg: 0, dislocated: 0 };
  for (const base of meta) {
    const p = latest.data?.[base.id];
    const h = h1.data?.[base.id] || {};
    const f = m5?.data?.[base.id] || {};
    // highPriceVolume = trades at insta-buy (fills YOUR sell offer); lowPriceVolume = insta-sells (fills YOUR buy offer)
    const hvHi = h.highPriceVolume || 0;
    const hvLo = h.lowPriceVolume || 0;
    const week = days.map((d) => {
      const r = d.data[base.id];
      return r ? [r.avgLowPrice ?? null, r.avgHighPrice ?? null, r.lowPriceVolume || 0, r.highPriceVolume || 0] : null;
    });
    let twoSided = 0, lastDay = null;
    for (const w of week) if (w && w[0] != null && w[1] != null) { twoSided++; lastDay = w; }
    if (!p && !hvHi && !hvLo && !twoSided) continue; // nothing traded at all — not a market
    const ok5 = f.avgLowPrice && f.avgHighPrice && (f.lowPriceVolume || 0) >= 5 && (f.highPriceVolume || 0) >= 5;
    const ok1 = h.avgLowPrice && h.avgHighPrice && hvLo >= 1 && hvHi >= 1;
    const tapeOk = ok5 || ok1;
    if (!tapeOk && twoSided < 3) { hidden.oneSided++; continue; }
    // GE orders are whole gp — round the averages to enterable prices
    let low, high, src;
    if (tapeOk) {
      low = Math.round(ok5 ? f.avgLowPrice : h.avgLowPrice);
      high = Math.round(ok5 ? f.avgHighPrice : h.avgHighPrice);
      src = ok5 ? "5m" : "1h";
    } else {
      low = Math.round(lastDay[0]); high = Math.round(lastDay[1]); src = "day";
    }
    const dv = vols.data?.[base.id] ?? 0;
    const spreadPct = low > 0 ? ((high - low) / low) * 100 : 0;
    const setAside = high < low ? "crossed" : tapeOk && high >= 50 && spreadPct > 10 && dv > 20_000 ? "dislocated" : null;
    if (setAside === "crossed") hidden.crossedAvg++; else if (setAside) hidden.dislocated++;
    // raw prints date the row and flag disagreement — they never price it
    const staleHi = p?.highTime ? Math.round((now - p.highTime) / 60) : 999;
    const staleLo = p?.lowTime ? Math.round((now - p.lowTime) / 60) : 999;
    const crossed = !!(p && p.high && p.low && p.high < p.low);
    const stale = Math.max(staleHi, staleLo);
    // cross-check the two windows: when the 5-min tape has walked away from the
    // hour's average, the price is in motion and today's read is provisional
    let movePct = 0;
    if (ok5 && ok1) {
      const mid5 = (f.avgLowPrice + f.avgHighPrice) / 2, mid1 = (h.avgLowPrice + h.avgHighPrice) / 2;
      movePct = mid1 > 0 ? ((mid5 - mid1) / mid1) * 100 : 0;
    }
    const moving = Math.abs(movePct) > 7.5;
    let tier = !tapeOk ? (twoSided >= 5 ? "B" : "C") : crossed || stale > 60 ? "C" : ok5 && stale <= 15 ? "A" : "B";
    if (moving && tier === "A") tier = "B";
    const it = withWeek({
      id: base.id, name: base.name, limit: base.limit, members: base.members,
      low, high, hv: hvHi + hvLo, hvHi, hvLo,
      low1h: ok1 ? Math.round(h.avgLowPrice) : null,
      high1h: ok1 ? Math.round(h.avgHighPrice) : null,
      lastLow: p?.low ?? null, lastHigh: p?.high ?? null, crossed,
      dv, staleHi, staleLo, tier: setAside ? "C" : tier, src, snap: false, moving, movePct,
      ha: base.ha || 0, la: base.la || 0, aside: setAside,
    }, week);
    // deviance from the official GE price: the week's real traded rate vs the guide
    const guide = official?.[base.name];
    it.official = guide > 0 ? guide : null;
    it.dev = guide > 0 ? (((it.rate ?? (low + high) / 2) - guide) / guide) * 100 : 0;
    (setAside ? aside : items).push(it);
  }
  if (items.length < 20) throw new Error("thin response");
  return { items, aside, universe: !!uni, hidden, days: days.map((d) => d.ts) };
}

/* ================= commodities =================
   The goods everyone trades, as families by stage: a strip of basket tiles,
   the chart, one stone panel per family with its three stage lists, and the
   linked pairs. Dense rows, the game's list style. */
const CM_CSS = `
.cm-controls { display:flex; gap:8px 18px; flex-wrap:wrap; align-items:center; padding:9px 13px; }
.cm-controls .grp { display:inline-flex; align-items:center; gap:5px; flex-wrap:wrap; }
.cm-controls .grp.right { margin-left:auto; }
.cm-strip { display:grid; grid-template-columns:repeat(auto-fill,minmax(136px,1fr)); gap:8px; margin-bottom:12px; }
.cm-tile { font:inherit; color:var(--white); text-align:left; padding:8px 10px; cursor:pointer; display:flex; flex-direction:column; gap:4px; }
.cm-tile:hover { background:#332c22; }
.cm-tile.off { opacity:.5; }
.cm-tile .hd { display:flex; align-items:center; gap:6px; font-size:12px; color:var(--tan); text-shadow:1px 1px 0 #000; }
.cm-tile .hd .nm { flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; color:var(--white); }
.cm-tile .hd .n { font-family:var(--mono); font-size:10.5px; color:var(--dark-tan); }
.cm-tile .lv { display:flex; align-items:baseline; gap:8px; font-family:var(--mono); }
.cm-tile .lv b { font-size:19px; font-weight:600; color:var(--yellow); text-shadow:1px 1px 0 #000; }
.cm-tile .lv span { font-size:12px; }
.cm-tile .br { display:flex; align-items:center; gap:4px 8px; flex-wrap:wrap; }
.cm-tile .br small { font-size:10.5px; color:var(--dark-tan); white-space:nowrap; }
.cm-tile .good, .cm-famhead .good, .cm-row .good, .cm-t .good { color:var(--good); }
.cm-tile .bad, .cm-famhead .bad, .cm-row .bad, .cm-t .bad { color:var(--bad); }
.cm-tile .mut, .cm-famhead .mut, .cm-row .mut, .cm-t .mut { color:var(--tan); }
.cm-chart { padding:12px 13px; }
.cm-chart .ge-hint { margin-top:8px; }
.cm-tablewrap { margin-bottom:12px; max-height:none; }
.cm-family { padding:10px 13px 12px; }
.cm-famhead { display:flex; align-items:baseline; gap:10px; flex-wrap:wrap; margin-bottom:8px; }
.cm-famhead h3 { margin:0; font-family:var(--disp); font-weight:700; font-size:16px; color:var(--orange); letter-spacing:.02em; text-shadow:2px 2px 0 #000; }
.cm-famhead .lv { font-family:var(--mono); font-size:15px; color:var(--yellow); font-weight:600; text-shadow:1px 1px 0 #000; }
.cm-famhead .mv { font-family:var(--mono); font-size:12.5px; }
.cm-famhead small { font-size:11.5px; color:var(--dark-tan); }
.cm-famhead .bc-lgkey { align-self:center; }
.cm-stages { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px 14px; }
@media (max-width:760px){ .cm-stages { grid-template-columns:1fr; } }
.cm-stage h4 { margin:0 0 4px; font-family:var(--pixel); font-size:10.5px; color:var(--tan); text-transform:uppercase; letter-spacing:.12em; text-shadow:1px 1px 0 #000; cursor:help; }
.cm-rows { display:flex; flex-direction:column; }
.cm-none { color:var(--dark-tan); font-size:12px; padding:4px 6px; }
.cm-row { display:flex; align-items:center; gap:6px; width:100%; font:inherit; font-size:12.5px; color:var(--white); text-align:left;
  background:var(--inset); border:none; border-bottom:1px solid #221d16; padding:3px 6px; cursor:pointer; text-shadow:1px 1px 0 #000; }
.cm-row:hover { background:#332c22; } .cm-row:hover .nm { color:var(--yellow); }
.cm-row .nm { flex:1 1 70px; min-width:56px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.cm-row .nm .ge-mem { margin-left:5px; }
.cm-row .px { font-family:var(--mono); color:var(--orange); min-width:40px; text-align:right; }
.cm-row .mv { font-family:var(--mono); min-width:46px; text-align:right; }
.cm-row .vs { font-family:var(--mono); min-width:44px; text-align:right; color:var(--dark-tan); font-size:11px; }
.cm-row .vs.warn { color:var(--warn); }
.cm-row .fl { display:inline-flex; gap:3px; flex:none; }
.cm-row .fl:empty { display:none; }
.cm-row .fl .ge-flag { margin-left:0; white-space:nowrap; font-size:9.5px; padding:0 3px; }
.cm-row .ge-spark { flex:none; }
@media (max-width:1000px){ .cm-row .ge-spark { display:none; } }
@media (max-width:480px){ .cm-row .vs { display:none; } }
.cm-spreads h3 { margin:0 0 6px; font-family:var(--disp); font-weight:700; font-size:16px; color:var(--orange); letter-spacing:.02em; text-shadow:2px 2px 0 #000; }
.cm-spreads .ge-hint { margin:0 0 10px; }
.cm-t tbody td:first-child { white-space:normal; min-width:210px; }
.cm-t td .via { display:block; font-family:'Segoe UI',system-ui,sans-serif; font-size:10.5px; color:var(--dark-tan); white-space:normal; }
.cm-t td .ge-spark { margin:0; }
.cm-t td small { font-size:10.5px; color:var(--dark-tan); }
`;

/* ================= styles — old-school interface ================= */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700&family=Pixelify+Sans:wght@500;600&display=swap');
.ge-root {
  --stone:#3e3529; --stone-hi:#554a38; --stone-lo:#241f18; --edge:#0d0b08;
  --inset:#2b2620; --inset2:#211d17;
  --orange:#ff981f; --yellow:#ffe93f; --white:#f3ecdc; --tan:#b3a284; --dark-tan:#8a7a5f;
  --good:#57d957; --warn:#e8b13c; --bad:#f26060;
  --wood:#2a1f14; --wood-seam:#1c140c;
  --paper:#e8dcb5; --paper-edge:#c9b98c; --ink:#2a2014; --ink-soft:#4d4330; --pin:#5c5348; --pin-hi:#8a8072;
  --paper-good:#1f6b1f; --paper-bad:#8b1d1d; --stamp:#7a2430; --stamp2:#5a3a7a;
  --mono:ui-monospace,'Cascadia Code','SF Mono',Menlo,Consolas,monospace;
  --disp:'Cinzel',Georgia,'Times New Roman',serif;
  --pixel:'Pixelify Sans',var(--disp);
  background:#1b1712; color:var(--white); min-height:100vh;
  font-family:'Segoe UI',system-ui,-apple-system,Roboto,sans-serif;
  font-size:14px; line-height:1.45;
}
.ge-root *, .ge-root *::before, .ge-root *::after { box-sizing:border-box; }
.ge-wrap { max-width:1120px; margin:0 auto; padding:18px 14px 48px; }
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

/* screens — a min and a max on every column */
.ge-active { display:flex; gap:6px; flex-wrap:wrap; align-items:center; margin-top:9px; }
.ge-achip { display:inline-flex; align-items:center; gap:7px; font-family:var(--mono); font-size:11.5px; color:var(--yellow);
  background:var(--inset); border:1px solid var(--edge); border-radius:2px; padding:3px 3px 3px 8px; box-shadow:inset 1px 1px 0 #1a1712; }
.ge-achip > span { font-family:'Segoe UI',system-ui,-apple-system,Roboto,sans-serif; color:var(--tan); font-size:10.5px;
  letter-spacing:.08em; text-transform:uppercase; text-shadow:1px 1px 0 #000; }
.ge-achip button { font:inherit; font-size:11px; color:var(--tan); background:none; border:none; cursor:pointer; padding:1px 5px; line-height:1; }
.ge-achip button:hover { color:var(--bad); }
.ge-count { font-size:12px; color:var(--tan); margin-left:auto; text-shadow:1px 1px 0 #000; white-space:nowrap; }
.ge-count b { color:var(--orange); font-family:var(--mono); }
.ge-presets { display:flex; gap:6px; flex-wrap:wrap; margin-top:10px; }
.ge-preset { font-family:inherit; font-size:12px; color:var(--tan); background:var(--inset2); border:1px solid var(--edge);
  border-radius:12px; padding:3px 11px; cursor:pointer; text-shadow:1px 1px 0 #000; box-shadow:inset 1px 1px 0 #1a1712; }
.ge-preset:hover { color:var(--yellow); }
.ge-preset.on { color:var(--yellow); background:var(--stone-hi); border-color:#8a6f3d; box-shadow:inset 1px 1px 0 #6b5d45; }
.ge-sgrid { display:grid; grid-template-columns:repeat(auto-fill,minmax(290px,1fr)); gap:8px 20px; margin-top:12px; }
.ge-screen .sl { display:flex; justify-content:space-between; align-items:baseline; gap:8px; font-size:10.5px; color:var(--tan);
  letter-spacing:.1em; text-transform:uppercase; text-shadow:1px 1px 0 #000; cursor:help; }
.ge-screen .sl b { font-family:var(--mono); font-size:11.5px; color:var(--dark-tan); font-weight:600; text-transform:none; letter-spacing:0; }
.ge-screen.on .sl { color:var(--orange); }
.ge-screen.on .sl b { color:var(--yellow); }
.ge-screen .row { display:flex; align-items:center; gap:6px; margin-top:2px; }
.ge-screen .row input.ge-in { width:62px; flex:none; font-family:var(--mono); font-size:11.5px; padding:3px 5px; text-align:center; }
.ge-dual { position:relative; flex:1; height:22px; min-width:80px; }
.ge-dual .track { position:absolute; left:0; right:0; top:8px; height:6px; border-radius:2px; background:var(--inset2); border:1px solid var(--edge); }
.ge-dual .fill { position:absolute; top:8px; height:6px; background:var(--orange); opacity:.5; border-radius:2px; pointer-events:none; }
.ge-dual input[type=range] { position:absolute; left:0; top:0; width:100%; height:22px; margin:0; -webkit-appearance:none; appearance:none;
  background:transparent; pointer-events:none; cursor:pointer; }
.ge-dual input[type=range]:focus-visible { outline:none; }
.ge-dual input[type=range]::-webkit-slider-runnable-track { height:6px; background:transparent; border:none; }
.ge-dual input[type=range]::-webkit-slider-thumb { -webkit-appearance:none; pointer-events:auto; width:14px; height:14px; border-radius:2px; margin-top:-4px;
  background:linear-gradient(180deg,#ffd06a,var(--orange) 60%,#b06510); border:1px solid var(--edge); box-shadow:0 1px 3px rgba(0,0,0,.6); }
.ge-dual input[type=range]:focus-visible::-webkit-slider-thumb { box-shadow:0 0 0 2px var(--yellow); }
.ge-dual input[type=range]::-moz-range-track { height:6px; background:transparent; border:none; }
.ge-dual input[type=range]::-moz-range-thumb { pointer-events:auto; width:13px; height:13px; border-radius:2px; background:var(--orange); border:1px solid var(--edge); }
.ge-dual input[type=range]:focus-visible::-moz-range-thumb { box-shadow:0 0 0 2px var(--yellow); }

/* the board */
.ge-tablewrap { overflow:auto; max-height:calc(100vh - 130px); }
.ge-tablewrap::-webkit-scrollbar { width:12px; height:12px; }
.ge-tablewrap::-webkit-scrollbar-track { background:var(--inset2); }
.ge-tablewrap::-webkit-scrollbar-thumb { background:var(--stone); border:1px solid var(--edge); }
table.ge-t { border-collapse:collapse; width:100%; font-size:13px; min-width:820px; }
.ge-t thead th { position:sticky; top:0; z-index:2; background:var(--stone); color:var(--orange);
  font-weight:600; font-size:10.5px; letter-spacing:.05em; text-transform:uppercase; text-align:right;
  padding:8px 5px; border-bottom:2px solid var(--edge); cursor:pointer; white-space:nowrap;
  text-shadow:1px 1px 0 #000; box-shadow:inset 0 1px 0 var(--stone-hi); }
.ge-t thead th:first-child { text-align:left; left:0; z-index:3; }
/* the item column stays put while the board scrolls sideways — a row should
   never lose its name */
.ge-t tbody td:first-child { position:sticky; left:0; z-index:1; background:var(--inset); }
.ge-t tbody tr:hover td:first-child { background:#332c22; }
.ge-t thead th.on { color:var(--yellow); }
.ge-t thead th .arr { font-size:9px; margin-left:3px; }
.ge-t tbody td { padding:6px 5px; text-align:right; font-family:var(--mono); font-size:12.5px;
  border-bottom:1px solid #221d16; white-space:nowrap; }
.ge-t tbody td:first-child { text-align:left; font-family:inherit; font-size:13px; }
.ge-t tbody tr { cursor:pointer; }
.ge-t tbody tr:hover { background:#332c22; }
.ge-t tbody tr:hover td:first-child .nm { color:var(--yellow); }
/* a long name truncates so its flags and the rest of the row stay in view; the cell's title carries it whole */
.ge-t .nm { color:var(--white); text-shadow:1px 1px 0 #000; display:inline-block; max-width:150px; overflow:hidden;
  text-overflow:ellipsis; white-space:nowrap; vertical-align:bottom; }
.ge-t .good { color:var(--good); } .ge-t .bad { color:var(--bad); } .ge-t .warn { color:var(--warn); }
.ge-t .mut { color:var(--tan); } .ge-t .gold { color:var(--orange); }
.ge-mem { color:#d0a0e8; font-size:10px; margin-left:6px; border:1px solid #5a4470; border-radius:2px; padding:0 4px; font-family:var(--mono); }
.ge-mem.off { color:var(--dark-tan); border-color:var(--dark-tan); }
.ge-flag { color:var(--warn); font-size:10px; margin-left:6px; border:1px dashed #6e5426; border-radius:2px; padding:0 4px; font-family:var(--mono); cursor:help; }
.ge-flag.tC { color:var(--bad); border-color:#6e2f26; }
.ge-more { padding:9px 12px; font-size:12px; color:var(--tan); text-align:center; }
@media (max-width:1100px){ .hide-md{display:none} }
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
.ge-order .vs { font-size:12px; margin-top:4px; font-family:var(--mono); color:var(--tan); }
.ge-order .vs b { font-weight:600; color:var(--white); }
.ge-order .vs b.good { color:var(--good); } .ge-order .vs b.warn { color:var(--warn); }
.ge-order .sub { font-size:11px; color:var(--dark-tan); margin-top:4px; line-height:1.4; }

/* margin slider */
.ge-slider { margin-bottom:12px; padding:10px 12px; }
.ge-slider .lab { display:flex; justify-content:space-between; align-items:baseline; gap:10px; flex-wrap:wrap;
  font-size:12px; color:var(--tan); margin-bottom:6px; text-shadow:1px 1px 0 #000; }
.ge-slider .lab b { font-family:var(--mono); font-size:14px; color:var(--yellow); font-weight:600; }
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
.ge-sumrow div b span { font-size:inherit; display:inline; margin:0; text-transform:none; letter-spacing:0; font-family:inherit; }
.ge-note { font-size:11.5px; color:var(--tan); line-height:1.5; margin:8px 0 0; }
.ge-note.caution { color:#f1c286; }
.ge-link { color:var(--orange); text-decoration:none; border-bottom:1px dotted var(--orange); font-size:12px; }
.ge-link:hover { color:var(--yellow); border-color:var(--yellow); }

.ge-foot { text-align:center; color:var(--dark-tan); font-size:11px; margin-top:18px; line-height:1.6; }

/* tabs */
.ge-tabs { display:flex; gap:6px; margin-bottom:12px; flex-wrap:wrap; }
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

/* ================= job board — the notice board =================
   A stone toolbar and a one-line character strip above a wooden board of
   parchment notices; a notice carries only the essentials and lifts into a
   stone contract on click. Paper on wood, not more stone. */
.ge-toolbar { padding:11px 13px; margin-bottom:10px; }
.ge-moderow { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
.ge-modehint { font-size:12px; color:var(--tan); margin:6px 0 0; text-shadow:1px 1px 0 #000; }
.ge-skillrow { display:flex; gap:6px; flex-wrap:wrap; align-items:center; margin-top:10px; padding-top:10px; border-top:1px solid #221d16; }
.ge-pixlbl { font-family:var(--pixel); font-size:10.5px; color:var(--tan); text-transform:uppercase; letter-spacing:.1em; margin-right:2px; text-shadow:1px 1px 0 #000; }
.ge-filterrow { display:flex; gap:10px; flex-wrap:wrap; align-items:center; margin-top:10px; padding-top:10px; border-top:1px solid #221d16; }
.ge-filterrow .grow { flex:1 1 200px; min-width:140px; }
.ge-btn.on { color:var(--yellow); background:var(--stone-hi); box-shadow:inset 1px 1px 0 var(--stone-lo), inset -1px -1px 0 var(--stone-hi); }
.ge-btn.small { padding:3px 9px; font-size:11.5px; }

/* the character strip: the sheet in one line, the editor beneath on click */
.ge-charstrip { display:flex; align-items:center; overflow-x:auto; margin-bottom:14px; padding:0; width:100%; text-align:left;
  font:inherit; color:var(--white); cursor:pointer; }
.ge-charstrip .cs-inner { display:flex; align-items:center; gap:14px; padding:8px 13px; white-space:nowrap; min-width:100%; }
.ge-charstrip .rsn { font-family:var(--disp); font-weight:700; color:var(--orange); font-size:14px; text-shadow:1px 1px 0 #000; flex:none; }
.ge-charstrip .cell { display:inline-flex; align-items:center; gap:5px; font-family:var(--mono); font-size:12.5px; text-shadow:1px 1px 0 #000; flex:none; }
.ge-charstrip .ge-mem { margin-left:0; flex:none; }
.ge-charstrip .cell .g { font-size:14px; }
.ge-charstrip .cell b { font-weight:600; }
.ge-charstrip .cell b.blank { color:var(--dark-tan); font-weight:400; }
.ge-charstrip .quests { font-family:var(--mono); font-size:12px; color:var(--tan); flex:none; }
.ge-charstrip .hint { margin-left:auto; font-size:11px; color:var(--dark-tan); flex:none; }
.ge-charstrip:hover { background:#463b2c; }
.ge-charstrip[aria-expanded="true"] { margin-bottom:0; border-bottom-left-radius:0; border-bottom-right-radius:0; }
.ge-sheet-editor { padding:12px 13px 13px; margin-bottom:14px; border-top:none; }
.ge-sheet-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(150px,1fr)); gap:8px 14px; }
.ge-sheet-grid label { display:flex; align-items:center; justify-content:space-between; gap:8px; font-size:12.5px; color:var(--tan); text-shadow:1px 1px 0 #000; }
.ge-sheet-grid label .g { margin-right:4px; }
.ge-sheet-grid input[type=number] { width:56px; text-align:right; font-family:var(--mono); font-size:13px; padding:5px 6px; }
.ge-sheet-grid input[type=checkbox] { width:16px; height:16px; accent-color:var(--orange); }
.ge-sheet-quests { display:flex; gap:8px 16px; flex-wrap:wrap; align-items:center; margin-top:10px; padding-top:10px; border-top:1px solid #221d16; }
.ge-qlbl { display:inline-flex; align-items:center; gap:6px; font-size:12.5px; text-shadow:1px 1px 0 #000; cursor:pointer; }
.ge-qlbl.done { color:var(--good); } .ge-qlbl.todo { color:var(--bad); }
.ge-qlbl input { accent-color:currentColor; width:14px; height:14px; }
.ge-sheet-rsn { display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-top:10px; padding-top:10px; border-top:1px solid #221d16; }
.ge-sheet-rsn input[type=text] { width:150px; }
.ge-sheet-rsn .msg { font-size:12px; color:var(--tan); text-shadow:1px 1px 0 #000; }
.ge-sheet-note { font-size:11.5px; color:var(--dark-tan); margin:10px 0 0; line-height:1.45; }

/* the board: a wooden ground, notices in a grid */
.ge-board { background:var(--wood); background-image:repeating-linear-gradient(to bottom, transparent 0 89px, var(--wood-seam) 89px 90px);
  border:1px solid var(--edge); border-radius:2px; padding:18px; margin-bottom:12px;
  display:grid; grid-template-columns:repeat(auto-fill,minmax(250px,1fr)); gap:14px; }
.ge-notice { position:relative; background:var(--paper); color:var(--ink); border:1px solid var(--paper-edge); border-radius:1px;
  box-shadow:2px 3px 0 rgba(0,0,0,.45); padding:16px 12px 11px; text-align:left; cursor:pointer;
  font-family:'Segoe UI',system-ui,-apple-system,Roboto,sans-serif; font-size:14px; line-height:1.45;
  display:flex; flex-direction:column; gap:6px; transform:rotate(var(--tilt,0deg)); }
.ge-notice:hover { background:#efe4c2; }
.ge-notice:focus-visible { outline:3px solid var(--yellow); outline-offset:2px; }
.ge-notice .pin { position:absolute; top:-6px; left:50%; transform:translateX(-50%); width:11px; height:11px; border-radius:50%;
  background:radial-gradient(circle at 35% 30%, var(--pin-hi), var(--pin) 65%, #33302a); border:1px solid #16130f; box-shadow:0 1px 2px rgba(0,0,0,.6); }
.ge-notice.faded { opacity:.55; filter:grayscale(65%); }
.ge-notice .stamps { position:absolute; top:6px; right:6px; display:flex; flex-direction:column; align-items:flex-end; gap:2px; pointer-events:none; }
.ge-stamp { font-family:var(--pixel); font-size:9.5px; letter-spacing:.06em; text-transform:uppercase; border:1.5px solid var(--stamp); color:var(--stamp);
  border-radius:2px; padding:1px 5px; transform:rotate(6deg); opacity:.82; background:rgba(232,220,181,.55); }
.ge-stamp.purple { border-color:var(--stamp2); color:var(--stamp2); }
.ge-notice h3 { margin:0; font-family:var(--disp); font-weight:700; font-size:15.5px; color:var(--ink); letter-spacing:.01em; line-height:1.2; padding-right:34px; }
.ge-notice .pay { font-family:var(--mono); font-size:20px; font-weight:700; line-height:1.1; font-variant-numeric:tabular-nums; }
.ge-notice .pay.good { color:var(--paper-good); } .ge-notice .pay.bad { color:var(--paper-bad); }
.ge-notice .line2 { font-family:var(--mono); font-size:11.5px; color:var(--ink-soft); font-variant-numeric:tabular-nums; }
.ge-notice .line2 .eq { white-space:nowrap; }
.ge-notice .line2 b { font-weight:700; } .ge-notice .line2 b.good { color:var(--paper-good); } .ge-notice .line2 b.bad { color:var(--paper-bad); }
.ge-notice .reqs { display:flex; gap:4px; flex-wrap:wrap; margin-top:2px; }
.ge-nchip { font-family:var(--mono); font-size:10px; border-radius:2px; padding:1px 5px; border:1px solid; white-space:nowrap; }
.ge-nchip.ok { color:var(--paper-good); border-color:var(--paper-good); background:rgba(31,107,31,.08); }
.ge-nchip.no { color:var(--paper-bad); border-color:var(--paper-bad); background:rgba(139,29,29,.08); }
.ge-nchip.unk { color:var(--ink-soft); border-color:var(--ink-soft); background:rgba(42,32,20,.06); }
.ge-notice.empty { grid-column:1/-1; max-width:420px; margin:0 auto; cursor:default; transform:none; }
.ge-notice.empty h3 { padding-right:0; }
.ge-notice.empty p { margin:2px 0 0; font-size:12.5px; color:var(--ink-soft); line-height:1.5; }

/* the contract: what the notice leaves out */
.ge-examine { margin:5px 0 0; font-size:12.5px; font-style:italic; color:var(--tan); text-shadow:1px 1px 0 #000; }
.ge-reqlist { display:flex; flex-direction:column; gap:4px; margin:0 0 12px; font-family:var(--mono); font-size:12.5px; }
.ge-reqlist .r { display:flex; gap:8px; }
.ge-reqlist .r.ok { color:var(--good); } .ge-reqlist .r.no { color:var(--bad); } .ge-reqlist .r.unk { color:var(--tan); cursor:help; }
.ge-batchpanel { display:flex; align-items:center; gap:12px; flex-wrap:wrap; margin-bottom:12px; }
.ge-batch { display:inline-flex; align-items:center; gap:8px; }
.ge-batch .ge-btn { font-family:var(--mono); }
.ge-batch b { font-family:var(--mono); font-size:17px; color:var(--yellow); min-width:64px; text-align:center; }
.ge-capnote { font-size:11.5px; color:var(--dark-tan); }
.ge-ledger { padding:9px 11px; font-family:var(--mono); font-size:12.5px; line-height:1.8; margin-bottom:12px; font-variant-numeric:tabular-nums; }
.ge-ledger .op { display:inline-block; width:50px; font-weight:700; letter-spacing:.05em; font-size:11px; }
.ge-ledger .op.buy { color:var(--good); } .ge-ledger .op.work { color:var(--orange); } .ge-ledger .op.sell { color:var(--bad); }
.ge-ledger .clock { color:var(--dark-tan); font-size:11.5px; }
.ge-facts { display:flex; gap:8px 20px; flex-wrap:wrap; font-family:var(--mono); font-size:12.5px; padding:9px 11px; margin-bottom:12px; }
.ge-facts div span { display:block; font-family:'Segoe UI',system-ui,sans-serif; font-size:10px; color:var(--tan); letter-spacing:.1em; text-transform:uppercase; margin-bottom:2px; text-shadow:1px 1px 0 #000; }
.ge-facts div b { font-weight:600; color:var(--white); }
.ge-facts .good { color:var(--good); } .ge-facts .bad { color:var(--bad); } .ge-facts .warn { color:var(--warn); } .ge-facts .gold { color:var(--orange); }
.ge-warnnote { font-size:12px; color:#f1d08a; line-height:1.5; margin:0; padding:9px 11px; border:1px solid #6e5426; background:#33270f; border-radius:2px; }
@media (max-width:600px){
  .ge-board { grid-template-columns:1fr; padding:12px; }
  .ge-moderow .ge-btn { flex:1 1 0; text-align:center; }
}

/* econ 101 */
.ge-econ h3 { margin:0 0 7px; font-family:var(--disp); font-weight:700; font-size:16.5px; color:var(--orange);
  letter-spacing:.02em; text-shadow:2px 2px 0 #000; }
.ge-econ p { margin:0 0 9px; font-size:13.5px; line-height:1.6; color:var(--white); text-shadow:1px 1px 0 #000; }
.ge-econ ul { margin:0 0 9px; padding-left:20px; font-size:13.5px; line-height:1.6; text-shadow:1px 1px 0 #000; }
.ge-econ li { margin:0 0 6px; }
.ge-econ li::marker { color:var(--orange); }
.ge-econ b { color:var(--yellow); font-weight:600; }
.ge-econ p:last-child, .ge-econ ul:last-child { margin-bottom:0; }

/* the week, on the board and in the popup */
.ge-t .ge-spark { vertical-align:middle; margin-left:6px; }
.ge-t td.rng { padding-top:3px; padding-bottom:3px; }
.ge-rng { display:inline-flex; align-items:center; gap:4px; cursor:help; }
.ge-rng small { font-size:10.5px; color:var(--dark-tan); }
.ge-week { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:8px 16px; padding:10px 12px; margin-bottom:12px;
  font-family:var(--mono); font-size:13.5px; }
.ge-week div { display:flex; align-items:center; gap:6px; flex-wrap:wrap; }
.ge-week div span { flex:0 0 100%; font-family:'Segoe UI',system-ui,sans-serif; font-size:10.5px; color:var(--tan);
  letter-spacing:.1em; text-transform:uppercase; text-shadow:1px 1px 0 #000; }
.ge-week div b { font-weight:600; color:var(--white); }
.ge-week div b.good { color:var(--good); } .ge-week div b.bad { color:var(--bad); } .ge-week div b.mut { color:var(--tan); }
.ge-week small { font-family:'Segoe UI',system-ui,sans-serif; color:var(--dark-tan); font-size:11px; }
.ge-week small.warn { color:var(--warn); } .ge-week small.mut { color:var(--dark-tan); }
.ge-week .ge-spark.good { color:var(--good); } .ge-week .ge-spark.bad { color:var(--bad); } .ge-week .ge-spark.mut { color:var(--tan); }
.ge-conf { display:flex; gap:6px; flex-wrap:wrap; }
.ge-conf .ge-btn { font-family:var(--mono); font-size:12px; padding:4px 10px; }
.ge-conf .ge-btn.on { color:var(--yellow); box-shadow:inset 1px 1px 0 var(--stone-lo), inset -1px -1px 0 var(--stone-hi); }
.ge-chart { padding:10px 12px; margin-bottom:12px; }
.ge-wait { padding:16px 12px; margin-bottom:12px; color:var(--tan); font-size:13px; text-align:center; text-shadow:1px 1px 0 #000; }
.ge-now { display:flex; gap:6px 16px; flex-wrap:wrap; align-items:baseline; padding:8px 12px; margin:2px 0 10px;
  font-size:12px; color:var(--tan); text-shadow:1px 1px 0 #000; }
.ge-now .k { font-size:10.5px; letter-spacing:.18em; text-transform:uppercase; color:var(--orange); font-weight:600; }
.ge-now b { color:var(--white); font-family:var(--mono); font-weight:600; }
.ge-now .warn { color:var(--warn); }
.ge-order .fill b.good { color:var(--good); } .ge-order .fill b.warn { color:var(--warn); } .ge-order .fill b.bad { color:var(--bad); }
.ge-note b.good { color:var(--good); } .ge-note b.warn { color:var(--warn); } .ge-note b.bad { color:var(--bad); }
${CHART_CSS}
${BASKET_CSS}
${CM_CSS}
`;

/* ================= item popup =================
   The desk's answer for one item: two standing orders priced to fill within a
   day of normal cycling, read off the last LOOKBACK complete days of the
   hourly tape. Each day yields the cheapest price a standing buy could have
   filled the quantity, and the dearest a standing sell could have; the orders
   are the prices that would have filled on all but `slack` of those days.
   Sizing up needs more of each day's flow, so the prices tighten with
   quantity — the margin-versus-size trade-off is visible, not assumed. */
const SLACKS = [
  { s: 0, label: "Every day", hint: "The safest prices: on every one of the last %n days a standing offer here would have filled. Thinnest margin." },
  { s: 1, label: "All but one", hint: "One miss allowed — the usual setting. A bad day happens; two in a row is a trend." },
  { s: 2, label: "All but two", hint: "Greedier prices that missed on two of the last %n days. Expect to wait out the odd day." },
];
const hitClass = (hits, n) => (hits >= n ? "good" : hits >= n - 1 ? "" : hits >= n - 2 ? "warn" : "bad");

function ItemPopup({ it, status, onClose }) {
  const [slack, setSlack] = useState(1);
  const [qty, setQty] = useState(it.limit);
  const [hist, setHist] = useState(null);     // complete days of the hourly tape, oldest first
  const [histErr, setHistErr] = useState(null);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [onClose]);

  // one request per opened item: ~15 days of hourly prices and volumes
  useEffect(() => {
    let gone = false;
    setHist(null); setHistErr(null);
    apiGet("timeseries", `/timeseries?timestep=1h&id=${it.id}`)
      .then((j) => { if (!gone) setHist(completeDays(Array.isArray(j?.data) ? j.data : [], Math.floor(Date.now() / 1000))); })
      .catch((e) => { if (!gone) setHistErr(e); });
    return () => { gone = true; };
  }, [it.id]);

  const q = clamp(Math.round(qty) || 1, 1, it.limit);
  const taxOf = useCallback((px) => geTax(px, it.id), [it.id]);
  const m = useMemo(() => {
    if (!hist) return null;
    const week = hist.slice(-LOOKBACK);
    const fills = dayFills(week, q, CAPTURE);
    const n = fills.length;
    // a thin history can't spare the misses asked for — settle on the most it can
    const s = Math.min(slack, Math.max(0, n - 1));
    const k = Math.max(1, n - s);
    const o = cycleOrders(fills, k, taxOf);
    const buyHits = o.buyDays.filter(Boolean).length;
    const sellHits = o.sellDays.filter(Boolean).length;
    return { week, fills, n, k, slack: s, o, buyHits, sellHits, prof: hourProfile(week), ho: holdout(hist, q, CAPTURE, k, taxOf) };
  }, [hist, q, slack, taxOf]);
  const o = m?.o;
  const cost = o?.buy != null ? q * o.buy : null;
  const back = o?.sell != null ? q * (o.sell - o.tax) : null;
  const profit = o?.margin != null ? q * o.margin : null;
  const units = it.dv7 > 0 ? it.dv7 : it.dv;
  // each order against the week's going rate: how far under market the buy
  // sits, how far over it the sell — the desk's edge, as a percentage
  const rate = it.rate ?? it.mid;
  const vsRate = (p) => (p != null && rate > 0 ? ((p - rate) / rate) * 100 : null);
  const buyVs = vsRate(o?.buy), sellVs = vsRate(o?.sell);
  const tc = trendClass(it.trend);
  const weekLabel = rangeLabel(it);

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
            <span>Traded <b>{fmtQty(units)}</b> / day ≈ <b>{fmtGp(it.turnover)}</b> gp</span>
            {it.official != null && <span>GE price <b>{fmtGp(it.official)}</b> · the week sits {fmtDev(it.dev)}</span>}
            {taxOf(it.high) === 0 && <span style={{ color: "var(--good)" }}>No GE tax</span>}
          </div>

          {/* the week */}
          <div className="ge-week ge-inset">
            <div><span>Going rate</span><b>{fmtGp(rate)}</b><small>{it.rate != null ? `${it.nDays}-day average` : "today only"}</small></div>
            <div><span>Week's range</span><b>{it.rangeLo != null ? `${fmtGp(it.rangeLo)} – ${fmtGp(it.rangeHi)}` : "–"}</b></div>
            <div><span>Trend</span><b className={tc}>{fmtDev(it.trend)}</b><Sparkline points={it.mids || []} className={"ge-spark " + tc} /></div>
            <div><span>Today</span><b>{fmtGp(it.mid)}</b><RangeBar lo={it.rangeLo} hi={it.rangeHi} now={it.mid} label={weekLabel} /><small className={devClass(it.todayVs)}>{fmtDev(it.todayVs)} vs week</small></div>
          </div>

          {!m && !histErr && <div className="ge-wait ge-inset">Reading the last two weeks of trades…</div>}
          {histErr && (
            <p className="ge-note caution">
              ⚠ The hourly tape is unreachable{status === "snapshot" ? " while offline" : ""} — the day orders need it. The
              week's going rates above still stand; try again when the feed is back.
            </p>
          )}

          {m && <>
            {/* the two standing orders */}
            <div className="ge-orders">
              <div className="ge-order buy ge-inset">
                <div className="k">Buy Offer</div>
                {o.buy != null ? <>
                  <div className="p">{fmtFull(o.buy)} <span>gp each × {fmtFull(q)}</span></div>
                  <div className="fill">filled on <b className={hitClass(m.buyHits, m.n)}>{m.buyHits} of {m.n}</b> days</div>
                  <div className="vs"><b className={buyVs <= 0 ? "good" : "warn"}>{fmtDev(buyVs)}</b> vs the going rate of <b>{fmtGp(rate)}</b></div>
                  <div className="sub">
                    On each of those days at least {fmtFull(q)} insta-sold at or below this price, counting half the
                    flow as yours. Last insta-sell {agoStr(it.staleLo)}.
                  </div>
                </> : <>
                  <div className="p">—</div>
                  <div className="fill"><b className="bad">no price</b> fills {fmtFull(q)} on {m.k} days</div>
                  <div className="sub">Only {o.buyAble} of the last {m.n} days saw enough selling to fill {fmtFull(q)} at any price — size down.</div>
                </>}
              </div>
              <div className="ge-order sell ge-inset">
                <div className="k">Sell Offer</div>
                {o.sell != null ? <>
                  <div className="p">{fmtFull(o.sell)} <span>gp each × {fmtFull(q)}</span></div>
                  <div className="fill">filled on <b className={hitClass(m.sellHits, m.n)}>{m.sellHits} of {m.n}</b> days</div>
                  <div className="vs"><b className={sellVs >= 0 ? "good" : "warn"}>{fmtDev(sellVs)}</b> vs the going rate of <b>{fmtGp(rate)}</b></div>
                  <div className="sub">
                    {o.tax > 0 ? <>GE tax takes {fmtFull(o.tax)} gp each. </> : null}
                    On each of those days at least {fmtFull(q)} insta-bought at or above this price, counting half the
                    flow as yours. Last insta-buy {agoStr(it.staleHi)}.
                  </div>
                </> : <>
                  <div className="p">—</div>
                  <div className="fill"><b className="bad">no price</b> fills {fmtFull(q)} on {m.k} days</div>
                  <div className="sub">Only {o.sellAble} of the last {m.n} days saw enough buying to fill {fmtFull(q)} at any price — size down.</div>
                </>}
              </div>
            </div>

            {/* confidence */}
            <div className="ge-slider ge-inset">
              <div className="lab">
                <span>Margin per item: <b>{o.margin != null ? `${fmtFull(o.margin)} gp` : "—"}</b>{o.roi != null && (
                  <> <span style={{ color: o.margin > 0 ? "var(--good)" : "var(--bad)" }}>({o.roi.toFixed(o.roi >= 10 ? 0 : 1)}% after tax)</span></>
                )}</span>
                <span>round trip ≈ <b style={{ color: "var(--white)" }}>2 days</b></span>
              </div>
              <div className="ge-conf" role="radiogroup" aria-label="How many of the last days the orders must have filled on">
                {SLACKS.map((c) => (
                  <button key={c.s} className={"ge-btn" + (m.slack === c.s ? " on" : "")} role="radio" aria-checked={m.slack === c.s}
                    disabled={m.n - c.s < 1} onClick={() => setSlack(c.s)}>
                    {c.label} · {Math.max(1, m.n - c.s)} of {m.n}
                  </button>
                ))}
              </div>
              <div className="ge-hint">{SLACKS[m.slack].hint.replace("%n", m.n)} A day to buy, a day to sell — the orders sit and the cycle comes to them.</div>
            </div>

            {/* quantity */}
            <div className="ge-qtyrow">
              <label htmlFor="ge-qty">Quantity</label>
              <input id="ge-qty" className="ge-in" type="number" min={1} max={it.limit} value={qty}
                onChange={(e) => setQty(clamp(Math.round(+e.target.value || 1), 1, it.limit))} />
              <span className="cap">of the {it.limit.toLocaleString()} you can buy per 4 hours — sizing up needs more of each day's flow, so the prices tighten</span>
            </div>

            {/* summary */}
            <div className="ge-sumrow ge-inset">
              <div><span>You lay out</span><b>{cost != null ? fmtGp(cost) + " gp" : "—"}</b></div>
              <div><span>Back after tax</span><b>{back != null ? fmtGp(back) + " gp" : "—"}</b></div>
              <div><span>Profit</span><b className={profit == null ? "" : profit > 0 ? "good" : "bad"}>{profit == null ? "—" : (profit > 0 ? "+" : "") + fmtGp(profit) + " gp"}</b></div>
              <div><span>Vs going rate</span><b><span className={buyVs <= 0 ? "good" : "bad"}>{fmtDev(buyVs)}</span> / <span className={sellVs >= 0 ? "good" : "bad"}>{fmtDev(sellVs)}</span></b></div>
              <div><span>Round trip</span><b className="gold">≈ 2 days</b></div>
            </div>

            {/* the week's cycle, with the orders drawn across it */}
            <div className="ge-chart ge-inset">
              <CycleChart days={m.week} buy={o.buy} sell={o.sell} rate={it.rate} buyDays={o.buyDays} sellDays={o.sellDays} fmt={fmtGp} />
            </div>

            {/* time of day */}
            {m.prof.troughH != null && m.prof.peakH != null && (
              <div className="ge-chart ge-inset">
                <p className="ge-hint" style={{ margin: "0 0 8px" }}>
                  Over the week the cheapest hours ran around <b>{hh(m.prof.troughH)} UTC</b> and the dearest around{" "}
                  <b>{hh(m.prof.peakH)} UTC</b>. A buy placed before the trough and a sell placed before the peak spend
                  the least time waiting.
                </p>
                <HourProfile profile={m.prof.hours} troughH={m.prof.troughH} peakH={m.prof.peakH} fmt={fmtGp} />
              </div>
            )}

            {/* the honesty check */}
            {m.ho && m.ho.orders.buy != null && m.ho.orders.sell != null && (
              <p className="ge-note">
                Judged against the week before: fitted to those days alone, the same rule would then have bought on{" "}
                <b className={hitClass(m.ho.buyHits, m.ho.n)}>{m.ho.buyHits} of {m.ho.n}</b> and sold on{" "}
                <b className={hitClass(m.ho.sellHits, m.ho.n)}>{m.ho.sellHits} of {m.ho.n}</b> of the days that followed.
              </p>
            )}
          </>}

          {/* right now — a sanity check before the orders go in */}
          <div className="ge-now ge-inset">
            <span className="k">Right now</span>
            {it.src === "day"
              ? <span>nothing on the tape this hour — today's price is the latest daily average</span>
              : <span>last hour's buy <b>{fmtGp(it.low1h ?? it.low)}</b> / sell <b>{fmtGp(it.high1h ?? it.high)}</b>, {fmtFull(it.margin)} gp at the touch</span>}
            {it.lastLow != null && it.lastHigh != null && (
              <span>last prints <b>{fmtFull(it.lastLow)}</b> / <b>{fmtFull(it.lastHigh)}</b> ({agoStr(it.staleLo)} / {agoStr(it.staleHi)})</span>
            )}
            {it.crossed && <span className="warn">⚠ prints crossed — the price is moving right now</span>}
            {it.moving && !it.crossed && <span className="warn">⚠ 5-min tape {Math.abs(it.movePct).toFixed(0)}% {it.movePct > 0 ? "above" : "below"} the hour</span>}
          </div>

          {it.trend != null && Math.abs(it.trend) >= 5 && (
            <p className="ge-note caution">
              ⚠ Trending {it.trend > 0 ? "up" : "down"} {Math.abs(it.trend).toFixed(0)}% on the week.{" "}
              {it.trend > 0
                ? "A buy target read off last week's dips may not come back, while a sell fills easily on a rising price."
                : "A sell target read off last week's peaks may not come back, while a buy fills easily on a falling price and then waits."}{" "}
              Lean on the fresher days and probe with 1.
            </p>
          )}
          {it.nDays != null && it.nDays > 0 && it.nDays < LOOKBACK && (
            <p className="ge-note caution">
              ⚠ Thin week: only {it.nDays} of the last {LOOKBACK} days saw two-sided trading. The weekly numbers rest on
              fewer days than they'd like.
            </p>
          )}
          {it.official != null && Math.abs(it.dev) >= 10 && (
            <p className="ge-note caution">
              ⚠ The week's real trades sit {Math.abs(it.dev).toFixed(0)}% {it.dev > 0 ? "above" : "below"} the official
              GE price — Jagex's lagged daily average of every trade in the game. Either the market genuinely moved
              and the GE price hasn't caught up, or someone is painting one of the two.{" "}
              {it.dev > 0
                ? "While the gap holds, sellers still anchored to the GE price keep feeding the book below the market — standing buy offers eat well."
                : "While the gap holds, buyers still anchored to the GE price keep paying over the market — standing sell offers eat well."}{" "}
              On thin volume, assume the worst.
            </p>
          )}
          {status === "snapshot" && (
            <p className="ge-note caution">⚠ Offline snapshot — the week's numbers are as of {fmtDay(SNAPSHOT.ts)}; check the live desk before placing anything.</p>
          )}
          <p className="ge-note">
            The day orders assume a standing offer at a better-than-going price heads the queue and catches about half
            of that hour's counter-flow, and that the coming week cycles like the last. Estimates, not promises.{" "}
            <a className="ge-link" href={`https://prices.runescape.wiki/osrs/item/${it.id}`} target="_blank" rel="noreferrer">
              Price history on the wiki ↗
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

/* ================= the job board's arithmetic =================
   Resource-processing work priced by the market itself: buy the inputs, do the
   skilling, sell the product. Focus is the whole job — what it pays, what it
   costs to start, how long it takes, and whether you have the levels — never
   gp/hr: it's low-intensity work and your GE slots run concurrently anyway.

   "Start now" (express) crosses the spread on both ends (insta-buy the inputs,
   insta-sell the product): thinner pay, but the job starts and ends NOW.
   "Full margin" (patient) prices at the week's going rates on both ends for
   the whole margin, with a day-scale clock on each leg. */
const SKILL_LIST = ["Smithing", "Crafting", "Fletching", "Cooking", "Herblore", "Magic"];
// almost every unlock is a quest; the exceptions get their own tooltip
const UNLOCK_NOTE = {
  "Broader Fletching": "Slayer reward unlock — 300 points at any Slayer master",
  "Lunar Diplomacy": "Quest — and these are Lunar spells, cast after swapping spellbooks at the Astral altar",
  "Dream Mentor": "Quest (after Lunar Diplomacy) — Lunar spellbook spells, swap at the Astral altar",
  "Arceuus spellbook": "Spellbook swap at Tyss beside the Dark Altar — free, no quest",
};
const unlockNote = (u) => UNLOCK_NOTE[u] || "Quest required — tick it off in your sheet once it's done";
const GEAR_NOTE = {
  "Ring of forging": "Wear one at the furnace — without it half your iron ore burns away. One ring covers ~140 smelts for a few gp each.",
};
const gearNote = (g) => GEAR_NOTE[g] || "Hand tool required — a few gp from a shop";
// seconds per action by facility — desk-assumption FALLBACKS only: since the
// recipe data moved to the wiki's Bucket API, most recipes carry their real
// tick count (r.t) and these cover the few that don't
const RATE = {
  Furnace: 3.0, Anvil: 3.0, "Cooking range": 2.4, Fire: 2.4,
  "Spinning wheel": 3.0, Loom: 4.8, "Pottery Oven": 3.0, "Potter's Wheel": 3.0,
  "Dairy churn": 3.0, Tannery: 1.2, "": 1.8,
};
const TICK = 0.6; // one game tick, in seconds
const secsOf = (r) => (r.t ? r.t * TICK : RATE[r.f] ?? 3.0);
const OVERHEAD = 1.15; // bank trips, misclicks, being human
/* A chain's margin is the market paying a wage for the labor in it, so "too
   good to be true" is judged against the WORK, not the outlay: a labor-heavy
   chain (a keel, a full smelting run) earning a fat margin is just a real
   need priced by a real market — nobody else wants to do the work. What a
   liquid market never leaves lying around is near-free money: big pay on
   almost no labor. Honest skilling work tops out around a few hundred k
   gp/hr, so a chain implying several times that per hour of hands-on work
   is more likely thin or stale data than a genuine wage. */
const RICH_GP_PER_WORK_HOUR = 2_000_000;
const verbOf = (r) => {
  if (r.s === "Magic") {
    if (r.a) return r.l >= 55 ? "High alch" : "Low alch";
    return r.m?.some(([i]) => RECIPES.names[i] === "Cosmic rune") ? "Enchant" : "Cast";
  }
  if (r.f === "Tannery") return "Tan";
  if (!r.s) return "Combine"; // skill-less work: tanning fees, doughs, poisons
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

/* Express work crosses the spread NOW, so it prices off the freshest tape.
   Patient work plays out over a day or more, so its quotes anchor to the
   week's going rate on each side — slower actions should lean on slower,
   steadier data — falling back to the hour when the week is silent. */
const jobBuyPx = (it, mode) => (mode === "express" ? it.high : Math.round(it.rateLo ?? it.low1h ?? it.low));
const jobSellPx = (it, mode) => (mode === "express" ? it.low : Math.round(it.rateHi ?? it.high1h ?? it.high));

/* Semi-precious gems crush on a failed cut — the level requirement is real but
   the yield isn't 100%. r.x = [b, a]: success/256 = min(256, b + (lvl−1)·a/98). */
const succOf = (r, skills) => {
  if (!r.x) return 1;
  const have = skills?.[r.s];
  const lvl = clamp(have === "" || have == null ? 1 : +have || 1, r.l, 99);
  return Math.min(256, r.x[0] + ((lvl - 1) * r.x[1]) / 98) / 256;
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
function sourceUnit(nameIdx, mode, byName, memo, visiting, skills) {
  if (memo.has(nameIdx)) return memo.get(nameIdx);
  const name = RECIPES.names[nameIdx];
  if (name === "Coins") {
    const plan = { cost: 1, secs: 0, buys: [], steps: [], coins: 1 };
    memo.set(nameIdx, plan);
    return plan;
  }
  const it = byName.get(name);
  const buyCost = it ? jobBuyPx(it, mode) : null;
  let best = buyCost != null
    ? { cost: buyCost, secs: 0, buys: [[nameIdx, 1]], steps: [], coins: 0 }
    : null;

  if (!visiting.has(nameIdx) && visiting.size < 3) {
    visiting.add(nameIdx);
    for (const r of RECIPES_BY_OUT.get(nameIdx) || []) {
      let cost = 0, secs = secsOf(r) / r.q, coins = 0, ok = true;
      const buys = new Map(), steps = new Map([[JSON.stringify(r), 1 / r.q]]);
      for (const [mi, mq] of r.m) {
        const sub = sourceUnit(mi, mode, byName, memo, visiting, skills);
        if (!sub) { ok = false; break; }
        const per = mq / r.q;
        cost += sub.cost * per; secs += sub.secs * per; coins += sub.coins * per;
        for (const [bi, bq] of sub.buys) buys.set(bi, (buys.get(bi) || 0) + bq * per);
        for (const [sk, sc] of sub.steps) steps.set(sk, (steps.get(sk) || 0) + sc * per);
      }
      if (!ok) continue;
      // a crushable step means 1/p attempts (and material sets) per success
      const p = succOf(r, skills);
      if (p < 1) {
        cost /= p; secs /= p; coins /= p;
        for (const [bi, bq] of buys) buys.set(bi, bq / p);
        for (const [sk, sc] of steps) steps.set(sk, sc / p);
      }
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
   tradeable output whose sale beats the cost of its parts. A training focus
   loosens the profit gate: work that costs gp but pays xp in that skill is
   exactly what a trainee is shopping for. */
function buildJobs(items, mode, skills, focus) {
  const byName = new Map(items.map((it) => [it.name, it]));
  const memo = new Map();
  const jobs = [];
  for (const [outIdx, variants] of RECIPES_BY_OUT) {
    const out = byName.get(RECIPES.names[outIdx]);
    if (!out) continue;
    const sellRaw = jobSellPx(out, mode);
    const sellUnit = sellRaw - geTax(sellRaw, out.id);
    let best = null;
    for (const r of variants) {
      // force the final step through THIS recipe; parts sourced their cheapest way
      let cost = 0, secs = secsOf(r) / r.q, coins = 0, ok = true;
      const buys = new Map(), steps = new Map([[JSON.stringify(r), 1 / r.q]]);
      const visiting = new Set([outIdx]);
      for (const [mi, mq] of r.m) {
        const sub = sourceUnit(mi, mode, byName, memo, visiting, skills);
        if (!sub) { ok = false; break; }
        const per = mq / r.q;
        cost += sub.cost * per; secs += sub.secs * per; coins += sub.coins * per;
        for (const [bi, bq] of sub.buys) buys.set(bi, (buys.get(bi) || 0) + bq * per);
        for (const [sk, sc] of sub.steps) steps.set(sk, (steps.get(sk) || 0) + sc * per);
      }
      if (!ok) continue;
      // a crushable final step means 1/p attempts (and material sets) per success
      const p = succOf(r, skills);
      if (p < 1) {
        cost /= p; secs /= p; coins /= p;
        for (const [bi, bq] of buys) buys.set(bi, bq / p);
        for (const [sk, sc] of steps) steps.set(sk, sc / p);
      }
      const profitUnit = sellUnit - cost;
      if (best == null || profitUnit > best.profitUnit) {
        best = { r, cost, secs: secs * OVERHEAD, coins, buys, steps, profitUnit };
      }
    }
    if (!best) continue;

    const stepList = [...best.steps].reverse().map(([sk, perUnit]) => ({ r: JSON.parse(sk), perUnit }));
    // xp earned per crafted unit, by skill: every step's action count × the
    // wiki's per-action xp (secondary skills too — superheat pays Magic xp)
    const xpMap = new Map();
    for (const s of stepList) {
      if (s.r.e && s.r.s) xpMap.set(s.r.s, (xpMap.get(s.r.s) || 0) + s.perUnit * s.r.e);
      for (const [kn, , kxp] of s.r.k || []) if (kxp) xpMap.set(kn, (xpMap.get(kn) || 0) + s.perUnit * kxp);
    }
    // paying jobs make the board on their own; when training a skill, work
    // that costs gp but pays xp in that skill belongs on it too
    if (best.profitUnit <= 0 && !(focus && xpMap.get(focus) > 0)) continue;

    // requirements across every step — listed in work order, raw materials first
    const levels = new Map(); const facilities = new Set(); const unlocks = new Set();
    let members = out.members;
    for (const s of stepList) {
      if (s.r.s) levels.set(s.r.s, Math.max(levels.get(s.r.s) || 0, s.r.l));
      // secondary skill requirements ride in with the recipe data now
      // (superheat's Magic 43, Lunar spinning's Crafting, ...)
      for (const [kn, kl] of s.r.k || []) levels.set(kn, Math.max(levels.get(kn) || 0, kl));
      if (s.r.f) facilities.add(s.r.f);
      if (s.r.u) unlocks.add(s.r.u);
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
        : Math.floor((CAPTURE * dayFlow(b.it, "lo")) / b.perUnit)); // a day of patient fills
    }
    caps.push(mode === "express" ? Math.floor(0.10 * out.dv) : Math.floor(CAPTURE * dayFlow(out, "hi")));
    const maxN = Math.max(0, Math.min(...caps));
    if (maxN < 1) continue;

    // sanity-check the chain: the implied wage — pay per hour of hands-on
    // work — is the tell. Beyond any honest skilling wage it's more often
    // thin or stale data than free money, and a C-grade or fast-moving
    // leg poisons the whole sum — flag it, let the player judge
    const legs = [out, ...buyList.map((b) => b.it)];
    const wage = (best.profitUnit * 3600) / best.secs;
    const rich = wage > RICH_GP_PER_WORK_HOUR;
    const staleLegs = legs.filter((x) => x.tier === "C").map((x) => x.name);
    const movingLegs = legs.filter((x) => x.moving).map((x) => x.name);
    const crushP = Math.min(1, ...stepList.map((s) => succOf(s.r, skills)));

    jobs.push({
      key: outIdx + ":" + mode, out, mode, ...best,
      sellUnit, stepList, buyList, maxN, members,
      levels: [...levels].map(([s, l]) => ({ s, l })),
      facilities: [...facilities],
      unlocks: [...unlocks],
      xp: [...xpMap].sort((a, b) => b[1] - a[1]),
      wage, rich, staleLegs, movingLegs, crush: crushP < 1 ? 1 - crushP : 0,
      defaultN: Math.min(niceRound(450 / best.secs), maxN),
    });
  }
  /* ---- alchemy: the spells that turn the catalogue into coins ----
     Priced like any other job: buy the item and the runes, cast, pocket the
     fixed alch value. No sell leg and no GE tax — the gold comes from the game
     itself, which is exactly why the alch floor exists (see Econ 101). Runes
     are priced off the exchange like every other material; a fire staff covers
     the fire runes, so the board lists them but notes the saving. High alchemy
     (Magic 55, 5 ticks, 5 fires) pays 60% of shop value; Low (Magic 21,
     3 ticks, 3 fires) pays 40% — strictly worse gp when you can cast both,
     but the only alch a mid-level mage has, so each gates on its own level. */
  const nat = byName.get("Nature rune");
  const fire = byName.get("Fire rune");
  if (nat && fire) {
    const natPx = jobBuyPx(nat, mode), firePx = jobBuyPx(fire, mode);
    const SPELLS = [
      { tag: "hi", lvl: 55, fires: 5, secs: 3.0 * OVERHEAD, xp: 65, val: (it) => it.ha },
      { tag: "lo", lvl: 21, fires: 3, secs: 1.8 * OVERHEAD, xp: 31, val: (it) => it.la },
    ];
    for (const sp of SPELLS) for (const it of items) {
      const value = sp.val(it);
      if (!(value > 0) || it.id === nat.id || it.id === fire.id) continue;
      const cost = jobBuyPx(it, mode) + natPx + sp.fires * firePx;
      const profitUnit = value - cost;
      // training Magic, a cheap loss per cast is the product — keep those jobs
      if (profitUnit <= 0 && focus !== "Magic") continue;
      const buyList = [{ it, perUnit: 1 }, { it: nat, perUnit: 1 }, { it: fire, perUnit: sp.fires }];
      const caps = [];
      for (const b of buyList) {
        caps.push(Math.floor(b.it.limit / b.perUnit));
        caps.push(mode === "express"
          ? Math.floor((0.10 * b.it.dv) / b.perUnit)
          : Math.floor((CAPTURE * dayFlow(b.it, "lo")) / b.perUnit));
      }
      const maxN = Math.max(0, Math.min(...caps));
      if (maxN < 1) continue;
      const legs = [it, nat, fire];
      const wage = (profitUnit * 3600) / sp.secs;
      jobs.push({
        key: "alch:" + sp.tag + ":" + it.id + ":" + mode, out: it, mode, alch: true,
        r: { s: "Magic", l: sp.lvl, f: "", a: 1 },
        cost, secs: sp.secs, coins: 0, profitUnit, sellUnit: value,
        stepList: [], buyList, maxN, members: it.members,
        levels: [{ s: "Magic", l: sp.lvl }], facilities: [], unlocks: [],
        xp: [["Magic", sp.xp]],
        wage, rich: wage > RICH_GP_PER_WORK_HOUR,
        staleLegs: legs.filter((x) => x.tier === "C").map((x) => x.name),
        movingLegs: legs.filter((x) => x.moving).map((x) => x.name),
        crush: 0,
        defaultN: Math.min(niceRound(450 / sp.secs), maxN),
      });
    }
  }

  jobs.sort((a, b) => b.profitUnit * b.defaultN - a.profitUnit * a.defaultN);
  return jobs;
}

/* ================= the notice board =================
   The board itself: a stone toolbar, the sheet folded into one line, and a
   wooden board of parchment notices. A notice carries only the essentials —
   the job, its pay, one line of batch · time · costs, the requirements as
   green/red chips and any stamps — and lifts into a stone contract on click,
   where the full ledger lives. Paper on wood, not more stone. */
const MODE_HINT = {
  express: "Insta-buy the inputs, insta-sell the product — thinner pay, done today.",
  patient: "Offers at the week's going rates — the whole margin, about a day per leg.",
};
const SKILL_GLYPH = { Smithing: "⚒", Crafting: "✂", Fletching: "➶", Cooking: "♨", Herblore: "⚗", Magic: "✦" };
const SHEET_KEY = "fd-sheet-v1"; // kept across the redesign so nobody's levels vanish
const loadSheet = () => {
  try { return { members: true, skills: {}, quests: {}, ...(JSON.parse(localStorage.getItem(SHEET_KEY)) || {}) }; }
  catch (e) { return { members: true, skills: {}, quests: {} }; }
};
const hasLevels = (sheet) => Object.values(sheet.skills || {}).some((v) => v !== "" && v != null);
// a blank skill counts as level 1 — the board never assumes training you haven't claimed
const lvlOf = (sheet, s) => { const have = sheet.skills?.[s]; return have === "" || have == null ? 1 : +have; };
// the first thing standing between the player and the job, in the game's words
function blockerOf(job, sheet) {
  if (job.members && !sheet.members) return "Members";
  for (const q of job.levels) if (lvlOf(sheet, q.s) < q.l) return `${q.s} ${q.l}`;
  for (const u of job.unlocks) if (!sheet.quests?.[u]) return u;
  return null;
}
const canDo = (job, sheet) => !blockerOf(job, sheet);
const focusXpOf = (job, focus) => (focus ? job.xp.find(([s]) => s === focus)?.[1] || 0 : 0);
// a patient leg's clock, in hours: the units over the share of a day's flow a standing offer catches
const clockH = (units, flowPerDay) => (flowPerDay > 0 ? Math.max((units / (flowPerDay * CAPTURE)) * 24, 1) : Infinity);
/* the whole batch's numbers — the notice and the contract read the same sums */
function jobMath(job, n) {
  const { out, mode } = job;
  const workH = (n * job.secs) / 3600;
  const buyClocks = job.buyList.map((b) => (mode === "patient" ? clockH(Math.ceil(b.perUnit * n), dayFlow(b.it, "lo")) : 0));
  const buyClock = Math.max(0, ...buyClocks);
  const sellClock = mode === "patient" && !job.alch ? clockH(n, dayFlow(out, "hi")) : 0; // alching pays in coins — nothing to sell
  return {
    n, workH, buyClocks, buyClock, sellClock,
    totalH: workH + buyClock + sellClock + 2 / 60,
    cost: Math.round(n * job.cost),
    sale: Math.round(n * job.sellUnit),
    profit: Math.round(n * job.profitUnit),
    capped: n >= job.maxN,
  };
}
const an = (s) => (/^[aeiou]/i.test(s) ? "an " : "a ") + s;
const gearOf = (job) => [...new Set(job.stepList.map((s) => s.r.g).filter(Boolean))];
// a deterministic small tilt per notice, so the board doesn't line up too perfectly
function tiltFor(key) {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return ((h % 7) - 3) * 0.4;
}
const capNote = (job) => (job.mode === "express" ? "capped — a bigger batch would move these books" : "capped — the books can't fill more inside a day");
/* everything a job asks of the player, in one list: a chip for the notice, a
   line for the contract. Levels and quests are green or red; facilities and
   tools are neither — the game doesn't track whether you own a chisel, and
   neither does the board, so they read as reminders, not gates */
function requirementsOf(job, sheet) {
  const reqs = [];
  if (job.members && !sheet.members) reqs.push({ k: "Members", cls: "no", chip: "Members ✗", line: "✗ Members — this job needs P2P" });
  for (const q of job.levels) {
    const have = lvlOf(sheet, q.s), ok = have >= q.l;
    reqs.push({ k: `${q.s} ${q.l}`, cls: ok ? "ok" : "no", chip: `${q.s} ${q.l} ${ok ? "✓" : "✗"}`, line: `${ok ? "✓" : "✗"} ${q.s} ${q.l} — you have ${have}` });
  }
  for (const u of job.unlocks) {
    const ok = !!sheet.quests?.[u];
    reqs.push({ k: u, cls: ok ? "ok" : "no", chip: `${u} ${ok ? "✓" : "✗"}`, line: `${ok ? "✓" : "✗"} ${u} — ${ok ? "done" : "not done"}`, title: unlockNote(u) });
  }
  for (const f of job.facilities) reqs.push({ k: f, cls: "unk", chip: f, line: `◦ At ${an(f.toLowerCase())}` });
  for (const g of gearOf(job)) reqs.push({ k: g, cls: "unk", chip: g, line: `◦ Bring ${an(g.toLowerCase())}`, title: gearNote(g) });
  if (job.alch) reqs.push({
    k: "staff", cls: "unk", chip: "fire staff optional", line: "◦ Fire staff optional — wield one and the fire runes below are free",
    title: "The buy list prices every fire rune per cast to stay honest — wielding any fire staff supplies them for free and fattens the pay by that much.",
  });
  return reqs;
}
// the stamps a notice wears: what its chips can't say
function stampsOf(job) {
  const s = [];
  if (job.crush > 0) s.push({ cls: "", text: `≈${Math.round(job.crush * 100)}% crush` });
  if (job.staleLegs.length > 0 || job.movingLegs.length > 0) s.push({ cls: "", text: "thin data" });
  if (job.rich) s.push({ cls: "purple", text: "too good?" });
  if (job.members) s.push({ cls: "purple", text: "P2P" });
  return s;
}
// the one warning paragraph a contract may carry — never the same thing twice
function warningOf(job) {
  const parts = [];
  if (job.crush > 0) parts.push(`semi-precious gems crush on a failed cut — at your Crafting level ≈${Math.round(job.crush * 100)}% of attempts fail, and the buy list already covers the extra uncut gems`);
  if (job.rich) parts.push(`pays ≈${fmtGp(job.wage)} gp per hour of hands-on work, beyond any honest skilling wage — more often thin or stale data than free money, so probe every leg with 1 before committing`);
  if (job.staleLegs.length > 0 || job.movingLegs.length > 0) {
    const names = [...job.staleLegs, ...job.movingLegs];
    parts.push(`weak or fast-moving data on ${names.slice(0, 2).join(", ")}${names.length > 2 ? ` +${names.length - 2} more` : ""} — the pay is only as good as its weakest leg, so check each on the Market Board first`);
  }
  return parts.length ? "⚠ " + parts.join("; ") + "." : null;
}
// the examine line: the job in a sentence
function examineOf(job) {
  if (job.alch) return `Cast ${job.r.l >= 55 ? "High" : "Low"} Level Alchemy on ${an(job.out.name)} for its fixed coin value — no sell offer, no GE tax.`;
  const inputs = job.buyList.map((b) => b.it.name);
  const from = inputs.length ? ` from ${inputs.slice(0, 3).join(", ")}${inputs.length > 3 ? ` and ${inputs.length - 3} more` : ""}` : "";
  const at = job.facilities.length ? ` at ${an(job.facilities[0].toLowerCase())}` : "";
  const gear = gearOf(job);
  return `${verbOf(job.r)} ${job.out.name}${from}${at}${gear.length ? `, with ${an(gear[0].toLowerCase())}` : ""}.`;
}

/* one notice on the board */
function Notice({ job, n, sheet, focus, onOpen }) {
  const m = jobMath(job, n);
  const reqs = requirementsOf(job, sheet);
  const blocked = reqs.some((x) => x.cls === "no");
  const chips = [...reqs.filter((x) => x.cls === "no"), ...reqs.filter((x) => x.cls !== "no")];
  const stamps = stampsOf(job);
  const fx = focusXpOf(job, focus);
  const gpx = fx > 0 ? job.profitUnit / fx : null;
  const sign = m.profit >= 0 ? "+" : "";
  return (
    <button type="button" className={"ge-notice" + (blocked ? " faded" : "")} style={{ "--tilt": `${tiltFor(job.key)}deg` }}
      onClick={onOpen} aria-label={`${verbOf(job.r)} ${job.out.name}${blocked ? ` — needs ${blockerOf(job, sheet)}` : ""}`}>
      <span className="pin" aria-hidden="true" />
      {stamps.length > 0 && <span className="stamps">{stamps.map((s) => <span key={s.text} className={"ge-stamp " + s.cls}>{s.text}</span>)}</span>}
      <h3>{verbOf(job.r)} {job.out.name}</h3>
      {focus ? (
        <>
          <div className={"pay " + (gpx != null && gpx >= 0 ? "good" : "bad")}>{gpx == null ? "–" : `${gpx >= 0 ? "pays" : "costs"} ${fmtGpx(gpx)} gp/xp`}</div>
          <div className="line2">{fmtFull(n)}× · {fmtDurShort(m.totalH)} · {fmtXp(fx * n)} xp</div>
          <div className="line2">{job.alch ? "alchs" : "sells"} {fmtGp(m.sale)} − costs {fmtGp(m.cost)} <span className="eq">= <b className={m.profit >= 0 ? "good" : "bad"}>{sign}{fmtGp(m.profit)}</b></span></div>
        </>
      ) : (
        <>
          <div className={"pay " + (m.profit >= 0 ? "good" : "bad")}>{sign}{fmtGp(m.profit)} gp</div>
          <div className="line2">{fmtFull(n)}× · {fmtDurShort(m.totalH)} · costs {fmtGp(m.cost)}</div>
        </>
      )}
      <div className="reqs">{chips.map((c) => <span key={c.k} className={"ge-nchip " + c.cls} title={c.title}>{c.chip}</span>)}</div>
    </button>
  );
}

/* the contract: the notice lifted off the board, with everything it left out */
function JobContract({ job, n, setN, sheet, focus, onClose }) {
  const m = jobMath(job, n);
  const closeRef = useRef(null);
  const modalRef = useRef(null);
  useEffect(() => {
    const prev = document.activeElement;
    closeRef.current?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key === "Tab" && modalRef.current) {
        const list = [...modalRef.current.querySelectorAll('button:not(:disabled), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')];
        if (!list.length) return;
        const first = list[0], last = list[list.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      if (prev && typeof prev.focus === "function") prev.focus();
    };
  }, [onClose]);
  const { out, mode } = job;
  const reqs = requirementsOf(job, sheet);
  const fx = focusXpOf(job, focus);
  const warn = warningOf(job);
  const sellPx = jobSellPx(out, mode);
  return (
    <div className="ge-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="ge-modal" role="dialog" aria-modal="true" aria-labelledby="ge-contract-title" ref={modalRef}>
        <div className="ge-mhead">
          <div>
            <h2 id="ge-contract-title">{verbOf(job.r)} {out.name}</h2>
            <p className="ge-examine">{examineOf(job)}</p>
          </div>
          <button className="ge-x" onClick={onClose} aria-label="Close" ref={closeRef}>✕</button>
        </div>
        <div className="ge-mbody">
          <div className="ge-reqlist">
            {reqs.map((r) => <div key={r.k} className={"r " + r.cls} title={r.title}>{r.line}</div>)}
          </div>
          <div className="ge-batchpanel">
            <span className="ge-pixlbl">Batch</span>
            <div className="ge-batch">
              <button className="ge-btn" onClick={() => setN(Math.max(1, niceRound(n / 2)))} aria-label="Halve batch">−</button>
              <b>{fmtFull(n)}</b>
              <button className="ge-btn" onClick={() => setN(Math.min(job.maxN, niceRound(n * 2)))} aria-label="Double batch">+</button>
              <button className="ge-btn" onClick={() => setN(job.maxN)}
                title={mode === "express"
                  ? "The biggest batch these books can absorb without moving them (≈10% of daily volume), inside the 4-hour buy limits."
                  : "The most the books can patiently fill in ≈4 hours, inside the 4-hour buy limits."}>Max</button>
            </div>
            {m.capped && <span className="ge-capnote">{capNote(job)}</span>}
          </div>
          <div className="ge-ledger ge-inset">
            {job.buyList.map((b, i) => {
              const q = Math.ceil(b.perUnit * n);
              const unit = jobBuyPx(b.it, mode);
              return (
                <div key={b.it.id}>
                  <span className="op buy">BUY</span>
                  {fmtFull(q)}× {b.it.name} @ {fmtFull(unit)} — {fmtGp(q * unit)} gp
                  {mode === "patient" && <span className="clock"> · fills ≈ {fmtDurShort(m.buyClocks[i])}</span>}
                </div>
              );
            })}
            {job.coins > 0 && <div><span className="op buy">PAY</span>{fmtGp(Math.round(job.coins * n))} gp in fees</div>}
            {job.alch ? (
              <>
                <div>
                  <span className="op work">ALCH</span>
                  {fmtFull(n)}× {out.name} at {fmtFull(job.sellUnit)} gp apiece
                  <span className="clock"> · ≈ {fmtDurShort(m.workH)}</span>
                </div>
                <div><span className="op sell">TAKE</span>{fmtGp(m.sale)} gp straight to your pouch — no sell offer, no GE tax</div>
              </>
            ) : (
              <>
                {job.stepList.map((s, i) => {
                  const count = Math.ceil(s.perUnit * n);
                  return (
                    <div key={i}>
                      <span className="op work">{verbOf(s.r).toUpperCase()}</span>
                      {fmtFull(count)}× {RECIPES.names[s.r.o]}
                      {s.r.q > 1 ? <span className="clock"> ({fmtFull(s.r.q)} per {verbOf(s.r).toLowerCase()})</span> : null}
                      {s.r.f ? ` at ${s.r.f.toLowerCase()}` : ""}
                      <span className="clock"> · ≈ {fmtDurShort((count * secsOf(s.r) * OVERHEAD) / 3600)}</span>
                    </div>
                  );
                })}
                <div>
                  <span className="op sell">SELL</span>
                  {fmtFull(n)}× {out.name} @ {fmtFull(sellPx)}{geTax(sellPx, out.id) > 0 ? " less tax" : ""} — {fmtGp(m.sale)} gp
                  {mode === "patient" && <span className="clock"> · fills ≈ {fmtDurShort(m.sellClock)}</span>}
                </div>
              </>
            )}
          </div>
          <div className="ge-facts ge-inset">
            <div><span>Costs</span><b>{fmtGp(m.cost)} gp</b></div>
            <div><span>Pays</span><b className={m.profit >= 0 ? "good" : "bad"}>{m.profit >= 0 ? "+" : ""}{fmtGp(m.profit)} gp</b></div>
            {job.xp.length > 0 && <div><span>Xp</span><b className="gold">{job.xp.map(([s, v]) => `${fmtXp(v * n)} ${s}`).join(" · ")}</b></div>}
            {fx > 0 && (
              <div><span>{job.profitUnit >= 0 ? "Pays per xp" : "Costs per xp"}</span>
                <b className={job.profitUnit >= 0 ? "good" : "warn"}>{fmtGpx(job.profitUnit / fx)} gp</b></div>
            )}
            <div><span>Return</span><b>{m.cost > 0 ? ((m.profit / m.cost) * 100).toFixed(1) : "–"}%</b></div>
            <div><span>Takes about</span><b className="gold">{fmtDurShort(m.totalH)}</b></div>
          </div>
          {warn && <p className="ge-warnnote">{warn}</p>}
        </div>
      </div>
    </div>
  );
}

function JobBoard({ items, status }) {
  const [mode, setMode] = useState("express");
  const [focus, setFocus] = useState(""); // "" = best pay; a skill name = train it
  const [search, setSearch] = useState("");
  const [batches, setBatches] = useState({}); // job key -> chosen n
  const [openKey, setOpenKey] = useState(null); // the contract on the table, if any
  // a job's key carries its mode, so switching modes takes any open contract off the table
  const pickMode = (m) => { setMode(m); setOpenKey(null); };
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheet, setSheet] = useState(loadSheet);
  // a blank sheet shows the whole board, faded where it's out of reach — the
  // first visit should look like a board, not an empty wall
  const [onlyCan, setOnlyCan] = useState(() => hasLevels(loadSheet()));
  useEffect(() => { try { localStorage.setItem(SHEET_KEY, JSON.stringify(sheet)); } catch (e) {} }, [sheet]);

  // pull real levels off the hiscores by RuneScape name — one click, no login
  const [rsnBusy, setRsnBusy] = useState(false);
  const [rsnMsg, setRsnMsg] = useState("");
  const importRsn = async () => {
    const rsn = (sheet.rsn || "").trim();
    if (!rsn || rsnBusy) return;
    setRsnBusy(true); setRsnMsg("");
    try {
      const d = await fetchHiscores(rsn);
      const got = {};
      for (const s of d.skills || []) if (SKILL_LIST.includes(s.name) && s.level > 0) got[s.name] = String(s.level);
      if (!Object.keys(got).length) throw new Error("empty");
      setSheet((sh) => ({ ...sh, skills: { ...sh.skills, ...got } }));
      setRsnMsg("✓ levels loaded");
    } catch (e) {
      setRsnMsg(/404/.test(e.message || "") ? "not on the hiscores" : "lookup failed — try again shortly");
    }
    setRsnBusy(false);
  };

  const jobs = useMemo(() => buildJobs(items, mode, sheet.skills, focus), [items, mode, sheet.skills, focus]);
  // training focus: only work that pays xp in the chosen skill, cheapest xp first
  const ranked = useMemo(() => {
    if (!focus) return jobs;
    const xpOf = (j) => focusXpOf(j, focus);
    return jobs.filter((j) => xpOf(j) > 0)
      .sort((a, b) => (-a.profitUnit / xpOf(a)) - (-b.profitUnit / xpOf(b)));
  }, [jobs, focus]);
  // only the quests that actually gate a job on today's board make the sheet
  const questList = useMemo(() => [...new Set(jobs.flatMap((j) => j.unlocks))].sort(), [jobs]);
  const questsDone = questList.filter((u) => sheet.quests?.[u]).length;

  const q = search.trim().toLowerCase();
  const matches = (j) => !q || j.out.name.toLowerCase().includes(q) || verbOf(j.r).toLowerCase().includes(q);
  const canN = ranked.filter((j) => canDo(j, sheet)).length;
  const shown = ranked.filter((j) => (!onlyCan || canDo(j, sheet)) && matches(j)).slice(0, 30);
  const open = openKey ? jobs.find((j) => j.key === openKey) : null;
  const closeContract = useCallback(() => setOpenKey(null), []);
  const nOf = (job) => clamp(batches[job.key] ?? job.defaultN, 1, job.maxN);
  const setNOf = (job) => (v) => setBatches((b) => ({ ...b, [job.key]: clamp(v, 1, job.maxN) }));
  const setSkill = (s, v) => setSheet((sh) => ({ ...sh, skills: { ...sh.skills, [s]: v } }));

  const emptyLine = focus
    ? `Nothing trains ${focus} within your filters — loosen the search, or untick “Only what I can start”.`
    : q ? `No paying jobs match “${search.trim()}”. Try another search, or untick “Only what I can start”.`
    : ranked.length > 0 && onlyCan ? "Nothing here is within your reach yet — fill in your levels above, or untick “Only what I can start” to see the whole board."
    : mode === "express" ? "No paying jobs right now. Starting now eats both spreads — try Full margin for the whole pay."
    : "No paying jobs right now. Check back when the books move.";

  return (
    <>
      <section className="ge-panel ge-toolbar">
        <div className="ge-moderow" role="group" aria-label="Pricing">
          <button className={"ge-btn" + (mode === "express" ? " on" : "")} aria-pressed={mode === "express"} onClick={() => pickMode("express")}>Start now</button>
          <button className={"ge-btn" + (mode === "patient" ? " on" : "")} aria-pressed={mode === "patient"} onClick={() => pickMode("patient")}>Full margin</button>
        </div>
        <p className="ge-modehint">{MODE_HINT[mode]}</p>
        <div className="ge-skillrow" role="group" aria-label="Training focus">
          <span className="ge-pixlbl">Train:</span>
          <button className={"ge-btn small" + (focus === "" ? " on" : "")} aria-pressed={focus === ""} onClick={() => setFocus("")}>Best pay</button>
          {SKILL_LIST.map((s) => (
            <button key={s} className={"ge-btn small" + (focus === s ? " on" : "")} aria-pressed={focus === s} onClick={() => setFocus(s)}>
              {SKILL_GLYPH[s]} {s}
            </button>
          ))}
        </div>
        <div className="ge-filterrow">
          <div className="grow">
            <input className="ge-in" placeholder="Search the job board… e.g. cannonball, glory, shark" value={search}
              onChange={(e) => setSearch(e.target.value)} aria-label="Search jobs" />
          </div>
          <label className="ge-tog"><input type="checkbox" checked={onlyCan} onChange={(e) => setOnlyCan(e.target.checked)} />Only what I can start</label>
        </div>
      </section>

      {/* the sheet, folded into one line */}
      <button type="button" className="ge-panel ge-charstrip" aria-expanded={sheetOpen} aria-controls="ge-sheet-editor" onClick={() => setSheetOpen((o) => !o)}>
        <span className="cs-inner">
          <span className="rsn">{(sheet.rsn || "").trim() || "Your sheet"}</span>
          {SKILL_LIST.map((s) => {
            const v = sheet.skills[s];
            const blank = v === "" || v == null;
            return <span key={s} className="cell"><span className="g" aria-hidden="true">{SKILL_GLYPH[s]}</span>{s} <b className={blank ? "blank" : ""}>{blank ? "–" : v}</b></span>;
          })}
          <span className={"ge-mem" + (sheet.members ? "" : " off")}>{sheet.members ? "P2P" : "F2P"}</span>
          {questList.length > 0 && <span className="quests">Quests {questsDone}/{questList.length}</span>}
          <span className="hint">{sheetOpen ? "click to close ▴" : "click to edit ▾"}</span>
        </span>
      </button>
      {sheetOpen && (
        <section className="ge-panel ge-sheet-editor" id="ge-sheet-editor">
          <div className="ge-sheet-grid">
            {SKILL_LIST.map((s) => (
              <label key={s}>
                <span><span className="g" aria-hidden="true">{SKILL_GLYPH[s]}</span> {s}</span>
                <input className="ge-in" type="number" min={1} max={99} placeholder="–" value={sheet.skills[s] ?? ""}
                  onChange={(e) => setSkill(s, e.target.value)} />
              </label>
            ))}
            <label><span>Members</span><input type="checkbox" checked={sheet.members}
              onChange={(e) => setSheet((sh) => ({ ...sh, members: e.target.checked }))} /></label>
          </div>
          {questList.length > 0 && (
            <div className="ge-sheet-quests">
              <span className="ge-pixlbl">Quests:</span>
              {questList.map((u) => {
                const done = !!sheet.quests?.[u];
                return (
                  <label key={u} className={"ge-qlbl " + (done ? "done" : "todo")} title={unlockNote(u)}>
                    <input type="checkbox" checked={done}
                      onChange={(e) => setSheet((sh) => ({ ...sh, quests: { ...sh.quests, [u]: e.target.checked } }))} />
                    {done ? "✓" : "✗"} {u}
                  </label>
                );
              })}
            </div>
          )}
          {PROXIED && (
            <div className="ge-sheet-rsn">
              <label className="ge-tog">RuneScape name
                <input className="ge-in" type="text" placeholder="fetch your levels" value={sheet.rsn ?? ""} maxLength={12}
                  onChange={(e) => setSheet((sh) => ({ ...sh, rsn: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === "Enter") importRsn(); }} />
              </label>
              <button className="ge-btn" onClick={importRsn} disabled={rsnBusy || !(sheet.rsn || "").trim()}>{rsnBusy ? "…" : "Hiscores"}</button>
              {rsnMsg && <span className="msg">{rsnMsg}</span>}
            </div>
          )}
          <p className="ge-sheet-note">
            Blank skills count as level 1 and unticked quests as not done — the board never assumes training you haven't claimed.
            Only the quests that gate a job on today's board are listed.
          </p>
        </section>
      )}

      {status === "snapshot" && (
        <p className="ge-read">Offline snapshot — the board only sees the {items.length} baked items, so most work is hidden until the live feed returns.</p>
      )}
      <p className="ge-read">
        {focus
          ? <><b>{ranked.length}</b> jobs train {focus} on today's market, cheapest xp first — the market pays for the ones in green</>
          : <><b>{ranked.length}</b> jobs pay on the exchange right now</>}
        {" "}· <b>{canN}</b> you can start
        {q && <> · <b>{shown.length}</b> match “{search.trim()}”</>}
        . Tap a notice for its contract.
      </p>

      <section className="ge-board" aria-label="Job notices">
        {shown.map((job) => (
          <Notice key={job.key} job={job} n={nOf(job)} sheet={sheet} focus={focus} onOpen={() => setOpenKey(job.key)} />
        ))}
        {shown.length === 0 && (
          <div className="ge-notice empty">
            <span className="pin" aria-hidden="true" />
            <h3>Nothing posted</h3>
            <p>{emptyLine}</p>
          </div>
        )}
      </section>

      <p className="ge-foot">
        Batches default to roughly 5–10 minutes of work, capped by 4-hour buy limits and what the books can absorb
        (≈10% of a day's volume when starting now; about a day of patient fills on full margin). Action speeds and xp
        come from the wiki's own recipe data, +15% for banking. Alch jobs price every rune off the exchange and pay
        the spell's fixed coin value on the spot — no sell leg, no GE tax — so they appear the moment an item dips
        below its alch floor.<br />
        Train a skill and the board re-ranks by gp per xp — a green notice means the market pays you to train. A fat
        margin on labour-heavy work is just a wage; a notice stamped "too good?" or "thin data" wants a 1-unit probe
        first. The market moves while you work — the pay is an estimate, not a contract.
      </p>

      {open && <JobContract key={open.key} job={open} n={nOf(open)} setN={setNOf(open)} sheet={sheet} focus={focus} onClose={closeContract} />}
    </>
  );
}

/* ================= econ 101 =================
   The primer. Static text, no data, no API — just the things about this
   economy a flipper wishes someone had told them on day one. */
function Econ101() {
  return (
    <div className="ge-econ">
      <section className="ge-panel">
        <h3>The machine itself</h3>
        <ul>
          <li>The Grand Exchange is one big anonymous <b>order book</b> per item. Buy offers queue against
            sell offers, matched by <b>price-time priority</b>: the best price trades first, and at the same
            price, whoever quoted first.</li>
          <li>When your offer crosses a standing one, the trade happens at the <b>standing offer's price</b>.
            Offer 120 gp for something someone is selling at 100 and you pay 100 — the extra 20 comes back in
            your collection box. The "insta-buy" price is simply the cheapest standing sell offer; "insta-sell"
            is the best standing buy.</li>
          <li>You get <b>8 offer slots</b> on members worlds (3 on free worlds) and they all run at once.
            That's why this desk doesn't talk in gp/hr — your time isn't the input. Capital and buy limits are.</li>
          <li>Every sale pays a <b>2% tax</b> (rounded down, capped at 5m per item; items under 50 gp and
            bonds exempt). It comes out of the seller's proceeds and is baked into every margin on this board.</li>
        </ul>
      </section>

      <section className="ge-panel">
        <h3>Where prices come from</h3>
        <ul>
          <li>The in-game <b>GE price</b> is Jagex's own average, updated roughly once a day by an opaque
            formula. It lags the real market by hours to days, and manipulators lean on that lag. This board
            never <i>prices</i> from it — but it does <b>track it</b>: it's computed from every
            trade in the game (not just the plugin's sample), so the gap between real trades and the GE price is
            a signal in its own right.</li>
          <li>This board runs on the{" "}
            <a className="ge-link" href="https://prices.runescape.wiki" target="_blank" rel="noreferrer">
              OSRS Wiki's real-time feed ↗</a>: RuneLite clients report actual trades as they happen. A
            "high" print is an insta-buy — someone paid the standing sell offer. A "low" print is an
            insta-sell.</li>
          <li>One print is one player's trade, and possibly a bait. Rows here are priced from{" "}
            <b>volume-weighted averages</b>: the week's daily figures carry the headline numbers, the last hour
            says where today sits, and books nothing can price honestly are set aside rather than shown.</li>
          <li>The feed only sees trades from players running the plugin — a large sample of the tape, not all
            of it. Every number is an estimate with error bars, and honest tools say so.</li>
        </ul>
      </section>

      <section className="ge-panel">
        <h3>The clocks — what resets when</h3>
        <ul>
          <li><b>Buy limits</b> — every item has a 4-hour buy limit (13,000 iron ore, 70 twisted bows — each
            item has its own line). The window is per-item and <b>rolling</b>: it starts at your first
            purchase and the whole allowance frees 4 hours later. There is no server-wide reset tick.</li>
          <li><b>00:00 UTC</b> — the game's day boundary. Daily-limited content flips here and the daily
            player cycle starts over.</li>
          <li><b>Wednesday morning (UK time)</b> — the weekly game update, the biggest scheduled market event
            there is. Balance changes and new content move whole markets, and speculation starts moving them
            the moment the newspost drops — sometimes before.</li>
          <li><b>The trading day</b> — books are deepest through the EU evening and NA afternoon, thinnest in
            the small hours UTC. Thin hours mean wider spreads, slower fills, and easier manipulation.</li>
        </ul>
      </section>

      <section className="ge-panel">
        <h3>Faucets and sinks — why prices sit where they do</h3>
        <ul>
          <li>Every price is a balance of flows. Items pour in from drops, skilling and shops (the{" "}
            <b>faucets</b>) and drain out through use — food eaten, potions drunk, runes cast, charges burned
            (the <b>sinks</b>). When an update touches either flow, the price moves until they balance again.</li>
          <li>Gold has its own plumbing: alchemy and coin drops print gp into the game; the GE tax destroys
            it. The tax is the biggest gold sink in the game — every flip quietly deletes a little gold.</li>
          <li><b>High alchemy</b> puts a hard floor under much of the catalogue: once an item falls near its
            alch value minus the cost of a nature rune, alchemists buy everything at that line and the price
            stops falling. The Job Board watches that line for you — alch jobs appear there the moment an
            item dips below it.</li>
          <li>Where a shop sells the same item, the shop price acts as a soft <b>ceiling</b> the same way —
            climb past it and players simply buy from the shop instead.</li>
        </ul>
      </section>

      <section className="ge-panel">
        <h3>Bots</h3>
        <ul>
          <li>Large parts of the commodity market are <b>bot-supplied</b> — common logs, ores, hides, essence
            and other gatherables. That's why those prices sit low and eerily still: a bot farm never gets
            bored and never asks for a raise.</li>
          <li><b>Ban waves are supply shocks.</b> When a big one lands, botted commodities spike, then drift
            back down over weeks as the farms rebuild. Trade the drift, not the headline.</li>
          <li>Bots flip too: scripted traders camp the high-volume books and keep those spreads razor thin.
            It's why the honest, fat margins tend to hide in awkward mid-volume items the scripts don't
            bother with.</li>
        </ul>
      </section>

      <section className="ge-panel">
        <h3>Manipulation — how not to be the mark</h3>
        <ul>
          <li>The classic pump: a group picks a dead, low-volume item, quietly buys it out, posts hype, and
            sells into the crowd that shows up. If an item you've never heard of is up 300% on no update,
            you're not early — you're the <b>exit liquidity</b>.</li>
          <li><b>Bait prints</b>: single trades placed to paint a fat margin onto the feed. One print costs a
            manipulator almost nothing; moving an hour of volume-weighted average costs real money. That is
            exactly why this board prices from the averages.</li>
          <li>Thin books lie by default. A juicy margin on an item that trades 30 a day is a rumour, not a
            price. <b>Probe with 1 unit first</b> — the cheapest information you will ever buy.</li>
          <li>The board's own defenses work the same list: unpriceable, crossed and dislocated books are set
            aside, a thin week wears its day count, and no row is ever priced off a single print. The day orders
            go one further: a price is only quoted where the market actually traded enough, on enough days.</li>
        </ul>
      </section>

      <section className="ge-panel">
        <h3>Reading this board</h3>
        <ul>
          <li><b>Going rate</b> is the week's volume-weighted average — what the item actually went for, over
            the last seven complete days. <b>Today</b> is the current hour against it, and <b>Week's range</b> draws
            the week's lowest daily buy and highest daily sell as a bar with today's price pinned between them: a pin
            at the left end is a cheap day, at the right a dear one, and a hollow ring at either end means today has
            broken out of the week's band.</li>
          <li><b>7d trend</b> is a line fitted through the daily averages, and the sparkline is the week itself.
            Flat, steady prices are the day flipper's friend; a strong trend means last week's dips or peaks
            may not come back, and the popup says which side that hurts.</li>
          <li><b>Day margin</b> is a typical day's gap between what sellers got and what buyers paid, after tax,
            and <b>ROI</b> is that margin against the buy side's going rate.</li>
          <li><b>Gp moved/day</b> is daily volume × the going rate — the size of the river, and the board's
            default rank. A big number is a deep, honest market that can absorb real size; a small one means every
            other number on the row is fragile. <b>Traded/day</b> is the same river counted in units.</li>
          <li><b>Screens</b> put a min and a max on any column — type them in the desk's shorthand or drag the
            two handles. The presets are saved screens (deep books, steady prices, a cheap day), every active screen
            is a chip that clears with a click, and a bounded screen drops rows that have no number for it.</li>
          <li><b>The day orders</b> in the popup are read straight off the last week of hourly trading. For each
            day, the cheapest price at which a standing buy could have filled your quantity, and the dearest a
            standing sell could have; the orders are the prices that would have filled on all but one of those
            days (or every day, or all but two — your call). The chart draws both lines across the week so you
            can see the cycle touch them. A day to buy, a day to sell.</li>
          <li><b>Vs GE price</b> compares the week's real trades to the official GE price — two independent
            samples of the same market (the plugin's tape vs Jagex's lagged census of every trade). Near zero
            means the feed is telling the truth. A wide gap is momentum the GE price hasn't caught up with — and
            while it holds, casual players still anchored to the GE price keep handing the informed side cheap
            fills — or it's one of the two prices being painted. Thin volume plus a wide gap: assume painted.</li>
          <li>The <b>Commodities</b> tab sorts the goods everyone trades into families by processing stage and puts a{" "}
            <b>GEB</b> — a Grand Exchange Basket — on each: a fixed load of goods priced at each day's going rates, set to 100
            where the window starts, so 104 reads "the same load costs 4% more than it did". Weighted by flow it is the cost of a
            typical day's trade through the family; weighted equally it is what the typical good is doing. A good's move against
            its family's, a family's against the whole grid, and a recipe-linked pair's ratio against its usual band are how
            something stands out from the trend around it.</li>
          <li>The <b>Job Board</b> prices whole production chains from the same numbers — buy the inputs, work
            them, sell the output, tax and buy limits included — with the wiki's own tick counts and xp per
            action on every step. Set a training focus and the same chains rank by <b>gp per xp</b> instead:
            the market's true price list for levelling a skill, green when it pays you.</li>
        </ul>
      </section>
    </div>
  );
}

/* ================= screens =================
   One way to narrow the board: every numeric column takes a min and a max,
   typed in the desk's own shorthand ("1.5k", "20m", "-3") or dragged on a
   two-handled slider. A screen with neither end set is "any" and costs
   nothing; once bounded, a row with no number for it falls out — it can't
   show what's being asked of it. Gp and volume screens run on a log scale
   (the exchange spans feathers to bonds), the percentage screens linear.
   Presets are just saved screens, and every active screen is a chip that
   clears with one click. */

// "1.5k", "2m", "0.5b", "1,200", "-3", "+2.5%" → a number; blank or garbage → null
const parseNum = (str) => {
  const t = String(str ?? "").trim().toLowerCase().replace(/[,\s]|gp|%/g, "");
  const m = /^\+?(-?\d*\.?\d+)([kmb])?$/.exec(t);
  return m ? +m[1] * ({ k: 1e3, m: 1e6, b: 1e9 }[m[2]] || 1) : null;
};
const fmtPct = (v) => String(+v.toFixed(1));
const fmtSigned = (v) => (v > 0 ? "+" : "") + fmtPct(v);
// a bound reads as a round number: "10m", not "10.0m"
const fmtRound = (v) => fmtGp(v).replace(/(\.\d*?)0+(?=[kmb]$)/, "$1").replace(/\.(?=[kmb]$)/, "");
const fmtRoundQty = (v) => fmtQty(v).replace(/(\.\d*?)0+(?=[kmb]$)/, "$1").replace(/\.(?=[kmb]$)/, "");
// a screen's bound in words: "1.5k gp", "+2.5%", "10k"
const withUnit = (def, v) => def.fmt(v) + (def.unit === "%" ? "%" : def.unit ? " " + def.unit : "");
const boundsText = (def, b) => {
  const lo = b?.min != null, hi = b?.max != null;
  if (lo && hi) return `${withUnit(def, b.min)} – ${withUnit(def, b.max)}`;
  if (lo) return `≥ ${withUnit(def, b.min)}`;
  if (hi) return `≤ ${withUnit(def, b.max)}`;
  return "any";
};

const SCREENS = [
  { k: "price", label: "Going rate", unit: "gp", scale: "log", lo: 1, hi: 2e9, fmt: fmtRound, get: (it) => it.px,
    title: "The week's volume-weighted average price. Under 50 gp pays no GE tax." },
  { k: "gp", label: "Gp moved/day", unit: "gp", scale: "log", lo: 1e3, hi: 1e12, fmt: fmtRound, get: (it) => it.turnover,
    title: "Daily units traded × the going rate — the size of the river. Screen high for books that can absorb real size." },
  { k: "units", label: "Traded/day", unit: "", scale: "log", lo: 1, hi: 1e8, fmt: fmtRoundQty, get: (it) => it.units,
    title: "Units through the book on a typical day of the week." },
  { k: "margin", label: "Day margin", unit: "gp", scale: "log", lo: 1, hi: 1e7, fmt: fmtRound, get: (it) => it.dayMargin,
    title: "A typical day's gap between the buy side and the sell side, after tax, per item. A minimum of 1 gp is \"in profit\"." },
  { k: "roi", label: "ROI", unit: "%", scale: "lin", lo: -5, hi: 30, step: 0.5, fmt: fmtPct, get: (it) => it.dayRoi,
    title: "Day margin as a return on the buy side's going rate." },
  { k: "trend", label: "7d trend", unit: "%", scale: "lin", lo: -30, hi: 30, step: 1, fmt: fmtSigned, get: (it) => it.trend,
    title: "Change across the week, from a line fitted through the daily averages. Keep it within a few percent either side for steady prices." },
  { k: "today", label: "Today vs week", unit: "%", scale: "lin", lo: -20, hi: 20, step: 0.5, fmt: fmtSigned, get: (it) => it.todayVs,
    title: "How far today's price sits from the week's going rate. Cap it below zero for items on a cheap day, floor it above zero for a dear one." },
  { k: "dev", label: "Vs GE price", unit: "%", scale: "lin", lo: -30, hi: 30, step: 1, fmt: fmtSigned, get: (it) => it.guideDev,
    title: "How far the week's real trades sit from the official GE price — the in-game guide. Bounding this also hides items the GE price doesn't cover." },
  { k: "limit", label: "Limit/4h", unit: "", scale: "log", lo: 1, hi: 1e5, fmt: fmtRoundQty, get: (it) => it.limit,
    title: "The 4-hour buy limit — the most of the item one account can buy per window." },
];
const PRESETS = [
  { k: "deep", label: "Deep books", hint: "Books moving 10m+ gp and 10k+ units a day — size fills without moving them.", set: { gp: { min: 1e7 }, units: { min: 1e4 } } },
  { k: "profit", label: "In profit", hint: "A positive day margin after tax.", set: { margin: { min: 1 } } },
  { k: "fat", label: "Fat margins", hint: "A day ROI of 3% or better.", set: { roi: { min: 3 } } },
  { k: "steady", label: "Steady", hint: "Trend and today both within ±2% of the week — prices holding their level.", set: { trend: { min: -2, max: 2 }, today: { min: -2, max: 2 } } },
  { k: "cheap", label: "Cheap today", hint: "Today sits 2% or more below the week's going rate.", set: { today: { max: -2 } } },
  { k: "penny", label: "Penny stocks", hint: "Under 50 gp — no GE tax on the sale.", set: { price: { max: 49 } } },
  { k: "big", label: "Big tickets", hint: "1m gp and up.", set: { price: { min: 1e6 } } },
  { k: "honest", label: "Tracks the GE price", hint: "The week's trades within ±5% of the official GE price — a feed the GE price agrees with.", set: { dev: { min: -5, max: 5 } } },
];
const normBounds = (b) => ({ min: b?.min ?? null, max: b?.max ?? null });
const presetOn = (pr, screens) => Object.entries(pr.set).every(([k, b]) => {
  const cur = normBounds(screens[k]), want = normBounds(b);
  return cur.min === want.min && cur.max === want.max;
});

/* slider stops: every step of a linear screen; round numbers through each
   decade of a log one (1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8 × 10ⁿ). A handle
   only ever lands on a stop, so dragging and the arrow keys never fight the
   rounding — the text boxes take anything exact. */
const NICE = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8];
const buildTicks = ({ scale, lo, hi, step = 1 }) => {
  const out = [];
  if (scale === "log") {
    for (let e = Math.floor(Math.log10(lo)); ; e++) {
      for (const m of NICE) {
        const v = +(m * 10 ** e).toPrecision(3);
        if (v < lo) continue;
        if (v > hi) return out;
        out.push(v);
      }
    }
  }
  for (let v = lo; v <= hi + step * 1e-6; v += step) out.push(+v.toFixed(4));
  return out;
};
for (const d of SCREENS) d.ticks = buildTicks(d);
// the stop nearest a value — where a typed bound's handle sits
const nearestTick = ({ ticks, scale }, v) => {
  if (scale === "log" && !(v > 0)) return 0;
  const dist = scale === "log" ? (a, b) => Math.abs(Math.log(a) - Math.log(b)) : (a, b) => Math.abs(a - b);
  let best = 0;
  for (let i = 1; i < ticks.length; i++) if (dist(ticks[i], v) < dist(ticks[best], v)) best = i;
  return best;
};

// one typed bound: draft while focused, the formatted value otherwise
function BoundInput({ value, fmt, placeholder, label, onCommit }) {
  const [draft, setDraft] = useState(null);
  const commit = () => { if (draft != null) { onCommit(parseNum(draft)); setDraft(null); } };
  return (
    <input className="ge-in" type="text" inputMode="decimal" placeholder={placeholder} aria-label={label}
      value={draft ?? (value == null ? "" : fmt(value))}
      onChange={(e) => setDraft(e.target.value)} onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") { commit(); e.currentTarget.blur(); } else if (e.key === "Escape") setDraft(null); }} />
  );
}

// a screen: label + current bounds, then min box, two-handled slider, max box
function ScreenRange({ def, val, onChange }) {
  const { label, fmt, title, ticks } = def;
  const last = ticks.length - 1;
  const min = val?.min ?? null, max = val?.max ?? null;
  const minPos = min == null ? 0 : nearestTick(def, min);
  const maxPos = max == null ? last : nearestTick(def, max);
  // the slider's ends mean "any"; a handle dragged into the other never crosses it
  const dragMin = (p) => onChange({ min: p <= 0 ? null : ticks[Math.min(p, maxPos)], max });
  const dragMax = (p) => onChange({ min, max: p >= last ? null : ticks[Math.max(p, minPos)] });
  const on = min != null || max != null;
  // when both handles meet at an end, the one that can still move sits on top
  const minOnTop = minPos > last / 2;
  return (
    <div className={"ge-screen" + (on ? " on" : "")}>
      <div className="sl" title={title}><span>{label}</span><b>{boundsText(def, val)}</b></div>
      <div className="row">
        <BoundInput value={min} fmt={fmt} placeholder="min" label={label + " minimum"} onCommit={(v) => onChange({ min: v, max })} />
        <div className="ge-dual">
          <div className="track" />
          <div className="fill" style={{ left: `${(minPos / last) * 100}%`, right: `${100 - (maxPos / last) * 100}%` }} />
          <input type="range" min={0} max={last} step={1} value={minPos} onChange={(e) => dragMin(+e.target.value)}
            aria-label={label + " minimum"} style={{ zIndex: minOnTop ? 3 : 2 }} />
          <input type="range" min={0} max={last} step={1} value={maxPos} onChange={(e) => dragMax(+e.target.value)}
            aria-label={label + " maximum"} style={{ zIndex: minOnTop ? 2 : 3 }} />
        </div>
        <BoundInput value={max} fmt={fmt} placeholder="max" label={label + " maximum"} onCommit={(v) => onChange({ min, max: v })} />
      </div>
    </div>
  );
}

/* ================= commodities =================
   The goods everyone trades — ores, bars, logs, planks, hides, fish, herbs,
   runes and ammo — laid out as material families by processing stage, with
   a GEB (Grand Exchange Basket) on every family, every stage and the whole
   grid: a fixed load of goods priced at each day's going rates, set to 100
   where the window starts. The week already in memory draws the grid at
   once; a year of daily history per good streams in behind it (one wiki
   request each, a few at a time, cached a quarter hour at the edge) and the
   chart, the moves and the "unusual" flags fill in as it lands. */
const WINDOWS = [{ d: 30, label: "30 days" }, { d: 90, label: "90 days" }, { d: 365, label: "A year" }];
const WEIGHTINGS = [
  { k: "flow", label: "By flow", hint: "Each good weighs what it trades on a typical day — the basket is the cost of a day's flow through the family" },
  { k: "equal", label: "Equal", hint: "Every good counts the same — the geometric mean of each good's move" },
];
const LINE_SETS = [
  { k: "families", label: "Families", hint: "One line per material family" },
  { k: "stages", label: "Stages", hint: "One line per processing stage: raw, refined, product, across every family" },
];
const HIST_POOL = 6;
const cmStore = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch (e) { return d; } };
const lastOf = (arr) => { for (let i = arr.length - 1; i >= 0; i--) if (arr[i] != null) return arr[i]; return null; };
const lvlStr = (v) => (v == null ? "–" : v.toFixed(1));
const moveClass = (v) => (v == null ? "mut" : v > 0.5 ? "good" : v < -0.5 ? "bad" : "mut");
const breadthStr = (b) => (b.n === 0 ? "no moves yet" : `${b.up} up · ${b.down} down${b.flat ? ` · ${b.flat} flat` : ""}`);

// a year of daily history per item, fetched a few at a time; the map fills
// as they land and `version` ticks every few items so the tab repaints in
// steps rather than once per good
function useHistories(items, enabled) {
  const histRef = useRef(new Map());
  const [version, setVersion] = useState(0);
  const [progress, setProgress] = useState({ done: 0, total: 0, failed: 0 });
  useEffect(() => {
    if (!enabled) return undefined;
    const todo = items.filter((it) => !histRef.current.has(it.id));
    if (todo.length === 0) return undefined;
    let gone = false, next = 0, done = 0, failed = 0;
    setProgress({ done: 0, total: todo.length, failed: 0 });
    const worker = async () => {
      while (!gone && next < todo.length) {
        const it = todo[next++];
        try {
          const j = await apiGet("timeseries", `/timeseries?timestep=24h&id=${it.id}`);
          if (gone) return;
          histRef.current.set(it.id, Array.isArray(j?.data) ? j.data : []);
        } catch (e) { failed++; }
        done++;
        if (!gone && (done === todo.length || done % 8 === 0)) {
          setProgress({ done, total: todo.length, failed });
          setVersion((v) => v + 1);
        }
      }
    };
    Promise.all(Array.from({ length: HIST_POOL }, worker));
    return () => { gone = true; };
  }, [items, enabled]);
  return { hist: histRef.current, version, progress };
}

const unusual = (e) => {
  const out = [];
  const { pz, vz, n } = e.z || {};
  if (pz != null && Math.abs(pz) >= 2) out.push({
    cls: Math.abs(pz) >= 3 ? "tC" : "", text: `⚑ ${pz > 0 ? "high" : "low"}`,
    title: `Today's price sits ${Math.abs(pz).toFixed(1)} standard deviations ${pz > 0 ? "above" : "below"} its last ${n} days — unusual for this book.`,
  });
  if (vz != null && vz >= 2) out.push({
    cls: "", text: "⚑ vol",
    title: `This week's daily volume runs ${vz.toFixed(1)} standard deviations above the quarter before it — someone is moving size.`,
  });
  return out;
};

function GoodRow({ e, windowStart, onOpen }) {
  const it = e.it;
  const flags = unusual(e);
  const young = e.hasHistory && e.since != null && e.since > windowStart + 2 * DAY;
  return (
    <button type="button" className="cm-row" onClick={() => onOpen(it.id)}
      title={`${it.name}: going rate ${fmtGp(it.rate ?? it.mid)} gp · ${fmtDev(e.ret)} across the window · ${fmtDev(e.vsFamily)} against its family — tap for the day orders`}>
      <span className="nm">{it.name}{it.members && <span className="ge-mem">P2P</span>}</span>
      <span className="fl">
        {it.aside && <span className="ge-flag" title={it.aside === "crossed"
          ? "The tape's buy average sits above its sell average right now — the price is in motion, so the Market Board sets this book aside; here it's priced at the midpoint."
          : "A wide spread on a busy book — a data artifact or a knife, so the Market Board sets this book aside; here it's priced at the midpoint."}>{it.aside}</span>}
        {!e.hasHistory && <span className="ge-flag" title="No year of history yet — the move covers the week the board already knows.">week</span>}
        {young && <span className="ge-flag" title={`Priced only since ${fmtDay(e.since)} — the move covers less than the window.`}>young</span>}
        {flags.map((f) => <span key={f.text} className={"ge-flag " + f.cls} title={f.title}>{f.text}</span>)}
      </span>
      <span className="px">{fmtGp(it.rate ?? it.mid)}</span>
      <Sparkline points={e.spark} w={40} h={14} className={"ge-spark " + moveClass(e.ret)} />
      <span className={"mv " + moveClass(e.ret)}>{fmtDev(e.ret)}</span>
      <span className={"vs" + (e.vsFamily != null && Math.abs(e.vsFamily) >= 10 ? " warn" : "")} title="Against its family's basket">{fmtDev(e.vsFamily)}</span>
    </button>
  );
}

function SpreadRow({ s, onOpen }) {
  const y = s.yield || 1;
  const last = s.last;
  const makes = last ? last.margin + last.cost : null;
  const chain = s.ins.map((x) => `${x.qty > 1 ? x.qty + " " : ""}${x.name}`).join(" + ") + (s.fee ? ` + ${s.fee} gp` : "");
  const z = s.z;
  const word = z == null ? "no band yet" : z >= 2 ? "fatter than usual" : z <= -2 ? "thinner than usual" : "about usual";
  const cls = z == null ? "mut" : z >= 2 ? "good" : z <= -2 ? "bad" : "";
  const open = () => { if (s.outItem) onOpen(s.outItem.id); };
  return (
    <tr tabIndex={0} onClick={open} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } }}>
      <td>
        <span className="nm">{y > 1 ? `${y} × ` : ""}{s.out}</span>
        <small className="via">from {chain}{s.via ? ` · ${s.via}` : ""}</small>
      </td>
      <td className="gold">{makes != null ? fmtGp(makes) : "–"}</td>
      <td className="mut">{last ? fmtGp(last.cost) : "–"}</td>
      <td className={last ? (last.margin > 0 ? "good" : "bad") : "mut"}>{last ? (last.margin > 0 ? "+" : "") + fmtGp(last.margin) : "–"}</td>
      <td>{last && last.ratio != null ? last.ratio.toFixed(2) + "×" : "–"}</td>
      <td className="mut">{s.band ? `${s.band.mean.toFixed(2)} ± ${s.band.sd.toFixed(2)}` : "–"}</td>
      <td className={cls}>{word}{z != null && <small> ({(z > 0 ? "+" : "") + z.toFixed(1)}σ)</small>}</td>
      <td><Sparkline points={s.spark} w={48} h={16} className={"ge-spark " + (z == null ? "mut" : z >= 2 ? "good" : z <= -2 ? "bad" : "mut")} /></td>
    </tr>
  );
}

function Commodities({ items, aside, status, weekDays, onOpen }) {
  const [W, setW] = useState(() => { const v = +cmStore("fd:cm-window", "90"); return WINDOWS.some((w) => w.d === v) ? v : 90; });
  const [weighting, setWeighting] = useState(() => (cmStore("fd:cm-weighting", "flow") === "equal" ? "equal" : "flow"));
  const [lines, setLines] = useState("families");
  const [hidden, setHidden] = useState(() => new Set());
  const [tableOpen, setTableOpen] = useState(false);
  useEffect(() => { try { localStorage.setItem("fd:cm-window", String(W)); localStorage.setItem("fd:cm-weighting", weighting); } catch (e) {} }, [W, weighting]);

  const byName = useMemo(() => {
    const m = new Map();
    for (const it of aside || []) m.set(it.name, it);
    for (const it of items) m.set(it.name, it);
    return m;
  }, [items, aside]);
  const wanted = useMemo(() => basketNames().map((n) => byName.get(n)).filter(Boolean), [byName]);
  const { hist, version, progress } = useHistories(wanted, status === "live");
  const view = useMemo(
    () => buildCommodities({ families: FAMILIES, stages: STAGES, pairs: PAIRS, resolve: (n) => byName.get(n) || null, hist, weekDays, now: Date.now() / 1000, window: W, weighting }),
    [byName, hist, version, weekDays, W, weighting],
  );

  const series = useMemo(() => {
    const all = { key: "all", name: "All goods", color: ALL_COLOR, dashed: true, levels: view.all.levels, level: view.all, n: view.all.n };
    const fams = view.families.map((f) => ({ key: f.key, name: f.name, color: SLOT_COLORS[f.slot], levels: f.level.levels, level: f.level, n: f.members.length }));
    const stages = view.stages.map((s, i) => ({ key: "stage:" + s.key, name: s.name, color: SLOT_COLORS[i], levels: s.level.levels, level: s.level, n: s.n }));
    return lines === "stages" ? [all, ...stages] : [all, ...fams];
  }, [view, lines]);
  const toggle = useCallback((k) => setHidden((h) => { const n = new Set(h); if (n.has(k)) n.delete(k); else n.add(k); return n; }), []);

  const loading = status === "live" && progress.total > 0 && progress.done < progress.total;
  const winLabel = WINDOWS.find((w) => w.d === W)?.label || `${W} days`;
  const since = view.days[0];
  const failed = progress.total > 0 && progress.done === progress.total ? progress.failed : 0;

  return <>
    <p className="ge-read">
      <b>{view.all.n}</b> goods in <b>{view.families.length}</b> families · since <b>{fmtDay(since)}</b> ({winLabel.toLowerCase()})
      {status === "live" && <> · a year of history for <b>{view.coverage.withHistory}</b> of {view.coverage.resolved}{loading && <> — reading the year's trades…</>}{failed > 0 && <>, {failed} unreachable</>}</>}
      {status === "snapshot" && <> · offline: the week alone, no year behind it</>}
      {" "}· a <b>GEB</b> (Grand Exchange Basket) is a fixed load of goods priced at each day's going rates, set to 100 where the window starts. Tap a basket to hide or show its line; tap a good for its day orders.
    </p>

    <section className="ge-panel cm-controls">
      <div className="grp"><span className="ge-pixlbl">Window</span>
        {WINDOWS.map((w) => <button key={w.d} className={"ge-btn small" + (W === w.d ? " on" : "")} aria-pressed={W === w.d} onClick={() => setW(w.d)}>{w.label}</button>)}
      </div>
      <div className="grp"><span className="ge-pixlbl">Weighting</span>
        {WEIGHTINGS.map((w) => <button key={w.k} className={"ge-btn small" + (weighting === w.k ? " on" : "")} aria-pressed={weighting === w.k} title={w.hint} onClick={() => setWeighting(w.k)}>{w.label}</button>)}
      </div>
      <div className="grp"><span className="ge-pixlbl">Lines</span>
        {LINE_SETS.map((l) => <button key={l.k} className={"ge-btn small" + (lines === l.k ? " on" : "")} aria-pressed={lines === l.k} title={l.hint} onClick={() => { setLines(l.k); setHidden(new Set()); }}>{l.label}</button>)}
      </div>
      <div className="grp right">
        <button className={"ge-btn small" + (tableOpen ? " on" : "")} aria-expanded={tableOpen} onClick={() => setTableOpen((o) => !o)}>{tableOpen ? "Hide the table" : "As a table"}</button>
      </div>
    </section>

    <div className="cm-strip" role="group" aria-label="Baskets">
      {series.map((s) => {
        const on = !hidden.has(s.key);
        return (
          <button key={s.key} type="button" className={"cm-tile ge-inset" + (on ? "" : " off")} aria-pressed={on} onClick={() => toggle(s.key)}
            title={`${on ? "Hide" : "Show"} ${s.name} on the chart`}>
            <div className="hd"><span className={"bc-lgkey on" + (s.dashed ? " dashed" : "")} style={{ borderColor: s.color }} /><span className="nm">{s.name}</span><span className="n">{s.n}</span></div>
            <div className="lv"><b>{lvlStr(lastOf(s.levels))}</b><span className={moveClass(s.level.ret)}>{fmtDev(s.level.ret)}</span></div>
            <div className="br"><Sparkline points={s.level.spark} w={56} h={16} className={"ge-spark " + moveClass(s.level.ret)} /><small>{breadthStr(s.level.breadth)}</small></div>
          </button>
        );
      })}
    </div>

    <section className="ge-panel cm-chart">
      <LevelChart days={view.days} series={series} events={W <= 100 ? view.events : []} hidden={hidden} onToggle={toggle} height={280}
        note={loading ? `reading the year's trades — ${progress.done} of ${progress.total}` : status === "snapshot" ? "offline: the week alone" : null}
        ariaLabel={`${lines === "stages" ? "Stage" : "Family"} baskets, rebased to 100 at ${fmtDay(since)}`} />
      <p className="ge-hint">
        Every line starts at 100 on {fmtDay(since)} — {weighting === "flow" ? "the cost of a typical day's flow through that basket" : "the typical good's move in that basket"}, day by day since.
        {W <= 100 && " The faint uprights are Wednesday game updates."} The last point is today's tape; the wiki aggregates a finished day a day or two later, so the line's last step is provisional.
        Hover or use the arrow keys to read every line at a date.
      </p>
    </section>

    {tableOpen && (
      <div className="ge-tablewrap ge-inset cm-tablewrap">
        <table className="ge-t cm-t">
          <thead><tr><th style={{ textAlign: "left" }}>Basket</th><th>Goods</th><th>Low</th><th>High</th><th>Now</th><th>Move</th><th>Up · down · flat</th></tr></thead>
          <tbody>
            {series.map((s) => {
              const vals = s.levels.filter((v) => v != null);
              const lo = vals.length ? Math.min(...vals) : null, hi = vals.length ? Math.max(...vals) : null;
              return (
                <tr key={s.key} style={{ cursor: "default" }}>
                  <td><span className="nm">{s.name}</span></td>
                  <td className="mut">{s.n}</td>
                  <td>{lvlStr(lo)}</td><td>{lvlStr(hi)}</td>
                  <td className="gold">{lvlStr(lastOf(s.levels))}</td>
                  <td className={moveClass(s.level.ret)}>{fmtDev(s.level.ret)}</td>
                  <td className="mut">{s.level.breadth.up} · {s.level.breadth.down} · {s.level.breadth.flat}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    )}

    {view.families.map((f) => (
      <section key={f.key} className="ge-panel cm-family">
        <header className="cm-famhead">
          <span className="bc-lgkey on" style={{ borderColor: SLOT_COLORS[f.slot] }} />
          <h3>{f.name}</h3>
          <b className="lv">{lvlStr(lastOf(f.level.levels))}</b>
          <span className={"mv " + moveClass(f.level.ret)}>{fmtDev(f.level.ret)}</span>
          <small>{breadthStr(f.level.breadth)} · {f.members.length} goods</small>
        </header>
        <div className="cm-stages">
          {f.cells.map((c) => (
            <div key={c.stage} className="cm-stage">
              <h4 title={STAGES.find((s) => s.key === c.stage)?.hint}>{c.name}</h4>
              {c.items.length === 0
                ? <div className="cm-none">– nothing at this stage</div>
                : <div className="cm-rows">{c.items.map((e) => <GoodRow key={e.it.id} e={e} windowStart={since} onOpen={onOpen} />)}</div>}
            </div>
          ))}
        </div>
      </section>
    ))}

    <section className="ge-panel cm-spreads">
      <h3>Linked pairs</h3>
      <p className="ge-hint">
        Goods the recipes tie together — logs to planks, ore to bars, a bar to four cannonballs. Each row is one action at today's going
        rates: what it makes, what its inputs and the NPC's fee cost, and the ratio of the two against its usual band over the last{" "}
        {BAND_DAYS} days. A ratio well outside its band is either a job just opened on the Job Board or a market that has changed shape.
        Before tax and labour — the Job Board prices those. Tap a row for the product's day orders.
      </p>
      <div className="ge-tablewrap ge-inset">
        <table className="ge-t cm-t">
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>Chain</th>
              <th title="Output × yield at the going rate">Makes</th>
              <th title="Inputs at the going rate, plus any NPC fee">Costs</th>
              <th title="Makes less costs, per action">Pays</th>
              <th title="Makes over costs">Ratio</th>
              <th title={`The ratio's mean ± one standard deviation over the last ${BAND_DAYS} complete days`}>Usual</th>
              <th title="Today's ratio against its usual band, in standard deviations">Now</th>
              <th title="The ratio across the window">Window</th>
            </tr>
          </thead>
          <tbody>{view.spreads.map((s) => <SpreadRow key={s.key} s={s} onOpen={onOpen} />)}</tbody>
        </table>
      </div>
    </section>

    <p className="ge-foot">
      A GEB (Grand Exchange Basket) prices a fixed load of goods at each day's volume-weighted going rate and sets it to 100 where the
      window starts. By flow, each good weighs the units it trades on a typical day (fixed for the window, so a riser can't vote itself
      heavier); equal, every good counts the same and the basket is the geometric mean of their moves. Both are chain-linked day by day
      over whichever goods have a price on both days, so a thin day or a young book moves the level by its own move and never by its absence;
      a price is carried across a gap of up to {MAX_GAP} days.<br />
      Each good's move is its going rate today over its going rate where the window starts; "vs family" is that move less its family's.
      ⚑ marks today's price more than two standard deviations from the good's last {BAND_DAYS} days, or a week whose daily
      volume runs that far above the {BAND_DAYS} days before it.
      History is one wiki request per good, a few at a time, only when this tab is open and shared through the site's edge cache.
      Live prices courtesy of the <a className="ge-link" href="https://prices.runescape.wiki" target="_blank" rel="noreferrer">OSRS Wiki price API</a> — estimates, not promises.
    </p>
  </>;
}

/* ================= app ================= */
export default function JobBoardApp() {
  const [status, setStatus] = useState("loading"); // loading | live | snapshot
  const [live, setLive] = useState(null);          // {items, universe, hidden, days} | null
  const [updatedAt, setUpdatedAt] = useState(null);
  const [, setTick] = useState(0);                 // periodic re-render for the age chip

  const [search, setSearch] = useState("");
  const [f2pOnly, setF2pOnly] = useState(false);
  const [screens, setScreens] = useState({});  // screen key -> {min, max}; absent = any
  const [screensOpen, setScreensOpen] = useState(() => {
    try { return localStorage.getItem("fd:screens-open") !== "0"; } catch (e) { return true; }
  });
  useEffect(() => { try { localStorage.setItem("fd:screens-open", screensOpen ? "1" : "0"); } catch (e) {} }, [screensOpen]);
  const setScreen = useCallback((k, b) => setScreens((cur) => {
    const next = { ...cur };
    if (!b || (b.min == null && b.max == null)) delete next[k]; else next[k] = { min: b.min ?? null, max: b.max ?? null };
    return next;
  }), []);
  const togglePreset = (pr) => setScreens((cur) => {
    const next = { ...cur };
    if (presetOn(pr, cur)) for (const k of Object.keys(pr.set)) delete next[k];
    else for (const [k, b] of Object.entries(pr.set)) next[k] = normBounds(b);
    return next;
  });
  const [sortKey, setSortKey] = useState("turnover");
  const [sortDir, setSortDir] = useState(-1);
  const [selId, setSelId] = useState(null);
  const [view, setView] = useState("jobs"); // jobs | market | goods | econ

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

  /* polite auto-poll: every 10 minutes, only while the tab is visible — a day
     desk has no use for the minute hand, and apiGet's per-endpoint caches mean
     a tick costs at most the handful of requests whose windows have turned */
  useEffect(() => {
    const iv = setInterval(() => { if (!document.hidden) refresh(true); }, 600_000);
    const onVis = () => { if (!document.hidden) refresh(true); };
    document.addEventListener("visibilitychange", onVis);
    const age = setInterval(() => setTick((x) => x + 1), 30_000);
    return () => { clearInterval(iv); clearInterval(age); document.removeEventListener("visibilitychange", onVis); };
  }, [refresh]);

  const assessed = useMemo(() => (live?.items ?? BASE_ITEMS).map(assess), [live]);
  const asideItems = useMemo(() => (live?.aside ?? []).map(assess), [live]);

  const activeScreens = useMemo(() => SCREENS.filter((d) => screens[d.k]), [screens]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return assessed.filter((it) => {
      if (f2pOnly && it.members) return false;
      if (q && !it.name.toLowerCase().includes(q)) return false;
      for (const d of activeScreens) {
        // a bounded screen drops rows with no number for it — no week, no
        // guide price — they can't show what's being asked
        const v = d.get(it);
        if (v == null || Number.isNaN(v)) return false;
        const b = screens[d.k];
        if (b.min != null && v < b.min) return false;
        if (b.max != null && v > b.max) return false;
      }
      return true;
    });
  }, [assessed, search, f2pOnly, screens, activeScreens]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      const va = a[sortKey], vb = b[sortKey];
      if (sortKey === "name") return (va < vb ? -1 : va > vb ? 1 : 0) * sortDir;
      // a row with no number for the column always sinks, whichever way the sort runs
      const na = va == null || Number.isNaN(va), nb = vb == null || Number.isNaN(vb);
      if (na || nb) return na && nb ? 0 : na ? 1 : -1;
      return (va - vb) * sortDir;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const clickSort = (k, dir = -1) => {
    if (sortKey === k) setSortDir((d) => -d);
    else { setSortKey(k); setSortDir(dir); }
  };
  const Th = ({ k, dir, children, cls = "", title }) => (
    <th className={(sortKey === k ? "on " : "") + cls} onClick={() => clickSort(k, dir)} title={title}>
      {children}{sortKey === k && <span className="arr">{sortDir === -1 ? "▼" : "▲"}</span>}
    </th>
  );

  const sel = useMemo(() => assessed.find((p) => p.id === selId) || asideItems.find((p) => p.id === selId) || null, [assessed, asideItems, selId]);
  const hiddenN = live?.hidden ? live.hidden.oneSided + live.hidden.crossedAvg + live.hidden.dislocated : 0;
  const snapAgeH = Math.round((Date.now() / 1000 - SNAPSHOT.ts) / 3600);
  const snapAgeStr = snapAgeH > 48 ? `~${Math.round(snapAgeH / 24)} days old` : `~${snapAgeH}h old`;
  const weekDays = live?.days ?? (SNAPSHOT.days || []);
  const weekSpan = weekDays.length ? `${fmtDay(weekDays[0])} – ${fmtDay(weekDays[weekDays.length - 1])}` : null;
  const SHOW = 400;
  const SORT_NOTE = {
    turnover: "Ranked by gp moved/day — the deepest books first, not the fattest margins",
    units: "Ranked by units traded per day",
    dayMargin: "Ranked by day margin — the fattest after-tax gap per item first",
    dayRoi: "Ranked by day ROI — the fattest margin for the gp laid out first",
    rangePos: sortDir === 1 ? "Ranked by where today sits in the week — the cheapest first" : "Ranked by where today sits in the week — the dearest first",
    trend: sortDir === -1 ? "Ranked by the week's trend — strongest risers first" : "Ranked by the week's trend — steepest fallers first",
  };

  return (
    <div className="ge-root">
      <style>{CSS}</style>
      <div className="ge-wrap">

        {/* masthead */}
        <header className="ge-mast">
          <div>
            <h1 className="ge-title">Job Board</h1>
            <p className="ge-sub">{view === "market" ? "What things are going for this week" : view === "goods" ? "The goods everyone trades, family by family" : view === "econ" ? "How the exchange works" : "Skilling work priced by the Grand Exchange"}</p>
          </div>
          <div className="ge-status">
            {status === "live" && (
              <span className="ge-chip live"><i className="ge-dot" />LIVE · {updatedAt ? agoStr((Date.now() - updatedAt.getTime()) / 60000).replace(" ago", "").toUpperCase() : ""}</span>
            )}
            {status === "snapshot" && <span className="ge-chip snap">◈ SNAPSHOT · {SNAP_DATE.toLocaleDateString([], { day: "numeric", month: "short" })}</span>}
            {status === "loading" && <span className="ge-chip load">… reading the week</span>}
            <button className="ge-btn" onClick={() => refresh(false)} disabled={status === "loading"}>↻ Refresh</button>
          </div>
        </header>
        <hr className="ge-rule" />

        {/* tabs */}
        <div className="ge-tabs" role="tablist">
          <button className={"ge-tab" + (view === "jobs" ? " on" : "")} role="tab"
            aria-selected={view === "jobs"} onClick={() => setView("jobs")}>Job Board</button>
          <button className={"ge-tab" + (view === "market" ? " on" : "")} role="tab"
            aria-selected={view === "market"} onClick={() => setView("market")}>Market Board</button>
          <button className={"ge-tab" + (view === "goods" ? " on" : "")} role="tab"
            aria-selected={view === "goods"} onClick={() => setView("goods")}>Commodities</button>
          <button className={"ge-tab" + (view === "econ" ? " on" : "")} role="tab"
            aria-selected={view === "econ"} onClick={() => setView("econ")}>Econ 101</button>
        </div>

        {status === "snapshot" && (
          <div className="ge-warn" role="alert">
            <b>Live feed unreachable.</b> Showing the baked snapshot from{" "}
            {SNAP_DATE.toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
            {snapAgeH > 1 ? ` (${snapAgeStr})` : ""} — the week it describes has moved on, so treat these as a teaching tape.
          </div>
        )}

        {view === "jobs" && <JobBoard items={assessed} status={status} />}
        {view === "econ" && <Econ101 />}
        {view === "goods" && <Commodities items={assessed} aside={asideItems} status={status} weekDays={weekDays} onOpen={setSelId} />}

        {view === "market" && <>
        <p className="ge-read">
          <b>{assessed.length.toLocaleString()}</b> items on the exchange
          {weekSpan && <> · the week of <b>{weekSpan}</b></>}
          {filtered.length !== assessed.length && <> · <b>{filtered.length.toLocaleString()}</b> make it through your screens</>}
          {hiddenN > 0 && <> · {hiddenN.toLocaleString()} unpriceable books set aside (no market, crossed or dislocated)</>}
          {" "}· tap an item for its day orders.
          {SORT_NOTE[sortKey] && <> {SORT_NOTE[sortKey]}; click any column to re-rank.</>}
        </p>

        {/* screens */}
        <section className="ge-panel ge-screens">
          <div className="ge-filters">
            <div className="grow">
              <input className="ge-in" placeholder="Search the exchange… e.g. rune, shark, whip" value={search}
                onChange={(e) => setSearch(e.target.value)} aria-label="Search items" />
            </div>
            <label className="ge-tog"><input type="checkbox" checked={f2pOnly} onChange={(e) => setF2pOnly(e.target.checked)} />F2P only</label>
            <button className="ge-btn" onClick={() => setScreensOpen((o) => !o)} aria-expanded={screensOpen}
              title="A min and a max on every column — type them or drag the handles">
              {screensOpen ? "▴ Hide screens" : "▾ Screens"}{activeScreens.length > 0 && !screensOpen ? ` (${activeScreens.length})` : ""}
            </button>
            <button className="ge-btn" onClick={() => { setScreens({}); setF2pOnly(false); setSearch(""); }}
              disabled={activeScreens.length === 0 && !f2pOnly && !search}>Clear all</button>
          </div>
          {(activeScreens.length > 0 || f2pOnly) && (
            <div className="ge-active" aria-label="Active screens">
              {f2pOnly && (
                <span className="ge-achip"><span>F2P only</span>
                  <button onClick={() => setF2pOnly(false)} aria-label="Clear F2P only">✕</button></span>
              )}
              {activeScreens.map((d) => (
                <span key={d.k} className="ge-achip"><span>{d.label}</span>{boundsText(d, screens[d.k])}
                  <button onClick={() => setScreen(d.k, null)} aria-label={`Clear the ${d.label} screen`}>✕</button></span>
              ))}
              <span className="ge-count"><b>{filtered.length.toLocaleString()}</b> of {assessed.length.toLocaleString()} make it through</span>
            </div>
          )}
          {screensOpen && <>
            <div className="ge-presets" role="group" aria-label="Preset screens">
              {PRESETS.map((pr) => (
                <button key={pr.k} className={"ge-preset" + (presetOn(pr, screens) ? " on" : "")} title={pr.hint}
                  aria-pressed={presetOn(pr, screens)} onClick={() => togglePreset(pr)}>{pr.label}</button>
              ))}
            </div>
            <div className="ge-sgrid">
              {SCREENS.map((d) => <ScreenRange key={d.k} def={d} val={screens[d.k]} onChange={(b) => setScreen(d.k, b)} />)}
            </div>
          </>}
        </section>

        {/* the board */}
        <div className="ge-tablewrap ge-inset">
          <table className="ge-t">
            <thead>
              <tr>
                <Th k="name" dir={1}>Item</Th>
                <Th k="rate" title="The week's volume-weighted average price">Going rate</Th>
                <Th k="todayVs" cls="hide-sm" title="Today's price against the week's going rate">Today</Th>
                <Th k="trend" cls="hide-sm" title="Change across the week, from a line fitted through the daily averages">7d trend</Th>
                <Th k="rangePos" dir={1} cls="hide-sm" title="The week's lowest daily buy and highest daily sell, with today's price marked between them — far left is a cheap day, far right a dear one; a hollow ring means today broke out of the week's band">Week's range</Th>
                <Th k="dayMargin" title="A typical day's gap between the buy side and the sell side, after tax">Day margin</Th>
                <Th k="dayRoi" title="Day margin as a return on the buy side's going rate">ROI</Th>
                <Th k="turnover" title="Daily units traded × the going rate — the size of the river">Gp moved/day</Th>
                <Th k="units" cls="hide-sm" title="Units through the book on a typical day of the week">Traded/day</Th>
                <Th k="limit" cls="hide-sm hide-md">Limit/4h</Th>
              </tr>
            </thead>
            <tbody>
              {sorted.slice(0, SHOW).map((it) => (
                <tr key={it.id} tabIndex={0}
                  onClick={() => setSelId(it.id)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelId(it.id); } }}>
                  <td title={it.name}>
                    <span className="nm">{it.name}</span>
                    {it.members && <span className="ge-mem">P2P</span>}
                    {it.nDays > 0 && it.nDays < LOOKBACK && <span className="ge-flag" title={`Only ${it.nDays} of the last ${LOOKBACK} days saw two-sided trading — the weekly numbers rest on a thin week.`}>{it.nDays}d</span>}
                    {!(it.nDays > 0) && <span className="ge-flag tC" title="No daily history for this item — every number here is today's tape alone.">no week</span>}
                    {it.src === "day" && <span className="ge-flag" title="Nothing on the tape this hour — today's price is the latest daily average.">quiet</span>}
                  </td>
                  <td className="gold">{fmtGp(it.rate ?? it.mid)}</td>
                  <td className={"hide-sm " + devClass(it.todayVs)}>{fmtDev(it.todayVs)}</td>
                  <td className={"hide-sm " + trendClass(it.trend)}>{fmtDev(it.trend)}<Sparkline points={it.mids || []} w={48} h={16} className="ge-spark" /></td>
                  <td className="hide-sm rng">
                    {it.rangeLo != null && it.rangeHi != null ? (
                      <span className="ge-rng" title={rangeLabel(it)}>
                        <small>{fmtGp(it.rangeLo)}</small>
                        <RangeBar lo={it.rangeLo} hi={it.rangeHi} now={it.mid} w={48} label={rangeLabel(it)} />
                        <small>{fmtGp(it.rangeHi)}</small>
                      </span>
                    ) : <span className="mut">–</span>}
                  </td>
                  <td className={it.dayMargin == null ? "mut" : it.dayMargin > 0 ? "good" : "bad"}>{it.dayMargin == null ? "–" : fmtGp(it.dayMargin)}</td>
                  <td className={it.dayRoi == null ? "mut" : it.dayRoi > 0 ? "good" : "bad"}>{it.dayRoi == null ? "–" : it.dayRoi.toFixed(Math.abs(it.dayRoi) >= 100 ? 0 : 1) + "%"}</td>
                  <td className="gold" title={`${fmtQty(it.units)} units × ${fmtGp(it.px)} gp`}>{fmtGp(it.turnover)}</td>
                  <td className="mut hide-sm">{fmtQty(it.units)}</td>
                  <td className="mut hide-sm hide-md">{fmtQty(it.limit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {sorted.length === 0 && <div className="ge-more">Nothing on the exchange makes it through — loosen a screen, or clear them all.</div>}
          {sorted.length > SHOW && <div className="ge-more">Showing the top {SHOW} of {sorted.length.toLocaleString()} — search or filter to narrow the board.</div>}
        </div>

        <p className="ge-foot">
          Going rate = the week's volume-weighted average of every trade the feed saw, over the last {LOOKBACK} complete
          days — never a single print, so one bait trade can't paint the board. Today = the current hour's average
          against that rate; 7d trend = a line through the daily averages; Week's range = the week's lowest daily buy
          and highest daily sell, with today's price marked between them.<br />
          Day margin = a typical day's gap between what sellers got and what buyers paid, after GE tax (2% of sale,
          capped at 5m; under 50 gp and bonds exempt); ROI = that margin against the buy side's rate. Gp moved/day =
          daily units × the going rate — the depth of the river, not your share of it; Traded/day = the units themselves.<br />
          Screens put a min and a max on any column — type them (1.5k, 20m, -3) or drag the handles; a bounded screen
          drops rows with no number for it. Unpriceable books (no market, crossed, dislocated) are set aside; a thin
          week wears its day count. Tap an item for standing orders priced to fill within a day of normal cycling.<br />
          Live prices courtesy of the <a className="ge-link" href="https://prices.runescape.wiki" target="_blank" rel="noreferrer">OSRS Wiki price API</a> — estimates, not promises.
        </p>
        </>}
      </div>

      {sel && <ItemPopup key={sel.id} it={sel} status={status} onClose={() => setSelId(null)} />}
    </div>
  );
}
