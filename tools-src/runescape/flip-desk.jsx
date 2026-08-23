import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid,
  Tooltip as RTooltip, ResponsiveContainer, BarChart, Bar, Cell,
  LineChart, Line,
} from "recharts";

/* ================= baked snapshot (captured 20 Aug 2026, OSRS Wiki real-time prices) =================
   v1 schema (this capture): [id, name, limit, members, lastLow, lastHigh, 1hVol, 24hVol, drift%, staleMin]
   v2 schema (scripts/capture-snapshot.mjs): adds 5m/1h volume-weighted averages and per-side volumes,
   which lets offline mode use the same verified-average pricing as the live feed. */
import SNAPSHOT_RAW from "./flip-desk-snapshot.json";
const SNAPSHOT = SNAPSHOT_RAW;

const API = "https://prices.runescape.wiki/api/v1/osrs";
const SNAP_DATE = new Date(SNAPSHOT.ts * 1000);

/* ================= GE mechanics ================= */
// 2% tax on the sale price of each item, rounded down, capped at 5m/item.
// Items that sell below 50 gp are exempt — the classic penny-flipper edge.
// Items exempt from GE tax regardless of price (per the wiki's exemption list).
const TAX_EXEMPT = new Set([13190]); // Old school bond
const geTax = (sell, id) =>
  (TAX_EXEMPT.has(id) || sell < 50 ? 0 : Math.min(Math.floor(sell * 0.02), 5_000_000));

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;

/* ================= formatting ================= */
const fmtGp = (n) => {
  if (n == null || isNaN(n)) return "–";
  const neg = n < 0 ? "-" : "";
  const x = Math.abs(n);
  if (x >= 1e9) return neg + (x / 1e9).toFixed(x >= 1e10 ? 1 : 2) + "b";
  if (x >= 1e6) return neg + (x / 1e6).toFixed(x >= 1e7 ? 1 : 2) + "m";
  if (x >= 10000) return neg + (x / 1000).toFixed(1) + "k";
  // averaged prices go fractional on penny items — a 0.4 gp edge is not a 0 gp edge
  if (x < 10 && x !== Math.round(x)) return neg + x.toFixed(1);
  return neg + Math.round(x).toLocaleString();
};
const fmtFull = (n) => {
  if (n == null) return "–";
  if (Math.abs(n) < 10 && n !== Math.round(n)) return n.toFixed(1) + " gp";
  return Math.round(n).toLocaleString() + " gp";
};
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

/* ================= data shaping =================
   Every item is normalized to one record shape whatever the source:
   latest  = last trade print per side (display/freshness only, never pricing)
   m5 / h1 = windowed volume-weighted averages + per-side volumes (pricing)   */
const rowToItem = (r) => SNAPSHOT.version === 2
  ? {
      id: r[0], name: r[1], limit: r[2], members: !!r[3],
      latest: { low: r[4], high: r[5], lowT: r[6], highT: r[7] },
      m5: r[8] == null ? null : { al: r[8], ah: r[9], lv: r[10], hv: r[11] },
      h1: r[12] == null ? null : { al: r[12], ah: r[13], lv: r[14], hv: r[15] },
      dv: r[16], snapVol: null, snapStale: null,
    }
  : { // v1 rows carry only the raw prints — priceable, but capped at confidence C
      id: r[0], name: r[1], limit: r[2], members: !!r[3],
      latest: { low: r[4], high: r[5], lowT: null, highT: null },
      m5: null, h1: null, combinedHv: r[6], dv: r[7],
      snapVol: r[8] < 0 ? null : r[8], snapStale: r[9],
    };
const BASE_ITEMS = SNAPSHOT.items.map(rowToItem);

/* ================= the model =================
   Pricing: the two /latest prints are asynchronous last trades, not a fillable
   two-way quote — one bot dump or one impatient buyer skews them for everyone.
   So buy/sell anchor to windowed volume-weighted averages instead: the 5-minute
   window when both sides traded meaningfully, else the 1-hour window, else the
   row is unpriceable and leaves the board. Raw prints only price v1-snapshot
   rows, flagged confidence C. Crossed prints are a data-disagreement signal and
   are never repaired by swapping.

   Risk 0–100 from three pressures, each independent of the reward estimate:
   - fill: the thinner ONE-SIDED hourly flow (your bid fills only from
     insta-sellers, your ask only from insta-buyers)
   - drift: 5m-vs-1h mid movement, judged against the spread it has to cross —
     missing drift data is the thin-book case and scores conservative, not safe
   - staleness: minutes since the older side last traded */
function assess(it, nowSec) {
  const { latest } = it;
  const crossed = latest.low != null && latest.high != null && latest.high < latest.low;

  const ok5 = it.m5 && it.m5.al && it.m5.ah && it.m5.lv >= 5 && it.m5.hv >= 5;
  const ok1 = it.h1 && it.h1.al && it.h1.ah && it.h1.lv >= 1 && it.h1.hv >= 1;
  const source = ok5 ? "5m" : ok1 ? "1h" : (it.snapStale != null ? "prints" : null);

  let hidden = null;
  let low, high;
  if (source === "5m") { low = it.m5.al; high = it.m5.ah; }
  else if (source === "1h") { low = it.h1.al; high = it.h1.ah; }
  else if (source === "prints") {
    low = latest.low; high = latest.high;
    if (crossed) hidden = "crossed prints";
  } else hidden = "one-sided book";

  if (hidden) { low = latest.low ?? 0; high = latest.high ?? 0; }
  if (high < low) { hidden = hidden || "crossed averages"; }

  const tax = geTax(high, it.id);
  const margin = high - low - tax;
  const roi = low > 0 ? (margin / low) * 100 : 0;
  const spread = low > 0 ? ((high - low) / low) * 100 : 0;

  // A wide spread on a busy book is not an opportunity — real competition would
  // have closed it. It means dislocated prints or a price in motion.
  if (!hidden && high >= 50 && spread > 10 && it.dv > 20_000) hidden = "dislocated prints";

  // one-sided accessible flow per hour; v1 rows only know the combined figure
  const legFlow = it.h1 ? Math.min(it.h1.lv, it.h1.hv) : Math.floor((it.combinedHv || 0) / 4);
  const buyFlow = it.h1 ? it.h1.lv : legFlow;
  const sellFlow = it.h1 ? it.h1.hv : legFlow;
  const hv = it.h1 ? it.h1.lv + it.h1.hv : (it.combinedHv || 0);

  // drift: 5m mid vs 1h mid, only when both windows have both sides — a
  // one-sided window would inject half-spread bounce into the metric
  let drift = it.snapVol;
  if (ok5 && ok1) {
    const mid5 = (it.m5.al + it.m5.ah) / 2, mid1 = (it.h1.al + it.h1.ah) / 2;
    drift = mid1 > 0 ? (Math.abs(mid5 - mid1) / mid1) * 100 : null;
  } else if (it.snapStale == null) drift = null;
  if (drift != null && high < 50) drift = Math.min(drift, 8); // penny ticks are noise

  const stale = latest.lowT != null && latest.highT != null
    ? Math.max(nowSec - latest.highT, nowSec - latest.lowT) / 60
    : (it.snapStale ?? 999);

  const fillR = clamp(100 - Math.log10(legFlow + 1) * 20, 0, 100);
  const driftR = drift == null
    ? 70 // no drift data = nobody traded recently = the risky case, not the calm one
    : clamp(Math.max(drift * 2.5, (drift / Math.max(spread, 0.5)) * 40), 0, 100);
  const staleR = clamp(stale * 1.5, 0, 100);
  const risk = Math.round(0.45 * fillR + 0.35 * driftR + 0.2 * staleR);

  const tier = source === "prints" || drift == null || stale > 60 || crossed
    ? "C" : source === "5m" && stale <= 15 ? "A" : "B";

  return {
    ...it, low, high, hv, tax, margin, roi, spread, crossed, source, hidden,
    legFlow, buyFlow, sellFlow, vol: drift, stale: Math.round(stale),
    fillR, driftR, staleR, risk, tier,
  };
}

/* play = 0 patient 4-hour limits … 1 five-minute scalper */
function playOut(a, budget, play) {
  const cycleH = lerp(4, 0.25, play);                    // round-trip you'll tolerate
  // ~10% of the thinner side's flow — you queue behind everyone who saw the
  // same feed, and your bid fills fastest exactly when the price moves against you
  const capacity = Math.max(0, Math.floor(a.legFlow * cycleH * 0.1));
  const afford = a.low > 0 ? Math.floor(budget / a.low) : 0;
  const qty = Math.max(0, Math.min(a.limit, afford, capacity));
  const perCycle = qty * a.margin;
  // buy limit gates you to `limit` units per 4h no matter how fast you churn
  const gpHr = qty > 0 ? Math.min(perCycle / cycleH, (a.limit * a.margin) / 4) : 0;
  const gpHrLo = gpHr * 0.5;                             // honest floor, not a promise
  const capital = qty * a.low;
  const limitBound = qty === a.limit && cycleH < 4;
  const buyH = qty > 0 ? qty / Math.max(a.buyFlow * 0.1, 1) : 0;
  const sellH = qty > 0 ? qty / Math.max(a.sellFlow * 0.1, 1) : 0;
  return { ...a, cycleH, qty, perCycle, gpHr, gpHrLo, capital, afford, limitBound, buyH, sellH };
}

// exported for model tests (scripts/); the page only uses the default export
export { geTax, assess, playOut, rowToItem };

const riskBucket = (r) => (r < 30 ? "low" : r < 60 ? "medium" : "high");
const RISK_COLOR = { low: "#83CE70", medium: "#E0A43A", high: "#E26A5A" };

/* ================= presets ================= */
const PRESETS = [
  {
    key: "penny", label: "Penny bulk · tax-free",
    blurb: "Sub-50 gp items dodge the 2% tax entirely. One tick of margin on iron arrows or nails, moved in the tens of thousands.",
    c: { budget: 200_000, play: 0.55, riskTol: 45, minRoi: 10, taxFree: true, f2p: false },
  },
  {
    key: "scalp", label: "5-minute scalps",
    blurb: "Deep books that fill in minutes. You're paid for attention, not patience — reprice constantly, exit fast.",
    c: { budget: 5_000_000, play: 1, riskTol: 75, minRoi: 0.8, taxFree: false, f2p: false },
  },
  {
    key: "limits", label: "Steady 4-hour limits",
    blurb: "Set offers, walk away, collect. Ranked by what a full buy limit is worth, not by churn speed.",
    c: { budget: 20_000_000, play: 0.08, riskTol: 50, minRoi: 1, taxFree: false, f2p: false },
  },
  {
    key: "whale", label: "High roller",
    blurb: "Big-ticket gear where one flip pays like a boss drop — and one drift wipes a day. Thin books, wide nerves.",
    c: { budget: 600_000_000, play: 0.35, riskTol: 90, minRoi: 0.4, taxFree: false, f2p: false },
  },
];

const SORTS = [
  { key: "gpHr", label: "est. gp/hr" },
  { key: "roi", label: "ROI" },
  { key: "perCycle", label: "gp / cycle" },
  { key: "margin", label: "margin" },
  { key: "dv", label: "24h volume" },
  { key: "risk", label: "risk" },
  { key: "low", label: "price" },
];

/* ================= styles ================= */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700&display=swap');
.fd-root {
  --bark:#161009; --panel:#221A10; --panel2:#2B2214; --inset:#1B1409;
  --trim:#57452A; --trim-hi:#8A6F3D; --gold:#F0B437; --gold-dim:#C69A45;
  --parch:#EDE1C6; --mut:#A5937A; --green:#83CE70; --red:#E26A5A; --amber:#E0A43A;
  --mono:ui-monospace,'Cascadia Code','SF Mono',Menlo,Consolas,monospace;
  --disp:'Cinzel',Georgia,'Times New Roman',serif;
  background:var(--bark); color:var(--parch); min-height:100vh;
  font-family:'Segoe UI',system-ui,-apple-system,Roboto,sans-serif;
  font-size:14px; line-height:1.45;
}
.fd-root *, .fd-root *::before, .fd-root *::after { box-sizing:border-box; }
.fd-wrap { max-width:1160px; margin:0 auto; padding:20px 16px 60px; }

/* masthead */
.fd-mast { display:flex; align-items:flex-end; justify-content:space-between; gap:12px; flex-wrap:wrap; padding-bottom:14px; }
.fd-title { font-family:var(--disp); font-weight:700; font-size:clamp(22px,4vw,34px); letter-spacing:.06em; color:var(--gold); margin:0; line-height:1.1; }
.fd-sub { font-family:var(--disp); font-weight:600; font-size:11px; letter-spacing:.34em; color:var(--mut); text-transform:uppercase; margin:2px 0 0; }
.fd-rule { height:3px; border:none; margin:0 0 16px;
  background:linear-gradient(90deg, transparent, var(--trim-hi) 8%, var(--gold) 50%, var(--trim-hi) 92%, transparent);
  background-size:200% 100%; animation:fd-shimmer 9s linear infinite; }
@keyframes fd-shimmer { from{background-position:0% 0} to{background-position:200% 0} }
@media (prefers-reduced-motion: reduce){ .fd-rule{animation:none} .fd-live-dot{animation:none} }

.fd-status { display:flex; align-items:center; gap:10px; }
.fd-chip { display:inline-flex; align-items:center; gap:7px; font-family:var(--mono); font-size:11px; letter-spacing:.12em;
  padding:5px 11px; border:1px solid var(--trim); border-radius:3px; background:var(--inset); white-space:nowrap; }
.fd-chip.live { color:var(--green); border-color:#3E5A34; }
.fd-chip.snap { color:var(--amber); border-color:#6E5426; }
.fd-chip.load { color:var(--mut); }
.fd-live-dot { width:7px; height:7px; border-radius:50%; background:currentColor; animation:fd-pulse 2s ease-in-out infinite; }
@keyframes fd-pulse { 0%,100%{opacity:1} 50%{opacity:.3} }
.fd-btn { font-family:var(--mono); font-size:11px; letter-spacing:.08em; color:var(--gold); background:var(--panel2);
  border:1px solid var(--trim-hi); border-radius:3px; padding:6px 12px; cursor:pointer; }
.fd-btn:hover { background:#332818; }
.fd-btn:disabled { opacity:.45; cursor:default; }
.fd-root button:focus-visible, .fd-root input:focus-visible, .fd-root a:focus-visible { outline:2px solid var(--gold); outline-offset:2px; }

/* banner */
.fd-warn { border:1px solid #6E5426; background:linear-gradient(180deg,#33270F,#2A2010); color:#F1D08A;
  border-radius:4px; padding:11px 14px; margin-bottom:16px; font-size:13px; display:flex; gap:10px; align-items:flex-start; }
.fd-warn b { color:var(--gold); }
.fd-warn .sig { font-family:var(--disp); font-size:15px; line-height:1; padding-top:1px; }

/* market read */
.fd-read { font-style:italic; color:#CFC0A2; border-left:3px solid var(--trim-hi); padding:2px 0 2px 12px; margin:0 0 18px; font-size:13.5px; }
.fd-read b { color:var(--gold); font-style:normal; }

/* panels */
.fd-panel { background:var(--panel); border:1px solid var(--trim); border-radius:5px; padding:14px; margin-bottom:16px; position:relative; }
.fd-panel::before { content:""; position:absolute; inset:2px; border:1px solid rgba(138,111,61,.25); border-radius:3px; pointer-events:none; }
.fd-lab { font-family:var(--disp); font-weight:600; font-size:11px; letter-spacing:.3em; text-transform:uppercase; color:var(--gold-dim); margin:0 0 10px; }

/* presets */
.fd-presets { display:flex; gap:8px; flex-wrap:wrap; margin-bottom:14px; }
.fd-preset { border:1px solid var(--trim); background:var(--inset); color:var(--parch); border-radius:3px;
  padding:7px 12px; font-size:12.5px; cursor:pointer; }
.fd-preset:hover { border-color:var(--trim-hi); }
.fd-preset.on { border-color:var(--gold); color:var(--gold); background:#2E2410; }
.fd-blurb { font-size:12.5px; color:var(--mut); margin:-4px 0 12px; min-height:1em; }

/* controls grid */
.fd-controls { display:grid; grid-template-columns:repeat(3,1fr); gap:16px 22px; }
@media (max-width:860px){ .fd-controls{grid-template-columns:1fr 1fr} }
@media (max-width:560px){ .fd-controls{grid-template-columns:1fr} }
.fd-ctl label { display:flex; justify-content:space-between; align-items:baseline; font-size:12px; color:var(--mut); margin-bottom:6px; letter-spacing:.04em; }
.fd-ctl label b { font-family:var(--mono); color:var(--gold); font-size:13px; font-weight:600; }
.fd-ends { display:flex; justify-content:space-between; font-size:10.5px; color:#7A6B54; margin-top:3px; font-family:var(--mono); }
input.fd-range { -webkit-appearance:none; appearance:none; width:100%; height:22px; background:transparent; cursor:pointer; margin:0; }
input.fd-range::-webkit-slider-runnable-track { height:5px; border-radius:3px; background:linear-gradient(90deg,var(--trim-hi),var(--trim)); border:1px solid #3A2E1B; }
input.fd-range::-webkit-slider-thumb { -webkit-appearance:none; width:17px; height:17px; border-radius:50%; margin-top:-7px;
  background:radial-gradient(circle at 35% 30%, #FFE29A, var(--gold) 55%, #9C7420); border:1px solid #5C451A; box-shadow:0 1px 3px rgba(0,0,0,.6); }
input.fd-range::-moz-range-track { height:5px; border-radius:3px; background:var(--trim); }
input.fd-range::-moz-range-thumb { width:16px; height:16px; border-radius:50%; background:var(--gold); border:1px solid #5C451A; }
.fd-togs { display:flex; gap:14px; flex-wrap:wrap; align-items:center; }
.fd-tog { display:inline-flex; align-items:center; gap:7px; font-size:12.5px; color:var(--parch); cursor:pointer; user-select:none; }
.fd-tog input { accent-color:#F0B437; width:15px; height:15px; }
.fd-search { background:var(--inset); border:1px solid var(--trim); color:var(--parch); border-radius:3px;
  padding:7px 10px; font-size:13px; width:100%; font-family:var(--mono); }
.fd-search::placeholder { color:#6E5F49; }

/* scoreboard */
.fd-score { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; margin-bottom:16px; }
@media (max-width:760px){ .fd-score{grid-template-columns:1fr} }
.fd-card { background:linear-gradient(180deg,var(--panel2),var(--panel)); border:1px solid var(--trim); border-radius:5px; padding:12px 14px; cursor:pointer; text-align:left; color:var(--parch); }
.fd-card:hover { border-color:var(--trim-hi); }
.fd-card .k { font-size:10.5px; letter-spacing:.22em; text-transform:uppercase; color:var(--mut); font-family:var(--disp); font-weight:600; }
.fd-card .n { font-size:15px; color:var(--gold); margin:5px 0 2px; font-weight:600; }
.fd-card .v { font-family:var(--mono); font-size:13px; color:var(--parch); }
.fd-card .v span { color:var(--mut); }

/* charts */
.fd-charts { display:grid; grid-template-columns:3fr 2fr; gap:16px; }
@media (max-width:860px){ .fd-charts{grid-template-columns:1fr} }
.fd-tip { background:#241C0F; border:1px solid var(--trim-hi); border-radius:4px; padding:9px 11px; font-size:12px; font-family:var(--mono); color:var(--parch); }
.fd-tip b { color:var(--gold); display:block; margin-bottom:3px; font-size:12.5px; }

/* table */
.fd-tablewrap { overflow:auto; max-height:520px; border:1px solid var(--trim); border-radius:4px; background:var(--inset); }
table.fd-t { border-collapse:collapse; width:100%; font-size:12.5px; min-width:720px; }
.fd-t thead th { position:sticky; top:0; background:#2E2412; color:var(--gold-dim); font-family:var(--disp); font-weight:600;
  font-size:10px; letter-spacing:.18em; text-transform:uppercase; text-align:right; padding:9px 10px; border-bottom:1px solid var(--trim-hi); cursor:pointer; white-space:nowrap; z-index:2; }
.fd-t thead th:first-child { text-align:left; }
.fd-t thead th.on { color:var(--gold); }
.fd-t tbody td { padding:7px 10px; text-align:right; font-family:var(--mono); border-bottom:1px solid #2A2113; white-space:nowrap; }
.fd-t tbody td:first-child { text-align:left; font-family:inherit; }
.fd-t tbody tr { cursor:pointer; }
.fd-t tbody tr:hover { background:#241C0E; }
.fd-t tbody tr.sel { background:#2E2410; box-shadow:inset 3px 0 0 var(--gold); }
.fd-t .up { color:var(--green); } .fd-t .dn { color:var(--red); } .fd-t .mut { color:var(--mut); }
.fd-badge { display:inline-block; font-size:10px; letter-spacing:.08em; padding:2px 7px; border-radius:2px; border:1px solid; font-family:var(--mono); }
.fd-mem { color:#C9A0E8; font-size:10px; margin-left:6px; border:1px solid #5A4470; border-radius:2px; padding:0 4px; }
.fd-f2p { color:#8FBCE0; font-size:10px; margin-left:6px; border:1px solid #3E5A70; border-radius:2px; padding:0 4px; }
.fd-taxfree { color:var(--green); font-size:10px; margin-left:6px; border:1px solid #3E5A34; border-radius:2px; padding:0 4px; }
@media (max-width:700px){ .hide-sm{display:none} table.fd-t{min-width:520px} }

/* offer slip */
.fd-slip { border:1px solid var(--trim-hi); border-radius:5px; background:linear-gradient(180deg,#2C2212,#241C0F); margin-top:14px; overflow:hidden; }
.fd-sliphead { background:linear-gradient(180deg,#3A2D15,#2E2410); padding:10px 14px; display:flex; justify-content:space-between; align-items:center; gap:10px; border-bottom:1px solid var(--trim-hi); flex-wrap:wrap; }
.fd-sliphead h3 { margin:0; font-family:var(--disp); font-size:17px; color:var(--gold); letter-spacing:.04em; }
.fd-slipbody { display:grid; grid-template-columns:1.1fr 1fr 1.2fr; gap:14px; padding:14px; }
@media (max-width:860px){ .fd-slipbody{grid-template-columns:1fr} }
.fd-box { background:var(--inset); border:1px solid var(--trim); border-radius:4px; padding:11px 12px; }
.fd-box h4 { margin:0 0 8px; font-size:10.5px; letter-spacing:.24em; text-transform:uppercase; color:var(--gold-dim); font-family:var(--disp); font-weight:600; }
.fd-kv { display:flex; justify-content:space-between; font-family:var(--mono); font-size:12.5px; padding:3px 0; gap:10px; }
.fd-kv span { color:var(--mut); font-family:'Segoe UI',system-ui,sans-serif; }
.fd-kv b { font-weight:600; color:var(--parch); }
.fd-kv b.g { color:var(--green); } .fd-kv b.r { color:var(--red); } .fd-kv b.au { color:var(--gold); }
.fd-riskbar { height:7px; background:#151006; border:1px solid #3A2E1B; border-radius:3px; overflow:hidden; margin:3px 0 8px; }
.fd-riskbar i { display:block; height:100%; }
.fd-note { font-size:11.5px; color:var(--mut); margin-top:8px; line-height:1.5; }
.fd-link { color:var(--gold); text-decoration:none; border-bottom:1px dotted var(--gold-dim); font-size:12px; }

/* ledger notes */
.fd-notes { columns:2; column-gap:28px; font-size:12.5px; color:#C4B594; }
@media (max-width:760px){ .fd-notes{columns:1} }
.fd-notes p { margin:0 0 10px; break-inside:avoid; }
.fd-notes b { color:var(--gold-dim); }
.fd-foot { text-align:center; color:#7A6B54; font-size:11px; margin-top:20px; font-family:var(--mono); letter-spacing:.06em; }
`;

/* ================= live fetch ================= */
async function fetchJson(url, signal) {
  const res = await fetch(url, { signal, headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error("HTTP " + res.status);
  return res.json();
}

async function pullLive(signal) {
  const [latest, h1, vols] = await Promise.all([
    fetchJson(`${API}/latest`, signal),
    fetchJson(`${API}/1h`, signal),
    fetchJson(`${API}/volumes`, signal),
  ]);
  let m5 = null;
  try { m5 = await fetchJson(`${API}/5m`, signal); } catch (e) { /* 1h pricing still works */ }
  const win = (d) => d && (d.avgHighPrice || d.avgLowPrice)
    ? { al: d.avgLowPrice ?? null, ah: d.avgHighPrice ?? null,
        lv: d.lowPriceVolume || 0, hv: d.highPriceVolume || 0 }
    : null;
  const out = {};
  for (const base of BASE_ITEMS) {
    const p = latest.data?.[base.id];
    const h = win(h1.data?.[base.id]);
    const f = win(m5?.data?.[base.id]);
    if (!p && !h) continue; // nothing traded recently on either feed — leave the board
    out[base.id] = {
      latest: { low: p?.low ?? null, high: p?.high ?? null,
                lowT: p?.lowTime ?? null, highT: p?.highTime ?? null },
      m5: f, h1: h,
      dv: vols.data?.[base.id] ?? base.dv,
      snapVol: undefined, snapStale: undefined, combinedHv: undefined,
    };
  }
  if (Object.keys(out).length < 20) throw new Error("thin response");
  return out;
}

/* ================= small pieces ================= */
const RiskBadge = ({ risk }) => {
  const b = riskBucket(risk);
  return (
    <span className="fd-badge" style={{ color: RISK_COLOR[b], borderColor: RISK_COLOR[b] + "66" }}>
      {b.toUpperCase()} {risk}
    </span>
  );
};

/* data confidence: A = fresh 5-min averages both sides; B = 1-hour averages;
   C = raw prints, stale, crossed, or missing drift — read, don't trade */
const TIER_COLOR = { A: "#83CE70", B: "#E0A43A", C: "#E26A5A" };
const TIER_TITLE = {
  A: "confidence A — priced from fresh 5-min averages, both sides trading",
  B: "confidence B — priced from 1-hour averages",
  C: "confidence C — thin, stale, or unverified data; treat as unconfirmed",
};
const TierChip = ({ tier }) => (
  <span className="fd-badge" title={TIER_TITLE[tier]}
    style={{ color: TIER_COLOR[tier], borderColor: TIER_COLOR[tier] + "66", marginLeft: 5 }}>
    {tier}
  </span>
);

const ScatterTip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="fd-tip">
      <b>{d.name}</b>
      buy {fmtGp(d.low)} → sell {fmtGp(d.high)}<br />
      net {fmtGp(d.margin)} · ROI {d.roi.toFixed(1)}%<br />
      24h vol {fmtQty(d.dv)} · risk {d.risk}
    </div>
  );
};

const BarTip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="fd-tip">
      <b>{d.name}</b>
      est. {fmtGp(d.gpHrLo)}–{fmtGp(d.gpHr)}/hr · {fmtQty(d.qty)} units per cycle<br />
      capital {fmtGp(d.capital)} · ~{d.cycleH < 1 ? Math.round(d.cycleH * 60) + " min" : d.cycleH.toFixed(1) + " h"} per cycle
    </div>
  );
};

/* ================= app ================= */
export default function FlipDesk() {
  const [status, setStatus] = useState("loading"); // loading | live | snapshot
  const [liveMap, setLiveMap] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [preset, setPreset] = useState("penny");
  const [ctl, setCtl] = useState({ ...PRESETS[0].c });
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState("gpHr");
  const [sortDir, setSortDir] = useState(-1);
  const [selId, setSelId] = useState(null);
  const [series, setSeries] = useState({}); // id -> {pts}|{err}
  const abortRef = useRef(null);

  const refresh = useCallback(async () => {
    setStatus("loading");
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const timer = setTimeout(() => ctrl.abort(), 9000);
    try {
      const map = await pullLive(ctrl.signal);
      setLiveMap(map);
      setUpdatedAt(new Date());
      setStatus("live");
    } catch (e) {
      setStatus("snapshot");
    } finally {
      clearTimeout(timer);
    }
  }, []);

  useEffect(() => { refresh(); return () => abortRef.current?.abort(); }, [refresh]);

  const setC = (patch) => { setCtl((c) => ({ ...c, ...patch })); setPreset(null); };
  const applyPreset = (p) => {
    setCtl({ ...p.c });
    setPreset(p.key);
    setSortKey(p.key === "limits" ? "perCycle" : "gpHr");
    setSortDir(-1);
  };

  /* merge snapshot + live, run the model */
  const assessed = useMemo(() => {
    const now = Math.floor(Date.now() / 1000);
    return BASE_ITEMS.map((b) => {
      const l = liveMap?.[b.id];
      const a = assess(l ? { ...b, ...l } : b, now);
      // live board must not silently fall back to days-old snapshot rows
      if (liveMap && !l) return { ...a, hidden: a.hidden || "no recent trades", tier: "C" };
      return a;
    });
  }, [liveMap]);

  const played = useMemo(
    () => assessed.map((a) => playOut(a, ctl.budget, ctl.play)),
    [assessed, ctl.budget, ctl.play]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return played.filter((p) =>
      !p.hidden &&
      p.qty > 0 &&
      p.roi >= ctl.minRoi &&
      p.risk <= ctl.riskTol &&
      (!ctl.taxFree || p.high < 50) &&
      (!ctl.f2p || !p.members) &&
      (!q || p.name.toLowerCase().includes(q))
    );
  }, [played, ctl, search]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      const va = sortKey === "name" ? a.name : a[sortKey];
      const vb = sortKey === "name" ? b.name : b[sortKey];
      return (va < vb ? -1 : va > vb ? 1 : 0) * sortDir;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const best = useMemo(() => {
    if (!filtered.length) return null;
    const byHr = [...filtered].sort((a, b) => b.gpHr - a.gpHr);
    const byRoi = [...filtered].sort((a, b) => b.roi - a.roi);
    const safe = [...filtered].filter((x) => x.gpHr > 0).sort((a, b) => a.risk - b.risk || b.gpHr - a.gpHr);
    return { hr: byHr[0], roi: byRoi[0], safe: safe[0] || byHr[0] };
  }, [filtered]);

  const read = useMemo(() => {
    const n = filtered.length;
    if (!n) return null;
    const penny = filtered.filter((x) => x.high < 50);
    const pennyFlow = penny.reduce((s, x) => s + x.dv, 0);
    const veiled = played.filter((x) => x.hidden).length;
    return { n, total: played.length, penny: penny.length, pennyFlow, veiled, top: best?.hr };
  }, [filtered, played, best]);

  const sel = useMemo(() => played.find((p) => p.id === selId) || null, [played, selId]);

  /* sparkline for the selected item (live only) */
  useEffect(() => {
    if (!sel || series[sel.id]) return;
    let dead = false;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    fetchJson(`${API}/timeseries?timestep=5m&id=${sel.id}`, ctrl.signal)
      .then((j) => {
        if (dead) return;
        const pts = (j.data || []).slice(-72).map((d) => ({
          t: d.timestamp, hi: d.avgHighPrice, lo: d.avgLowPrice,
        })).filter((d) => d.hi || d.lo);
        setSeries((s) => ({ ...s, [sel.id]: pts.length ? { pts } : { err: true } }));
      })
      .catch(() => { if (!dead) setSeries((s) => ({ ...s, [sel.id]: { err: true } })); })
      .finally(() => clearTimeout(t));
    return () => { dead = true; ctrl.abort(); };
  }, [sel, series]);

  const clickSort = (k) => {
    if (sortKey === k) setSortDir((d) => -d);
    else { setSortKey(k); setSortDir(-1); }
  };

  const budgetSlider = Math.log10(ctl.budget);
  const playLabel = ctl.play < 0.25 ? "patient — 4h limit cycles"
    : ctl.play < 0.6 ? "mixed — check in hourly"
    : ctl.play < 0.85 ? "active — reprice often"
    : "scalping — 5-min churn";
  const riskLabel = ctl.riskTol < 40 ? "careful" : ctl.riskTol < 70 ? "balanced" : "degen";
  const activePreset = PRESETS.find((p) => p.key === preset);

  const scatterData = filtered.map((f) => ({ ...f, dvLog: Math.max(f.dv, 1), roiCap: Math.min(f.roi, 80) }));
  const topBars = [...filtered].sort((a, b) => b.gpHr - a.gpHr).slice(0, 8)
    .map((x) => ({ ...x, shortName: x.name.length > 18 ? x.name.slice(0, 17) + "…" : x.name }));

  const snapAge = Math.round((Date.now() / 1000 - SNAPSHOT.ts) / 3600);

  return (
    <div className="fd-root">
      <style>{CSS}</style>
      <div className="fd-wrap">

        {/* masthead */}
        <header className="fd-mast">
          <div>
            <h1 className="fd-title">The Flip Desk</h1>
            <p className="fd-sub">Grand Exchange · Market Ledger</p>
          </div>
          <div className="fd-status">
            {status === "live" && (
              <span className="fd-chip live"><i className="fd-live-dot" />LIVE FEED · {updatedAt?.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
            )}
            {status === "snapshot" && <span className="fd-chip snap">◈ SNAPSHOT · {SNAP_DATE.toLocaleDateString([], { day: "numeric", month: "short" })}</span>}
            {status === "loading" && <span className="fd-chip load">… polling exchange</span>}
            <button className="fd-btn" onClick={refresh} disabled={status === "loading"}>↻ Refresh</button>
          </div>
        </header>
        <hr className="fd-rule" />

        {/* offline warning */}
        {status === "snapshot" && (
          <div className="fd-warn" role="alert">
            <span className="sig">⚠</span>
            <span>
              <b>Live feed unreachable.</b> Showing the baked snapshot from{" "}
              {SNAP_DATE.toLocaleString([], { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
              {snapAge > 1 ? ` (~${snapAge}h old)` : ""}. Margins drift by the minute — treat these numbers as a
              teaching tape, not an order book, and hit Refresh when you're back online.
              {SNAPSHOT.version !== 2 && <> This snapshot predates verified-average pricing, so every row is priced
              from raw last prints and capped at confidence <b>C</b>.</>}
            </span>
          </div>
        )}

        {/* market read */}
        {read && (
          <p className="fd-read">
            {read.n} of {read.total} tracked items pass your desk rules.
            {read.veiled > 0 && <> {read.veiled} more are hidden — one-sided books, dislocated prints, or no verifiable data.</>}
            {read.top && <> Best tape right now: <b>{read.top.name}</b> at <b>{fmtGp(read.top.gpHrLo)}–{fmtGp(read.top.gpHr)}/hr</b> on your settings.</>}
            {read.penny > 0 && <> {read.penny} tax-exempt penny items are moving ~{fmtQty(read.pennyFlow)} units a day between them.</>}
          </p>
        )}

        {/* controls */}
        <section className="fd-panel">
          <h2 className="fd-lab">Desk Rules</h2>
          <div className="fd-presets">
            {PRESETS.map((p) => (
              <button key={p.key} className={"fd-preset" + (preset === p.key ? " on" : "")} onClick={() => applyPreset(p)}>
                {p.label}
              </button>
            ))}
          </div>
          <p className="fd-blurb">{activePreset ? activePreset.blurb : "Custom rules — tune the sliders to your own read of the market."}</p>

          <div className="fd-controls">
            <div className="fd-ctl">
              <label>Bankroll <b>{fmtGp(ctl.budget)} gp</b></label>
              <input className="fd-range" type="range" min={4} max={9.3} step={0.02}
                value={budgetSlider}
                onChange={(e) => setC({ budget: Math.round(Math.pow(10, +e.target.value)) })}
                aria-label="Bankroll" />
              <div className="fd-ends"><span>10k</span><span>2b</span></div>
            </div>
            <div className="fd-ctl">
              <label>Playstyle <b>{playLabel}</b></label>
              <input className="fd-range" type="range" min={0} max={1} step={0.01}
                value={ctl.play} onChange={(e) => setC({ play: +e.target.value })} aria-label="Playstyle" />
              <div className="fd-ends"><span>patient limits</span><span>5-min scalper</span></div>
            </div>
            <div className="fd-ctl">
              <label>Risk appetite <b>{riskLabel} ≤ {ctl.riskTol}</b></label>
              <input className="fd-range" type="range" min={15} max={100} step={1}
                value={ctl.riskTol} onChange={(e) => setC({ riskTol: +e.target.value })} aria-label="Risk appetite" />
              <div className="fd-ends"><span>careful</span><span>degen</span></div>
            </div>
            <div className="fd-ctl">
              <label>Min ROI after tax <b>{ctl.minRoi}%</b></label>
              <input className="fd-range" type="range" min={0} max={30} step={0.2}
                value={ctl.minRoi} onChange={(e) => setC({ minRoi: +e.target.value })} aria-label="Minimum ROI" />
              <div className="fd-ends"><span>any profit</span><span>30%+</span></div>
            </div>
            <div className="fd-ctl">
              <label style={{ marginBottom: 9 }}>Filters</label>
              <div className="fd-togs">
                <label className="fd-tog"><input type="checkbox" checked={ctl.taxFree} onChange={(e) => setC({ taxFree: e.target.checked })} />tax-free only (&lt;50 gp)</label>
                <label className="fd-tog"><input type="checkbox" checked={ctl.f2p} onChange={(e) => setC({ f2p: e.target.checked })} />F2P items only</label>
              </div>
            </div>
            <div className="fd-ctl">
              <label>Find an item</label>
              <input className="fd-search" placeholder="e.g. iron arrow, rune, whip…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
        </section>

        {/* scoreboard */}
        {best && (
          <div className="fd-score">
            <button className="fd-card" onClick={() => setSelId(best.hr.id)}>
              <div className="k">Top earner · est. gp/hr</div>
              <div className="n">{best.hr.name}<TierChip tier={best.hr.tier} /></div>
              <div className="v">{fmtGp(best.hr.gpHrLo)}–{fmtGp(best.hr.gpHr)}/hr <span>· {fmtQty(best.hr.qty)} @ {fmtGp(best.hr.low)}</span></div>
              <div className="v" style={{ marginTop: 3 }}><span>popular pick — expect the margin to compress</span></div>
            </button>
            <button className="fd-card" onClick={() => setSelId(best.roi.id)}>
              <div className="k">Fattest ROI after tax</div>
              <div className="n">{best.roi.name}<TierChip tier={best.roi.tier} /></div>
              <div className="v">{best.roi.roi.toFixed(1)}% <span>· {fmtGp(best.roi.margin)} on {fmtGp(best.roi.low)}</span></div>
            </button>
            <button className="fd-card" onClick={() => setSelId(best.safe.id)}>
              <div className="k">Safest steady line</div>
              <div className="v" style={{ marginTop: 5 }}><RiskBadge risk={best.safe.risk} /><TierChip tier={best.safe.tier} /></div>
              <div className="n">{best.safe.name}</div>
              <div className="v">{fmtGp(best.safe.gpHrLo)}–{fmtGp(best.safe.gpHr)}/hr <span>· {fmtQty(best.safe.dv)} traded/day</span></div>
            </button>
          </div>
        )}

        {/* charts */}
        <div className="fd-charts">
          <section className="fd-panel">
            <h2 className="fd-lab">ROI vs. Liquidity — every dot is a trade you could run</h2>
            <div style={{ width: "100%", height: 300 }}>
              <ResponsiveContainer>
                <ScatterChart margin={{ top: 8, right: 12, bottom: 4, left: -8 }}>
                  <CartesianGrid stroke="#33291A" strokeDasharray="2 4" />
                  <XAxis dataKey="dvLog" type="number" scale="log" domain={["auto", "auto"]}
                    tickFormatter={fmtQty} stroke="#7A6B54" fontSize={10} fontFamily="monospace"
                    label={{ value: "24h volume (log)", position: "insideBottom", offset: -2, fill: "#7A6B54", fontSize: 10 }} />
                  <YAxis dataKey="roiCap" type="number" stroke="#7A6B54" fontSize={10} fontFamily="monospace"
                    tickFormatter={(v) => v + "%"} width={44} />
                  <ZAxis dataKey="gpHr" range={[30, 340]} />
                  <RTooltip content={<ScatterTip />} cursor={{ strokeDasharray: "3 3", stroke: "#8A6F3D" }} />
                  <Scatter data={scatterData} onClick={(d) => { const id = d?.payload?.id ?? d?.id; if (id) setSelId(id); }}>
                    {scatterData.map((d) => (
                      <Cell key={d.id} fill={RISK_COLOR[riskBucket(d.risk)]}
                        fillOpacity={d.id === selId ? 1 : 0.55}
                        stroke={d.id === selId ? "#F0B437" : "none"} strokeWidth={2} />
                    ))}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            </div>
            <p className="fd-note">Up and to the right is the dream; up and to the left is a trap — fat ROI on a book nobody trades. Dot size is estimated gp/hr, colour is risk.</p>
          </section>

          <section className="fd-panel">
            <h2 className="fd-lab">Top lines on your rules</h2>
            <div style={{ width: "100%", height: 300 }}>
              <ResponsiveContainer>
                <BarChart data={topBars} layout="vertical" margin={{ top: 4, right: 14, bottom: 0, left: 8 }}>
                  <CartesianGrid stroke="#33291A" strokeDasharray="2 4" horizontal={false} />
                  <XAxis type="number" tickFormatter={fmtGp} stroke="#7A6B54" fontSize={10} fontFamily="monospace" />
                  <YAxis type="category" dataKey="shortName" width={120} stroke="#A5937A" fontSize={10.5} />
                  <RTooltip content={<BarTip />} cursor={{ fill: "#2A2113" }} />
                  <Bar dataKey="gpHr" onClick={(d) => { const id = d?.payload?.id ?? d?.id; if (id) setSelId(id); }} radius={[0, 2, 2, 0]}>
                    {topBars.map((d) => (
                      <Cell key={d.id} fill={d.id === selId ? "#F0B437" : "#C69A45"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="fd-note">Estimated gp/hr, capped by the 4-hour buy limit — churning faster than the limit allows earns nothing extra.</p>
          </section>
        </div>

        {/* table */}
        <section className="fd-panel">
          <h2 className="fd-lab">The Board — {sorted.length} trades pass · tap a row for the offer slip</h2>
          <div className="fd-tablewrap">
            <table className="fd-t">
              <thead>
                <tr>
                  <th className={sortKey === "name" ? "on" : ""} onClick={() => clickSort("name")}>Item</th>
                  <th className={sortKey === "low" ? "on" : ""} onClick={() => clickSort("low")}>Buy</th>
                  <th className="hide-sm">Sell</th>
                  <th className="hide-sm">Tax</th>
                  <th className={sortKey === "margin" ? "on" : ""} onClick={() => clickSort("margin")}>Net</th>
                  <th className={sortKey === "roi" ? "on" : ""} onClick={() => clickSort("roi")}>ROI</th>
                  <th className="hide-sm">Limit</th>
                  <th className={(sortKey === "dv" ? "on " : "") + "hide-sm"} onClick={() => clickSort("dv")}>24h vol</th>
                  <th className={sortKey === "risk" ? "on" : ""} onClick={() => clickSort("risk")}>Risk</th>
                  <th className={sortKey === "perCycle" ? "on" : ""} onClick={() => clickSort("perCycle")}>Gp/cycle</th>
                  <th className={sortKey === "gpHr" ? "on" : ""} onClick={() => clickSort("gpHr")}>Est/hr</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((p) => (
                  <tr key={p.id} className={p.id === selId ? "sel" : ""} onClick={() => setSelId(p.id === selId ? null : p.id)}>
                    <td>
                      {p.name}
                      {p.high < 50 && <span className="fd-taxfree">0% tax</span>}
                      {p.members ? <span className="fd-mem">P2P</span> : <span className="fd-f2p">F2P</span>}
                    </td>
                    <td>{fmtGp(p.low)}</td>
                    <td className="hide-sm">{fmtGp(p.high)}</td>
                    <td className="hide-sm mut">{p.tax ? fmtGp(p.tax) : "—"}</td>
                    <td className={p.margin > 0 ? "up" : "dn"}>{fmtGp(p.margin)}</td>
                    <td className={p.roi > 0 ? "up" : "dn"}>{p.roi.toFixed(1)}%</td>
                    <td className="hide-sm mut">{fmtQty(p.limit)}</td>
                    <td className="hide-sm mut">{fmtQty(p.dv)}</td>
                    <td><RiskBadge risk={p.risk} /><TierChip tier={p.tier} /></td>
                    <td>{fmtGp(p.perCycle)}</td>
                    <td style={{ color: "#F0B437" }}>{fmtGp(p.gpHrLo)}–{fmtGp(p.gpHr)}</td>
                  </tr>
                ))}
                {!sorted.length && (
                  <tr><td colSpan={11} style={{ textAlign: "center", padding: 24, color: "#A5937A" }}>
                    Nothing passes these rules. Loosen the risk cap or minimum ROI, raise the bankroll, or clear the tax-free filter.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* offer slip */}
        {sel && <OfferSlip sel={sel} status={status} data={series[sel.id]} onClose={() => setSelId(null)} />}

        {/* ledger notes */}
        <section className="fd-panel">
          <h2 className="fd-lab">Ledger Notes — how this desk thinks</h2>
          <div className="fd-notes">
            <p><b>The tax.</b> The Exchange takes 2% of the sale price of every item, rounded down, capped at 5m per item. Anything that sells under 50 gp is exempt — which is why a 1 gp margin on iron arrows or iron nails is a clean 25–33% ROI while a 1% margin on a whip is roughly break-even after tax.</p>
            <p><b>Buy limits.</b> Every item caps how many you can buy per rolling 4 hours. Limits are the real ceiling on gp/hr: a 7,000-limit penny item can out-earn a big-ticket flip you can only buy 8 of. The est/hr column is always capped by limit ÷ 4h.</p>
            <p><b>Pricing &amp; confidence.</b> Buy and sell targets come from volume-weighted averages — the 5-minute window when both sides are trading, else the 1-hour window — never from the two most recent raw trades. Those two prints are asynchronous; one bot dump or one impatient buyer can fake a spread nobody will ever fill. Rows are tagged <b>A</b> (fresh 5-min averages), <b>B</b> (1-hour averages), or <b>C</b> (thin, stale, or unverified data). Items with a one-sided book, crossed prints, or a wide spread on a busy book (a dislocation, not a gift) are hidden from the board entirely.</p>
            <p><b>Risk score.</b> Blended from three observable pressures: how thin the <i>one-sided</i> hourly flow is (your bid only fills from insta-sellers, your ask only from insta-buyers), how fast the 5-minute price is moving versus the spread it must cross, and how stale the last trade is. Missing data raises the score — a silent book is the risky case, not the calm one. Low ≤ 30, high ≥ 60. It measures fill-and-drift risk, not manipulation.</p>
            <p><b>Playstyle.</b> Patient mode assumes ~4-hour round trips gated by buy limits — set offers, log off, collect. Scalper mode assumes ~15-minute round trips and only makes sense on books deep enough to fill you fast; that's the "actionable for 5 minutes" end of the dial.</p>
            <p><b>Two worked personas.</b> The <i>penny bulk</i> preset is the &lt;50 gp, tax-exempt, high-ROI grind — iron arrows, nails, feathers, essence. The <i>5-minute scalps</i> preset hunts deep-volume items where the spread refills constantly and your money is never parked.</p>
            <p><b>What the numbers aren't.</b> Averaged targets are still not guaranteed fills, and every reader of a public price feed is competing for the same edge — that's why gp/hr is shown as a range assuming ~10% capture of the thin side's flow, and why the top pick carries a compression warning. This is a lens for reading the market, not an order robot.</p>
          </div>
          <p className="fd-foot">
            prices &amp; volumes · OSRS Wiki real-time prices API (RuneLite) · snapshot baked {SNAP_DATE.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" })} · not affiliated with Jagex
          </p>
        </section>
      </div>
    </div>
  );
}

/* ================= offer slip ================= */
function OfferSlip({ sel, status, data, onClose }) {
  const taxLine = sel.tax === 0 && TAX_EXEMPT.has(sel.id)
    ? "exempt item — the Exchange takes nothing"
    : sel.high < 50
    ? "exempt — sells under 50 gp"
    : `2% of ${Math.round(sel.high).toLocaleString()} = ${sel.tax.toLocaleString()} gp, rounded down`;
  const cycleStr = sel.cycleH < 1 ? Math.round(sel.cycleH * 60) + " min" : sel.cycleH.toFixed(1) + " h";
  const srcLine = sel.source === "5m" ? "5-minute volume-weighted averages"
    : sel.source === "1h" ? "1-hour volume-weighted averages"
    : "raw last prints — unverified";
  const fillLine = sel.qty > 0 && sel.source !== "prints"
    ? ` Est. fill at your size: ~${sel.buyH < 1 ? Math.round(sel.buyH * 60) + "m" : sel.buyH.toFixed(1) + "h"} buy + ${sel.sellH < 1 ? Math.round(sel.sellH * 60) + "m" : sel.sellH.toFixed(1) + "h"} sell.`
    : "";
  const bars = [
    { k: "Fill risk", v: sel.fillR, note: fmtQty(sel.legFlow) + "/hr on the thin side" },
    { k: "Drift risk", v: sel.driftR, note: sel.vol == null ? "no drift data — scored cautious" : sel.vol.toFixed(1) + "% 5m-vs-1h drift" },
    { k: "Staleness", v: sel.staleR, note: "last trade " + agoStr(sel.stale) + (status === "snapshot" ? " at snapshot" : "") },
  ];
  return (
    <section className="fd-slip">
      <div className="fd-sliphead">
        <h3>{sel.name}</h3>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <RiskBadge risk={sel.risk} /><TierChip tier={sel.tier} />
          <a className="fd-link" href={`https://prices.runescape.wiki/osrs/item/${sel.id}`} target="_blank" rel="noreferrer">wiki page ↗</a>
          <button className="fd-btn" onClick={onClose}>✕ close</button>
        </div>
      </div>
      <div className="fd-slipbody">
        <div className="fd-box">
          <h4>The Flip</h4>
          <div className="fd-kv"><span>Buy target (avg insta-sell)</span><b>{fmtFull(sel.low)}</b></div>
          <div className="fd-kv"><span>Sell target (avg insta-buy)</span><b>{fmtFull(sel.high)}</b></div>
          <div className="fd-kv"><span>GE tax</span><b className={sel.tax ? "r" : "g"}>{sel.tax ? "-" + fmtFull(sel.tax) : "0 gp"}</b></div>
          <div className="fd-kv" style={{ borderTop: "1px solid #3A2E1B", marginTop: 4, paddingTop: 7 }}>
            <span>Net per unit</span><b className={sel.margin > 0 ? "g" : "r"}>{fmtFull(sel.margin)} · {sel.roi.toFixed(1)}%</b>
          </div>
          <p className="fd-note">Priced from {srcLine}. Last prints {fmtGp(sel.latest?.low)} / {fmtGp(sel.latest?.high)}.
            {" "}{taxLine}. Buy limit {sel.limit.toLocaleString()} / 4h · {fmtQty(sel.dv)} traded in 24h.</p>
        </div>
        <div className="fd-box">
          <h4>Your Play</h4>
          <div className="fd-kv"><span>Quantity</span><b className="au">{sel.qty.toLocaleString()}</b></div>
          <div className="fd-kv"><span>Capital out</span><b>{fmtGp(sel.capital)} gp</b></div>
          <div className="fd-kv"><span>Profit / cycle</span><b className={sel.perCycle > 0 ? "g" : "r"}>{fmtGp(sel.perCycle)} gp</b></div>
          <div className="fd-kv"><span>Cycle time</span><b>~{cycleStr}</b></div>
          <div className="fd-kv"><span>Est. rate</span><b className="au">{fmtGp(sel.gpHrLo)}–{fmtGp(sel.gpHr)}/hr</b></div>
          <p className="fd-note">
            {sel.qty === sel.limit ? "Buy-limit bound — your bankroll could take more, the Exchange won't sell it to you. Consider a second line."
              : sel.qty === sel.afford ? "Bankroll bound — every coin is working. A bigger stack would buy up to the " + sel.limit.toLocaleString() + " limit."
              : "Flow bound — the thin side of the book won't fill more than this per cycle at your pace."}
            {fillLine}
          </p>
        </div>
        <div className="fd-box">
          <h4>Risk Read &amp; Tape</h4>
          {bars.map((b) => (
            <div key={b.k}>
              <div className="fd-kv" style={{ padding: "1px 0" }}><span>{b.k}</span><b style={{ fontSize: 11.5, color: "#A5937A" }}>{b.note}</b></div>
              <div className="fd-riskbar"><i style={{ width: clamp(b.v, 2, 100) + "%", background: RISK_COLOR[riskBucket(b.v)] }} /></div>
            </div>
          ))}
          {data?.pts?.length > 1 ? (
            <div style={{ width: "100%", height: 90, marginTop: 4 }}>
              <ResponsiveContainer>
                <LineChart data={data.pts} margin={{ top: 4, right: 2, bottom: 0, left: 2 }}>
                  <YAxis domain={["auto", "auto"]} hide />
                  <XAxis dataKey="t" hide />
                  <RTooltip content={({ active, payload }) => active && payload?.length ? (
                    <div className="fd-tip">{payload.map((p) => (
                      <div key={p.dataKey}>{p.dataKey === "hi" ? "sell" : "buy"} {fmtGp(p.value)}</div>
                    ))}</div>
                  ) : null} />
                  <Line type="monotone" dataKey="hi" stroke="#F0B437" dot={false} strokeWidth={1.5} connectNulls />
                  <Line type="monotone" dataKey="lo" stroke="#83CE70" dot={false} strokeWidth={1.5} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="fd-note" style={{ marginTop: 6 }}>
              {data?.err || status === "snapshot"
                ? "Price history needs the live feed — offline right now."
                : "Pulling 6-hour tape…"}
            </p>
          )}
          {data?.pts?.length > 1 && <p className="fd-note" style={{ marginTop: 2 }}>Last ~6h · gold = sell side, green = buy side.</p>}
        </div>
      </div>
    </section>
  );
}
