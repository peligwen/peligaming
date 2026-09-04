// Dev tool: sanity-checks tools-src/runescape/day-model.js against a real
// item's price history.
//
//   node scripts/day-model-check.mjs            # Abyssal whip (4151), qty 70
//   node scripts/day-model-check.mjs 314 3000    # Feather (314), qty 3000
//   OSRS_API=https://prices.runescape.wiki/api/v1/osrs node scripts/day-model-check.mjs
//
// Two requests total: one hourly /timeseries call (the actual model input —
// we build the whole 7-day "week" by aggregating it ourselves, so we don't
// need eight /24h calls per item), and ONE /24h call for the item's most
// recent complete day, printed side-by-side with our aggregate as a sanity
// check that the two ways of slicing the same trades roughly agree.

import { DAY, completeDays, weekStats, dayFills, cycleOrders, hourProfile, holdout } from '../tools-src/runescape/day-model.js';

const API = process.env.OSRS_API || 'https://prices.runescape.wiki/api/v1/osrs';
const UA = 'flip-desk day-model check (gaming.peliglot.com; a few one-off requests)';
const id = Number(process.argv[2] || 4151);
const qty = Number(process.argv[3] || 70);
const CAPTURE = 0.5;

// A couple of friendly names for the tools this is likely to be pointed at —
// purely cosmetic, no /mapping call spent on it.
const NAMES = { 4151: 'Abyssal whip', 314: 'Feather', 554: 'Fire rune' };
const name = NAMES[id] || `item ${id}`;

// Mirrors the live board's GE tax rule (flip-desk.jsx's geTax) without
// importing that file: 2% of the sale price, floored, capped at 5m/item,
// exempt under 50gp and for Old School Bonds (13190).
const TAX_EXEMPT_IDS = new Set([13190]);
const taxOf = (sell) => (sell < 50 || TAX_EXEMPT_IDS.has(id) ? 0 : Math.min(Math.floor(sell * 0.02), 5_000_000));

async function get(path) {
  const res = await fetch(API + path, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

const fmt = (n) => (n == null ? '–' : Math.round(n).toLocaleString());
const fmtPct = (n) => (n == null ? '–' : `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`);
const hourLabel = (h) => (h == null ? '–' : `${String(h).padStart(2, '0')}:00 UTC`);
const dayLabel = (t) => new Date(t * 1000).toISOString().slice(0, 10);

console.log(`\n=== ${name} (id ${id}), qty=${qty}, capture=${CAPTURE} ===`);
console.log(`API: ${API}`);

// ---------------------------------------------------------------------------
// 1 request: hourly timeseries — the actual model input
// ---------------------------------------------------------------------------
const ts = await get(`/timeseries?timestep=1h&id=${id}`);
const hourly = Array.isArray(ts?.data) ? ts.data : [];
console.log(`\ntimeseries: ${hourly.length} hourly points`);

const now = Math.floor(Date.now() / 1000);
const allDays = completeDays(hourly, now);
console.log(`completeDays: ${allDays.length} complete UTC days (${allDays.length ? dayLabel(allDays[0].day) + ' .. ' + dayLabel(allDays[allDays.length - 1].day) : 'none'})`);

const days = allDays.slice(-7); // the model's usual "last 7 complete days" window

// Aggregate each day's hours into the [lo, hi, vLo, vHi]-or-null row shape
// weekStats/the /24h endpoint both use: volume-weighted mean per side.
function aggregateDay({ hours }) {
  if (!hours.length) return null;
  let pvLo = 0, vLo = 0, pvHi = 0, vHi = 0;
  for (const h of hours) {
    const lv = h.lowPriceVolume || 0, hv = h.highPriceVolume || 0;
    if (h.avgLowPrice != null && lv > 0) { pvLo += h.avgLowPrice * lv; vLo += lv; }
    if (h.avgHighPrice != null && hv > 0) { pvHi += h.avgHighPrice * hv; vHi += hv; }
  }
  const lo = vLo > 0 ? pvLo / vLo : null;
  const hi = vHi > 0 ? pvHi / vHi : null;
  if (lo == null && hi == null && vLo === 0 && vHi === 0) return null;
  return [lo, hi, vLo, vHi];
}
const week = days.map(aggregateDay);

// ---------------------------------------------------------------------------
// 1 request: /24h for the most recent complete day, as a sanity check that
// our timeseries aggregate roughly matches the wiki's own daily figure.
// ---------------------------------------------------------------------------
if (days.length) {
  const lastDay = days[days.length - 1].day;
  const daily = await get(`/24h?timestamp=${lastDay}`);
  const wiki = daily?.data?.[id];
  const ours = week[week.length - 1];
  console.log(`\n--- sanity check: our aggregate vs wiki /24h for ${dayLabel(lastDay)} ---`);
  console.log('             lo         hi         vLo        vHi');
  console.log(`ours:   ${fmt(ours?.[0]).padStart(10)} ${fmt(ours?.[1]).padStart(10)} ${fmt(ours?.[2]).padStart(10)} ${fmt(ours?.[3]).padStart(10)}`);
  console.log(`wiki:   ${fmt(wiki?.avgLowPrice).padStart(10)} ${fmt(wiki?.avgHighPrice).padStart(10)} ${fmt(wiki?.lowPriceVolume).padStart(10)} ${fmt(wiki?.highPriceVolume).padStart(10)}`);
} else {
  console.log('\n(no complete days — skipping /24h sanity check)');
}

// ---------------------------------------------------------------------------
// weekStats
// ---------------------------------------------------------------------------
const ws = weekStats(week, taxOf);
console.log('\n--- weekStats ---');
console.log(`n=${ws.n} n2=${ws.n2} dv=${fmt(ws.dv)}/day (vLo=${fmt(ws.vLo)} vHi=${fmt(ws.vHi)})`);
console.log(`rate=${fmt(ws.rate)} rateLo=${fmt(ws.rateLo)} rateHi=${fmt(ws.rateHi)} trend=${fmtPct(ws.trend)}`);
console.log(`range=[${fmt(ws.rangeLo)}, ${fmt(ws.rangeHi)}]`);
console.log(`dayMargin=${fmt(ws.dayMargin)} dayRoi=${fmtPct(ws.dayRoi)}`);
console.log(`mids: ${ws.mids.map(fmt).join(', ')}`);

// ---------------------------------------------------------------------------
// dayFills + cycleOrders for k=7,6,5
// ---------------------------------------------------------------------------
const fills = dayFills(days, qty, CAPTURE);
console.log(`\n--- dayFills (qty=${qty}, capture=${CAPTURE}) ---`);
for (const f of fills) {
  console.log(`${dayLabel(f.day)}: buy=${fmt(f.buy)} sell=${fmt(f.sell)} vLo=${fmt(f.vLo)} vHi=${fmt(f.vHi)}`);
}

console.log('\n--- cycleOrders ---');
const orders = {};
for (const k of [7, 6, 5]) {
  const o = cycleOrders(fills, k, taxOf);
  orders[k] = o;
  console.log(`k=${k}: buy=${fmt(o.buy)} sell=${fmt(o.sell)} tax=${fmt(o.tax)} margin=${fmt(o.margin)} roi=${fmtPct(o.roi)} buyAble=${o.buyAble} sellAble=${o.sellAble} buyDays=[${o.buyDays.map((b) => b ? '1' : '0').join('')}] sellDays=[${o.sellDays.map((b) => b ? '1' : '0').join('')}]`);
}

// hand sanity checks the report asked for
function assertLe(a, b, msg) { if (a != null && b != null && !(a <= b)) console.log(`  !! FAILED: ${msg} (${a} <= ${b})`); }
function assertGe(a, b, msg) { if (a != null && b != null && !(a >= b)) console.log(`  !! FAILED: ${msg} (${a} >= ${b})`); }
// Requiring MORE days (k=7) to all clear the bar takes a HIGHER buy and a
// LOWER sell than requiring fewer (k=5) — the order has to be gentle enough
// to have filled on the worst of those days too.
console.log('\n--- monotonicity checks ---');
assertGe(orders[7].buy, orders[6].buy, 'buy k7 >= k6');
assertGe(orders[6].buy, orders[5].buy, 'buy k6 >= k5');
assertLe(orders[7].sell, orders[6].sell, 'sell k7 <= k6');
assertLe(orders[6].sell, orders[5].sell, 'sell k6 <= k5');
assertLe(orders[7].margin, orders[6].margin, 'margin k7 <= k6');
assertLe(orders[6].margin, orders[5].margin, 'margin k6 <= k5');
for (const k of [7, 6, 5]) {
  const o = orders[k];
  const buyCount = o.buyDays.filter(Boolean).length;
  const sellCount = o.sellDays.filter(Boolean).length;
  if (o.buy != null && buyCount < k) console.log(`  !! FAILED: k=${k} buyDays count ${buyCount} < k`);
  if (o.sell != null && sellCount < k) console.log(`  !! FAILED: k=${k} sellDays count ${sellCount} < k`);
}
console.log('(no lines above "monotonicity checks" -> all good)');

// ---------------------------------------------------------------------------
// hourProfile
// ---------------------------------------------------------------------------
const hp = hourProfile(days);
console.log('\n--- hourProfile ---');
console.log(`trough hour (cheapest buy-side, 3h smoothed): ${hourLabel(hp.troughH)}`);
console.log(`peak hour (dearest sell-side, 3h smoothed): ${hourLabel(hp.peakH)}`);
console.log('hour  lo         hi         vLo        vHi');
for (const h of hp.hours) {
  console.log(`${String(h.h).padStart(2, '0')}    ${fmt(h.lo).padStart(9)}  ${fmt(h.hi).padStart(9)}  ${fmt(h.vLo).padStart(9)}  ${fmt(h.vHi).padStart(9)}`);
}

// ---------------------------------------------------------------------------
// holdout
// ---------------------------------------------------------------------------
const ho = holdout(allDays, qty, CAPTURE, 7, taxOf);
console.log('\n--- holdout (fit on days -14..-7, test on last 7) ---');
if (!ho) {
  console.log('null — fewer than 4 days in the older window');
} else {
  console.log(`n=${ho.n} buyHits=${ho.buyHits}/${ho.n} sellHits=${ho.sellHits}/${ho.n}`);
  console.log(`orders from older window: buy=${fmt(ho.orders.buy)} sell=${fmt(ho.orders.sell)} margin=${fmt(ho.orders.margin)} (fit on ${ho.orders.n} days at k=${ho.orders.k})`);
}

console.log('');
