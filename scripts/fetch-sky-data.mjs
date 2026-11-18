#!/usr/bin/env node
// Builds the Sky Pointer's catalog — every star to magnitude 6 with its
// colour and name, the 89 constellation figures and their names, the
// constellation illustrations with the stars that pin them to the sky, the
// IAU constellation boundaries, the Messier list and the brightest other
// deep-sky objects, and the World Magnetic Model's coefficients (so a phone
// compass reading magnetic north can be corrected to true north) — into one
// file, plus the illustrations themselves:
//   public/tools/irl/data/sky-pointer/sky.json
//   public/tools/irl/data/sky-pointer/art/<IAU abbreviation>.png
//
// Sources:
//   - d3-celestial (github.com/ofrohn/d3-celestial, BSD-3-Clause): its
//     stars.6.json (Hipparcos positions, magnitudes and B-V colours, J2000),
//     starnames.json, constellations.json, constellations.lines.json,
//     messier.json, dsos.bright.json and dsonames.json; stars.8.json only
//     for the three illustration anchors fainter than magnitude 6.
//   - Stellarium's "modern" sky culture (github.com/Stellarium/stellarium,
//     skycultures/modern): its index.json, for each illustration's three
//     anchor stars and for the IAU boundaries as Delporte drew them (B1875
//     edges, from pbarbier.com) — data CC BY-SA 4.0 — and the illustrations,
//     under the Free Art License 1.3.
//   - NOAA/NCEI's WMM2025 coefficient file (public domain).
// Downloads are cached in .sky-cache/; `--fresh` refetches everything.
//
//   node scripts/fetch-sky-data.mjs [--fresh]      (npm run data:sky)

import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync, copyFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { execFileSync } from 'node:child_process';

const CELESTIAL = 'https://raw.githubusercontent.com/ofrohn/d3-celestial/master/';
const STELLARIUM = 'https://raw.githubusercontent.com/Stellarium/stellarium/master/skycultures/modern/';
const WMM_ZIP = 'https://www.ncei.noaa.gov/sites/default/files/2024-12/WMM2025COF.zip';
const UA = 'peligaming sky-pointer data build (github.com/peligwen/peligaming)';
const CACHE = '.sky-cache';
const OUT = 'public/tools/irl/data/sky-pointer/sky.json';
const ART_DIR = 'public/tools/irl/data/sky-pointer/art';
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

// ---------------------------------------------------------------- illustrations
// Each Stellarium illustration is a light-on-black drawing pinned to the sky
// by three stars: the pixel each star sits on (x right, y down from the top
// left) and the star's Hipparcos number. The page maps the image onto the
// sphere through those three points, so only their positions are kept.
// Three constellations share another's picture: Argo Navis is drawn whole
// on Carina, and the Serpent coils round Ophiuchus.
const SHARED_ART = { Pup: 'Car', Vel: 'Car', Ser: 'Oph' };
const modern = JSON.parse(await cached('stellarium-modern-index.json', STELLARIUM + 'index.json'));
const modernAbout = await cached('stellarium-modern-description.md', STELLARIUM + 'description.md');
const starAt = new Map(stars.map((s) => [s.hip, [s.ra, s.dec]]));
let faint = null; // stars.8.json, only if an anchor is fainter than the mag-6 list
async function anchorStar(hip) {
  if (starAt.has(hip)) return starAt.get(hip);
  faint ||= new Map((await celestial('stars.8.json')).features.map((f) => [Number(f.id), [ra(f.geometry.coordinates[0]), round(f.geometry.coordinates[1], 4)]]));
  if (!faint.has(hip)) throw new Error(`illustration anchor HIP ${hip} is in neither star list`);
  return faint.get(hip);
}
rmSync(ART_DIR, { recursive: true, force: true });
mkdirSync(ART_DIR, { recursive: true });
const art = {};
for (const c of modern.constellations) {
  const id = c.id.replace(/^CON modern /, '');
  if (!cons[id]) throw new Error(`Stellarium constellation ${c.id} is not one of the 88`);
  if (!c.image) {
    if (!SHARED_ART[id]) throw new Error(`${id} has no illustration and shares none`);
    continue;
  }
  const { file, size: [w, h], anchors } = c.image;
  if (anchors.length !== 3) throw new Error(`${id}: ${anchors.length} anchors, expected 3`);
  const cacheName = `stellarium-${basename(file)}`;
  await cached(cacheName, STELLARIUM + file, true);
  copyFileSync(join(CACHE, cacheName), join(ART_DIR, `${id}.png`));
  const a = [];
  for (const { pos: [x, y], hip } of anchors) a.push([x, y, ...(await anchorStar(hip))]);
  art[id] = { img: `art/${id}.png`, w, h, a };
}
for (const [id, host] of Object.entries(SHARED_ART)) (art[host].covers ||= []).push(id);
if (Object.keys(art).length + Object.keys(SHARED_ART).length !== 88) throw new Error(`illustrations cover ${Object.keys(art).length} + ${Object.keys(SHARED_ART).length} constellations, not 88`);
const artLicense = (modernAbout.match(/## License\s+([\s\S]*?)(\n## |$)/) || [])[1]?.trim() || '';
if (!/Illustrations: Free Art License/.test(artLicense)) throw new Error(`Stellarium's modern sky culture licence changed: ${artLicense}`);
writeFileSync(join(ART_DIR, 'LICENSE.txt'), [
  'Constellation illustrations from the Stellarium project\'s "modern" sky culture',
  '(https://stellarium.org, https://github.com/Stellarium/stellarium/tree/master/skycultures/modern),',
  'copied unchanged and renamed by IAU abbreviation (Car is Argo Navis, which also covers Pup and Vel;',
  'Oph also draws Serpens).',
  '',
  'They are released under the Free Art License 1.3: https://artlibre.org/licence/lal/en/',
  '',
  "Stellarium's own statement of the sky culture's licence:",
  artLicense,
  '',
].join('\n'));

// ---------------------------------------------------------------- boundaries
// The IAU boundaries run along meridians and parallels of the B1875 equator
// (Delporte, 1930). Each edge is [type, ra1, dec1, ra2, dec2, a, b] in B1875
// degrees: type M runs north along a meridian with constellation a to its
// east, type P runs east along a parallel with a to its south. Serpens' two
// halves are one constellation here.
const hms = (t) => { const [h, m, s] = t.split(':').map(Number); return round(h * 15 + m / 4 + s / 240, 5); };
const dms = (t) => { const [d, m, s] = t.replace(/^[+-]/, '').split(':').map(Number); return round((t[0] === '-' ? -1 : 1) * (d + m / 60 + s / 3600), 5); };
const conId = new Map(Object.keys(cons).map((id) => [id.toUpperCase(), id]));
const conOf = (code) => {
  const id = conId.get(code.replace(/^SER[12]$/, 'SER'));
  if (!id) throw new Error(`boundary edge names an unknown constellation ${code}`);
  return id;
};
if (modern.edges_type !== 'iau' || modern.edges_epoch !== 'B1875') throw new Error(`Stellarium's boundaries are now ${modern.edges_type} ${modern.edges_epoch}`);
const edges = modern.edges.map((line) => {
  const [, type, ra1, dec1, ra2, dec2, a, b] = line.trim().split(/\s+/);
  if (!/^[MP]\+$/.test(type)) throw new Error(`unexpected boundary edge type in "${line}"`);
  const e = [type[0], hms(ra1), dms(dec1), hms(ra2), dms(dec2), conOf(a), conOf(b)];
  if (e[0] === 'M' ? e[1] !== e[3] || e[2] >= e[4] : e[2] !== e[4]) throw new Error(`boundary edge is not a north-going meridian or a parallel: "${line}"`);
  return e;
});

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
    art: 'Stellarium modern sky culture illustrations (art/*.png) — Free Art License 1.3, https://artlibre.org/licence/lal/en/ — anchored by its index.json (CC BY-SA 4.0)',
    bounds: `IAU boundaries (Delporte 1930, B1875) as listed in Stellarium's modern sky culture from ${modern.edges_source} — CC BY-SA 4.0`,
    dsos: 'd3-celestial messier.json, dsos.bright.json and dsonames.json — BSD-3-Clause',
    wmm: `NOAA/NCEI ${model} (${WMM_ZIP})`,
  },
  license: license.trim(),
  stars: stars.map((s) => [s.ra, s.dec, s.mag, s.bv, s.hip]),
  names,
  cons,
  art,
  bounds: { epoch: 'B1875', edges },
  dsos,
  wmm: { epoch: Number(epoch), model, coef },
};
writeFileSync(OUT, JSON.stringify(out));
console.log(`${OUT}: ${stars.length} stars (${Object.keys(names).length} named), ${Object.keys(cons).length} constellations (${Object.keys(art).length} illustrations, ${edges.length} boundary edges), ${dsos.length} deep-sky objects, ${coef.length} WMM rows — ${(readFileSync(OUT).length / 1024).toFixed(0)} KB`);
