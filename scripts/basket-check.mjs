// Dev tool: sanity-checks tools-src/runescape/basket-model.js against real
// price history — one family's GEB (Grand Exchange Basket) read live.
//
//   node scripts/basket-check.mjs              # Wood, 90-day window
//   node scripts/basket-check.mjs metal 30     # a family key and a window in days
//   node scripts/basket-check.mjs all 365      # every family (about 130 requests)
//   OSRS_API=https://prices.runescape.wiki/api/v1/osrs node scripts/basket-check.mjs
//
// Requests: /mapping and /latest once, then one daily /timeseries call per
// item in the family (plus whatever its pairs reach for), six at a time.

import { FAMILIES, STAGES, PAIRS } from '../tools-src/runescape/baskets.js';
import { buildCommodities, DAY } from '../tools-src/runescape/basket-model.js';

const API = process.env.OSRS_API || 'https://prices.runescape.wiki/api/v1/osrs';
const UA = 'job-board basket check (gaming.peliglot.com; a few dozen one-off requests)';
const famKey = (process.argv[2] || 'wood').toLowerCase();
const W = Number(process.argv[3] || 90);

async function get(path) {
  const res = await fetch(API + path, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}
async function pool(tasks, width) {
  const out = new Array(tasks.length);
  let next = 0;
  await Promise.all(Array.from({ length: width }, async () => {
    while (next < tasks.length) { const i = next++; out[i] = await tasks[i](); }
  }));
  return out;
}

const families = famKey === 'all' ? FAMILIES : FAMILIES.filter((f) => f.key === famKey);
if (families.length === 0) { console.error(`no family "${famKey}" — try ${FAMILIES.map((f) => f.key).join(', ')} or all`); process.exit(1); }
const inGrid = new Set(families.flatMap((f) => Object.values(f.stages).flat()));
const pairs = PAIRS.filter((p) => inGrid.has(p.out) || p.ins.some(([n]) => inGrid.has(n)));
const names = new Set([...inGrid]);
for (const p of pairs) { names.add(p.out); for (const [n] of p.ins) names.add(n); }

const [mapping, latest] = await Promise.all([get('/mapping'), get('/latest')]);
const byName = new Map(mapping.map((m) => [m.name, m]));
const items = new Map();
for (const n of names) {
  const m = byName.get(n);
  if (!m) { console.warn(`  (no such item on the exchange: ${n})`); continue; }
  const p = latest.data?.[m.id];
  const mid = p && p.low && p.high ? (p.low + p.high) / 2 : p?.low ?? p?.high ?? null;
  items.set(n, { id: m.id, name: n, limit: m.limit, mid, dv: 0, week: [] });
}
console.log(`\n=== ${families.map((f) => f.name).join(', ')} — ${items.size} items, ${W}-day window, API ${API} ===`);

const list = [...items.values()];
const series = await pool(list.map((it) => () => get(`/timeseries?timestep=24h&id=${it.id}`).then((j) => j.data).catch((e) => { console.warn(`  ${it.name}: ${e.message}`); return null; })), 6);
const hist = new Map();
list.forEach((it, i) => { if (series[i]) hist.set(it.id, series[i]); });
console.log(`history for ${hist.size} of ${list.length} items`);

const fmt = (v, d = 1) => (v == null ? '–' : (v > 0 ? '+' : '') + v.toFixed(d) + '%');
const now = Math.floor(Date.now() / 1000);
for (const weighting of ['flow', 'equal']) {
  const view = buildCommodities({ families, stages: STAGES, pairs, resolve: (n) => items.get(n) || null, hist, weekDays: [], now, window: W, weighting });
  console.log(`\n--- weighting: ${weighting} ---`);
  for (const f of view.families) {
    const b = f.level.breadth;
    console.log(`${f.name}: ${f.level.levels.at(-1)?.toFixed(1)}  (${fmt(f.level.ret)} across the window; ${b.up} up · ${b.down} down · ${b.flat} flat of ${b.n})`);
    if (weighting === 'flow') {
      for (const c of f.cells) for (const e of c.items) {
        const flag = e.z.pz != null && Math.abs(e.z.pz) >= 2 ? ` ⚑ price z ${e.z.pz.toFixed(1)}` : '';
        console.log(`   ${c.stage.padEnd(8)} ${e.name.padEnd(24)} ${fmt(e.ret).padStart(8)}  vs family ${fmt(e.vsFamily).padStart(8)}  ${e.hasHistory ? '' : '(no history)'}${flag}`);
      }
    }
  }
  console.log(`All: ${view.all.levels.at(-1)?.toFixed(1)} (${fmt(view.all.ret)})  stages: ${view.stages.map((s) => `${s.name} ${s.level.levels.at(-1)?.toFixed(1)}`).join(' · ')}`);
  if (weighting === 'flow' && view.spreads.length) {
    console.log('\nspreads (today):');
    for (const s of view.spreads) {
      const band = s.band ? `usual ${s.band.mean.toFixed(3)} ± ${s.band.sd.toFixed(3)} (${s.band.n}d), z ${s.z?.toFixed(1)}` : 'no band yet';
      console.log(`   ${s.ins.map((x) => `${x.qty} ${x.name}`).join(' + ')}${s.fee ? ` + ${s.fee} gp` : ''} → ${s.yield || 1} ${s.out}: margin ${s.last?.margin?.toFixed(0)} gp, ratio ${s.last?.ratio?.toFixed(3)} · ${band}`);
    }
  }
}
console.log(`\nwindow ${new Date(view_days_start(now, W) * 1000).toISOString().slice(0, 10)} .. today, ${view_len(W)} days`);
function view_days_start(n, w) { return Math.floor(n / DAY) * DAY - w * DAY; }
function view_len(w) { return w + 1; }
