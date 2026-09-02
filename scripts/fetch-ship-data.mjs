#!/usr/bin/env node
// Refresh just the ship blocks of naval.json from the OSRS Wiki — boat
// types, core-part tier tables and cargo holds (naval.ship), and each sea
// monster's attack against a boat (max hit, speed, style, attack level).
// The quick path when shipbuilding numbers change but the seas haven't.
// (fetch-naval-data.mjs rebuilds everything, these blocks included.)
//
//   node scripts/fetch-ship-data.mjs [--fresh]

import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { scrapeShipParts, scrapeBoatCombat, monsterCombatStats } from './lib/ship-parts.mjs';

const API = 'https://oldschool.runescape.wiki/api.php';
const CACHE = '.naval-cache';
const FILE = 'public/tools/runescape/data/naval/naval.json';
const FRESH = process.argv.includes('--fresh');

mkdirSync(CACHE, { recursive: true });

async function fetchRetry(url) {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { 'user-agent': 'peligaming naval pathfinder data build (github.com/peligwen/peligaming)' },
        signal: AbortSignal.timeout(30000),
      });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      if (attempt >= 3) throw new Error(`${url}: ${e.message}`);
      await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
    }
  }
}
async function pageWikitext(title) {
  const file = join(CACHE, `wt_${title}`.replace(/[^a-zA-Z0-9._-]/g, '_'));
  if (FRESH) rmSync(file, { force: true });
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8')).parse?.wikitext?.['*'] ?? null;
  const body = await fetchRetry(`${API}?${new URLSearchParams({ format: 'json', action: 'parse', page: title, prop: 'wikitext' })}`);
  if (body === null) return null;
  writeFileSync(file, body);
  return JSON.parse(body).parse?.wikitext?.['*'] ?? null;
}

const naval = JSON.parse(readFileSync(FILE, 'utf8'));
naval.ship = await scrapeShipParts(pageWikitext);
delete naval.hulls;   // superseded by ship.parts.hull

// monsters: the bounty page names each creature's wiki page; the committed
// entries carry the display name, so match on the page title stripped the
// same way fetch-naval-data.mjs does
const shipCombat = await scrapeBoatCombat(pageWikitext);
const bounty = await pageWikitext('Bounty tasks');
const titles = [...new Set([...(bounty || '').matchAll(/monster=([^|}]+)/g)].map(m => m[1].trim()))];
const display = t => t.replace(/ \((monster|sea|Sailing)\)/i, '');
let hit = 0;
for (const m of naval.monsters || []) {
  const title = titles.find(t => display(t) === m.name) || m.name;
  const wt = await pageWikitext(title);
  if (!wt) { console.log(`  [warn] no page for monster ${m.name}`); continue; }
  const stats = monsterCombatStats(wt, shipCombat.get(title));
  if (stats.maxHit == null) { console.log(`  [warn] no max hit for ${m.name}`); continue; }
  Object.assign(m, stats);
  hit++;
}
console.log(`monster combat stats: ${hit} of ${(naval.monsters || []).length}`);

naval.shipGenerated = new Date().toISOString().slice(0, 10);
writeFileSync(FILE, JSON.stringify(naval));
console.log(`naval.json: ${(JSON.stringify(naval).length / 1024).toFixed(0)} KB`);
