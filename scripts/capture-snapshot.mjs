// Re-bakes the Flip Desk's offline snapshot (tools-src/runescape/flip-desk-snapshot.json)
// with tape-averaged v2 pricing plus a seven-day daily history, so offline mode uses
// the same verified numbers as the live board instead of raw prints.
//
//   node scripts/capture-snapshot.mjs                # via the site's own proxy
//   OSRS_API=https://prices.runescape.wiki/api/v1/osrs node scripts/capture-snapshot.mjs
//
// The site proxy doesn't serve /24h until that worker change ships, so until then
// this needs the direct wiki base above for the daily history to come back.
//
// Then: npm run build:tools, and commit both files. 13 requests total
// (5 tape/mapping endpoints + 8 daily blocks, all in parallel).

import { writeFileSync } from 'node:fs';

const BASE = process.env.OSRS_API || 'https://gaming.peliglot.com/api/osrs';
const UA = 'flip-desk snapshot capture (gaming.peliglot.com; one-off, 13 requests)';
const KEEP = 400; // most-traded rows to bake
const DAY = 86400;

const get = async (p) => {
  const res = await fetch(BASE + p, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!res.ok) throw new Error(`${p}: HTTP ${res.status}`);
  return res.json();
};

const now = Math.floor(Date.now() / 1000);
const todayStart = Math.floor(now / DAY) * DAY;
// today-1d .. today-8d: eight day-aligned UTC blocks, all fully in the past.
// We ask for eight instead of seven because a day can come back empty (the
// wiki backfills a day over the next day or two) and we still want a full week.
const dayTimestamps = Array.from({ length: 8 }, (_, i) => todayStart - (i + 1) * DAY);

const [mapping, latest, m5, h1, vols, ...dailyRaw] = await Promise.all([
  get('/mapping'), get('/latest'), get('/5m'), get('/1h'), get('/volumes'),
  ...dayTimestamps.map((t) => get(`/24h?timestamp=${t}`)),
]);

// drop empty days (not yet backfilled), then keep the newest seven, oldest first
const dailyDays = dayTimestamps
  .map((t, i) => ({ t, data: dailyRaw[i]?.data }))
  .filter((d) => d.data && Object.keys(d.data).length > 0)
  .sort((a, b) => a.t - b.t)
  .slice(-7);
const days = dailyDays.map((d) => d.t);
const dayData = dailyDays.map((d) => d.data);

// mean daily (vLo+vHi) × mean daily mid, over the two-sided days in the
// week (the only days a mid price can even be computed for) — a rough
// gp-turnover estimate so ranking favours deep books over merely-cheap ones
const weekTurnover = (week) => {
  const twoSided = week.filter((w) => w && w[0] != null && w[1] != null);
  if (twoSided.length === 0) return null;
  const meanVol = twoSided.reduce((s, w) => s + w[2] + w[3], 0) / twoSided.length;
  const meanMid = twoSided.reduce((s, w) => s + (w[0] + w[1]) / 2, 0) / twoSided.length;
  return meanVol * meanMid;
};

const rows = [];
for (const m of mapping) {
  if (!m.id || !m.name || !(m.limit > 0)) continue;
  const h = h1.data?.[m.id] || {};
  const f = m5.data?.[m.id] || {};
  const p = latest.data?.[m.id];
  const hvLo = h.lowPriceVolume || 0, hvHi = h.highPriceVolume || 0;
  // same selection the live board applies: tape averages or nothing
  const ok5 = f.avgLowPrice && f.avgHighPrice && (f.lowPriceVolume || 0) >= 5 && (f.highPriceVolume || 0) >= 5;
  const ok1 = h.avgLowPrice && h.avgHighPrice && hvLo >= 1 && hvHi >= 1;

  // per-day [lo, hi, vLo, vHi] aligned with `days`, or null when the item
  // has no record that day at all
  const week = dayData.map((d) => {
    const e = d[m.id];
    if (e === undefined) return null;
    return [e.avgLowPrice ?? null, e.avgHighPrice ?? null, e.lowPriceVolume || 0, e.highPriceVolume || 0];
  });
  const twoSidedDays = week.reduce((n, w) => n + (w && w[0] != null && w[1] != null ? 1 : 0), 0);

  // a row with no live tape can still earn a place off a real daily history
  if (!ok5 && !ok1 && twoSidedDays < 3) continue;

  const src = ok5 ? 2 : ok1 ? 1 : 0;
  let low, high;
  if (src > 0) {
    low = Math.round(ok5 ? f.avgLowPrice : h.avgLowPrice);
    high = Math.round(ok5 ? f.avgHighPrice : h.avgHighPrice);
  } else {
    // no tape: price off the most recent two-sided day (twoSidedDays >= 3
    // guarantees the loop below finds one)
    for (let i = week.length - 1; i >= 0; i--) {
      const w = week[i];
      if (w && w[0] != null && w[1] != null) { low = Math.round(w[0]); high = Math.round(w[1]); break; }
    }
  }
  if (high < low) continue;

  const dv = vols.data?.[m.id] ?? 0;
  if (src > 0) {
    // dislocated screen only makes sense against a live tape — week-only
    // rows already passed a stricter bar (three two-sided days) instead
    const spreadPct = low > 0 ? ((high - low) / low) * 100 : 0;
    if (high >= 50 && spreadPct > 10 && dv > 20_000) continue; // dislocated
  }

  rows.push({
    row: [
      m.id, m.name, m.limit, m.members ? 1 : 0, low, high, hvLo, hvHi,
      p?.low ?? null, p?.high ?? null,
      p?.lowTime ? Math.round((now - p.lowTime) / 60) : 999,
      p?.highTime ? Math.round((now - p.highTime) / 60) : 999,
      dv, src, week,
    ],
    rank: weekTurnover(week) ?? dv,
  });
}

rows.sort((a, b) => b.rank - a.rank);
const items = rows.slice(0, KEEP).map((r) => r.row);
writeFileSync('tools-src/runescape/flip-desk-snapshot.json',
  JSON.stringify({ version: 3, ts: now, days, items }));
console.log(`baked v3 snapshot: ${items.length} items (of ${rows.length} priceable) from ${BASE}`);
console.log(`  ${days.length} daily blocks: ${days.map((t) => new Date(t * 1000).toISOString().slice(0, 10)).join(', ')}`);
console.log('now run: npm run build:tools — then commit the snapshot and the built html');
