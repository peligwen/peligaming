// Re-bakes tools-src/runescape/flip-desk-snapshot.json from the OSRS Wiki
// real-time prices API, in the v2 schema the Flip Desk's verified-average
// pricing needs. Run from a machine with internet access, then rebuild:
//
//   node scripts/capture-snapshot.mjs && npm run build:tools
//
// v2 row: [id, name, limit, members,
//          lastLow, lastHigh, lastLowTime, lastHighTime,
//          5mAvgLow, 5mAvgHigh, 5mLowVol, 5mHighVol,
//          1hAvgLow, 1hAvgHigh, 1hLowVol, 1hHighVol,
//          24hVolume]
// Window fields are null-padded when a window has no trades. The item list
// (ids, names, limits, members) is carried over from the existing snapshot;
// limits are cross-checked against /mapping and corrected with a warning.

import { readFileSync, writeFileSync } from 'node:fs';

const SNAP_PATH = new URL('../tools-src/runescape/flip-desk-snapshot.json', import.meta.url);
const API = 'https://prices.runescape.wiki/api/v1/osrs';
// The wiki asks API users to identify themselves.
const UA = 'peligaming flip-desk snapshot updater (github.com/peligwen/peligaming)';

const get = async (path) => {
  const res = await fetch(`${API}/${path}`, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
};

const old = JSON.parse(readFileSync(SNAP_PATH, 'utf8'));
const baseRows = old.items.map((r) => ({ id: r[0], name: r[1], limit: r[2], members: r[3] }));

const [latest, m5, h1, vols, mapping] = await Promise.all([
  get('latest'), get('5m'), get('1h'), get('volumes'), get('mapping'),
]);
const limits = new Map(mapping.map((m) => [m.id, m.limit]));

const win = (d) => d && (d.avgHighPrice || d.avgLowPrice)
  ? [d.avgLowPrice ?? null, d.avgHighPrice ?? null, d.lowPriceVolume || 0, d.highPriceVolume || 0]
  : [null, null, null, null];

const items = baseRows.map(({ id, name, limit, members }) => {
  const mapped = limits.get(id);
  if (mapped != null && mapped !== limit) {
    console.warn(`limit changed for ${name} (${id}): ${limit} -> ${mapped}`);
    limit = mapped;
  }
  const p = latest.data?.[id] ?? {};
  return [
    id, name, limit, members,
    p.low ?? null, p.high ?? null, p.lowTime ?? null, p.highTime ?? null,
    ...win(m5.data?.[id]),
    ...win(h1.data?.[id]),
    vols.data?.[id] ?? 0,
  ];
});

const priced = items.filter((r) => (r[8] && r[9]) || (r[12] && r[13])).length;
if (priced < items.length * 0.7) {
  throw new Error(`only ${priced}/${items.length} items have a priceable window — refusing to bake a thin capture`);
}

const snap = { version: 2, ts: Math.floor(Date.now() / 1000), items };
writeFileSync(SNAP_PATH, JSON.stringify(snap));
console.log(`baked v2 snapshot: ${items.length} items, ${priced} priceable, ts ${new Date(snap.ts * 1000).toISOString()}`);
console.log('now run: npm run build:tools');
