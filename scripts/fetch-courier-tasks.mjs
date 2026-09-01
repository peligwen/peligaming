#!/usr/bin/env node
// Refresh just the courier-task block of naval.json from the OSRS Wiki —
// the quick path when the task table changes but the seas haven't.
// (fetch-naval-data.mjs rebuilds everything, this block included.)
//
//   node scripts/fetch-courier-tasks.mjs [--fresh]

import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { scrapeCourier } from './lib/courier-tasks.mjs';

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
naval.courier = await scrapeCourier(pageWikitext, naval.ports.map(p => p.name));
naval.courierGenerated = new Date().toISOString().slice(0, 10);
writeFileSync(FILE, JSON.stringify(naval));
console.log(`naval.json: ${(JSON.stringify(naval).length / 1024).toFixed(0)} KB`);
