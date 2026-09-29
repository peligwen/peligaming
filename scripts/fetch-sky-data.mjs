#!/usr/bin/env node
// Builds the Sky Pointer's catalog — every star to magnitude 6 with its
// colour and name, the 89 constellation figures and their names, the Messier
// list and the brightest other deep-sky objects, and the World Magnetic
// Model's coefficients (so a phone compass reading magnetic north can be
// corrected to true north) — into one file:
//   public/tools/irl/data/sky-pointer/sky.json
//
// Sources:
//   - d3-celestial (github.com/ofrohn/d3-celestial, BSD-3-Clause): its
//     stars.6.json (Hipparcos positions, magnitudes and B-V colours, J2000),
//     starnames.json, constellations.json, constellations.lines.json,
//     messier.json, dsos.bright.json and dsonames.json.
//   - NOAA/NCEI's WMM2025 coefficient file (public domain).
// Downloads are cached in .sky-cache/; `--fresh` refetches everything.
//
//   node scripts/fetch-sky-data.mjs [--fresh]      (npm run data:sky)

import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const CELESTIAL = 'https://raw.githubusercontent.com/ofrohn/d3-celestial/master/';
const WMM_ZIP = 'https://www.ncei.noaa.gov/sites/default/files/2024-12/WMM2025COF.zip';
const UA = 'peligaming sky-pointer data build (github.com/peligwen/peligaming)';
const CACHE = '.sky-cache';
const OUT = 'public/tools/irl/data/sky-pointer/sky.json';
const FRESH = process.argv.includes('--fresh');

mkdirSync(CACHE, { recursive: true });

async function fetchRetry(url, asBuffer = false) {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(60000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return asBuffer ? Buffer.from(await res.arrayBuffer()) : await res.text();
    } catch (e) {
      if (attempt >= 3) throw new Error(`${url}: ${e.message}`);
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
  }
}
async function cached(name, url, asBuffer = false) {
  const file = join(CACHE, name);
  if (FRESH) rmSync(file, { force: true });
  if (!existsSync(file)) writeFileSync(file, await fetchRetry(url, asBuffer));
  return asBuffer ? readFileSync(file) : readFileSync(file, 'utf8');
}
const celestial = async (name) => JSON.parse(await cached(name, CELESTIAL + (name === 'LICENSE' ? '' : 'data/') + name));

// d3-celestial stores right ascension as a map longitude, -180..180; the
// tool wants 0..360 degrees.
const ra = (lon) => round(lon < 0 ? lon + 360 : lon, 4);
const round = (x, n) => Number(Number(x).toFixed(n));

// ---------------------------------------------------------------- stars
const starsGeo = await celestial('stars.6.json');
const starNames = await celestial('starnames.json');
const stars = starsGeo.features
  .map((f) => ({
    hip: Number(f.id),
    ra: ra(f.geometry.coordinates[0]),
    dec: round(f.geometry.coordinates[1], 4),
    mag: round(f.properties.mag, 2),
    bv: f.properties.bv === '' ? null : round(Number(f.properties.bv), 2),
  }))
  .sort((a, b) => a.mag - b.mag);
const names = {};
for (const s of stars) {
  const n = starNames[s.hip];
  if (!n) continue;
  if (!(n.name || n.bayer || n.flam)) continue;
  names[s.hip] = [n.name || '', n.bayer || '', n.flam || '', n.c || ''];
}

// ---------------------------------------------------------------- constellations
const consGeo = await celestial('constellations.json');
const linesGeo = await celestial('constellations.lines.json');
// Serpens is one constellation in two pieces, so both files carry two
// "Ser" features (Caput and Cauda); each half keeps its own label point.
const lines = new Map();
for (const f of linesGeo.features) lines.set(f.id, [...(lines.get(f.id) || []), ...f.geometry.coordinates]);
const cons = {};
for (const f of consGeo.features) {
  const p = f.properties;
  const label = [ra(f.geometry.coordinates[0]), round(f.geometry.coordinates[1], 2), p.name];
  if (cons[f.id]) { cons[f.id].labels.push(label); continue; }
  cons[f.id] = {
    name: p.name.replace(/ (Caput|Cauda)$/, ''),
    gen: p.gen,
    labels: [label],
    lines: (lines.get(f.id) || []).map((seg) => seg.map(([lon, dec]) => [ra(lon), round(dec, 4)])),
  };
}

// ---------------------------------------------------------------- deep sky
const TYPES = {
  oc: 'open cluster', gc: 'globular cluster', s: 'galaxy', e: 'galaxy', i: 'galaxy', l: 'galaxy', sd: 'galaxy',
  sfr: 'nebula', en: 'nebula', rn: 'nebula', pn: 'planetary nebula', snr: 'supernova remnant', pos: 'position',
};
const messier = await celestial('messier.json');
const bright = await celestial('dsos.bright.json');
const dsoNames = await celestial('dsonames.json');
const key = (s) => s.replace(/\s+/g, '').toUpperCase();
const dsos = [];
const seen = new Set();
for (const f of messier.features) {
  const p = f.properties;
  seen.add(key(f.id));
  if (p.desig) seen.add(key(p.desig));
  dsos.push({
    id: f.id.replace(/^M(\d)/, 'M$1'),
    name: p.alt || '',
    desig: p.desig || '',
    type: TYPES[p.type] || p.type,
    mag: p.mag == null ? null : round(p.mag, 1),
    ra: ra(f.geometry.coordinates[0]),
    dec: round(f.geometry.coordinates[1], 4),
    dim: p.dim || '',
  });
}
for (const f of bright.features) {
  if (seen.has(key(f.id))) continue;
  const p = f.properties;
  dsos.push({
    id: f.id,
    name: dsoNames[f.id]?.name || '',
    desig: '',
    type: TYPES[p.type] || p.type,
    mag: p.mag == null ? null : round(p.mag, 1),
    ra: ra(f.geometry.coordinates[0]),
    dec: round(f.geometry.coordinates[1], 4),
    dim: p.dim || '',
  });
}
// the galactic centre is a direction, not a thing to point a telescope at;
// two Messier "objects" are a double star and an asterism
const FIXUPS = { GC: ['Galactic centre', 'galactic centre'], M40: ['Winnecke 4', 'double star'], M73: ['', 'asterism'] };
for (const d of dsos) if (FIXUPS[d.id]) { d.name = FIXUPS[d.id][0] || d.name; d.type = FIXUPS[d.id][1]; }
dsos.sort((a, b) => (a.mag ?? 99) - (b.mag ?? 99));

// ---------------------------------------------------------------- magnetic model
const zip = await cached('WMM2025COF.zip', WMM_ZIP, true);
const cof = execFileSync('unzip', ['-p', join(CACHE, 'WMM2025COF.zip'), 'WMM2025COF/WMM2025.COF'], { encoding: 'utf8' });
const cofLines = cof.split('\n').map((l) => l.trim()).filter(Boolean);
const [epoch, model] = cofLines[0].split(/\s+/);
const coef = cofLines.slice(1)
  .filter((l) => !/^9{10}/.test(l))
  .map((l) => l.split(/\s+/).map(Number))
  .map(([n, m, g, h, dg, dh]) => [n, m, g, h, dg, dh]);
if (coef.length !== 90) throw new Error(`expected 90 WMM coefficient rows, got ${coef.length}`);
void zip;

// ---------------------------------------------------------------- write
const license = await cached('LICENSE', CELESTIAL + 'LICENSE');
const out = {
  built: new Date().toISOString().slice(0, 10),
  epoch: 'J2000',
  sources: {
    stars: 'd3-celestial stars.6.json (Hipparcos, mag ≤ 6) and starnames.json — BSD-3-Clause, © 2015 Olaf Frohn',
    constellations: 'd3-celestial constellations.json and constellations.lines.json — BSD-3-Clause',
    dsos: 'd3-celestial messier.json, dsos.bright.json and dsonames.json — BSD-3-Clause',
    wmm: `NOAA/NCEI ${model} (${WMM_ZIP})`,
  },
  license: license.trim(),
  stars: stars.map((s) => [s.ra, s.dec, s.mag, s.bv, s.hip]),
  names,
  cons,
  dsos,
  wmm: { epoch: Number(epoch), model, coef },
};
writeFileSync(OUT, JSON.stringify(out));
console.log(`${OUT}: ${stars.length} stars (${Object.keys(names).length} named), ${Object.keys(cons).length} constellations, ${dsos.length} deep-sky objects, ${coef.length} WMM rows — ${(readFileSync(OUT).length / 1024).toFixed(0)} KB`);
