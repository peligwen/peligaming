// Re-bakes the Flip Desk's offline snapshot (tools-src/runescape/flip-desk-snapshot.json)
// with tape-averaged v2 pricing, so offline mode uses the same verified numbers
// as the live board instead of raw prints.
//
//   node scripts/capture-snapshot.mjs                # via the site's own proxy
//   OSRS_API=https://prices.runescape.wiki/api/v1/osrs node scripts/capture-snapshot.mjs
//
// Then: npm run build:tools, and commit both files. Five requests total.

import { writeFileSync } from 'node:fs';

const BASE = process.env.OSRS_API || 'https://gaming.peliglot.com/api/osrs';
const UA = 'flip-desk snapshot capture (gaming.peliglot.com; one-off, 5 requests)';
const KEEP = 400; // most-traded rows to bake

const get = async (p) => {
  const res = await fetch(BASE + p, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!res.ok) throw new Error(`${p}: HTTP ${res.status}`);
  return res.json();
};

const [mapping, latest, m5, h1, vols] = await Promise.all([
  get('/mapping'), get('/latest'), get('/5m'), get('/1h'), get('/volumes'),
]);

const now = Math.floor(Date.now() / 1000);
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
  if (!ok5 && !ok1) continue;
  const low = Math.round(ok5 ? f.avgLowPrice : h.avgLowPrice);
  const high = Math.round(ok5 ? f.avgHighPrice : h.avgHighPrice);
  if (high < low) continue;
  const dv = vols.data?.[m.id] ?? 0;
  const spreadPct = low > 0 ? ((high - low) / low) * 100 : 0;
  if (high >= 50 && spreadPct > 10 && dv > 20_000) continue; // dislocated
  rows.push([
    m.id, m.name, m.limit, m.members ? 1 : 0, low, high, hvLo, hvHi,
    p?.low ?? null, p?.high ?? null,
    p?.lowTime ? Math.round((now - p.lowTime) / 60) : 999,
    p?.highTime ? Math.round((now - p.highTime) / 60) : 999,
    dv, ok5 ? 1 : 0,
  ]);
}

rows.sort((a, b) => b[12] - a[12]);
const items = rows.slice(0, KEEP);
writeFileSync('tools-src/runescape/flip-desk-snapshot.json',
  JSON.stringify({ version: 2, ts: now, items }));
console.log(`baked v2 snapshot: ${items.length} items (of ${rows.length} priceable) from ${BASE}`);
console.log('now run: npm run build:tools — then commit the snapshot and the built html');
