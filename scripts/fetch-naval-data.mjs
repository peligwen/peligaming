// Builds the data for the OSRS Naval Pathfinder tool from the OSRS Wiki:
//
//   public/tools/runescape/data/naval/
//     map.jpg       stitched sea-level world map texture (2 px per game tile)
//     navcells.png  navigation grid, 1 px per 4x4-tile cell; red channel is the
//                   water class index (0 = not navigable), see naval.json legend
//     naval.json    ports, shipwrecks, charting tasks, sea labels, shoals,
//                   monsters, hazard metadata, hull speeds, world bounds
//
// Run manually to refresh: `node scripts/fetch-naval-data.mjs`. All wiki
// fetches are cached under .naval-cache/ so re-runs are cheap; delete the
// cache (or pass --fresh) to pull the current map version. The committed
// outputs are what deploys — this script is local tooling only.
//
// After a refresh, run `python3 scripts/audit-naval-grid.py --repair` and
// review its report: it applies photo-referenced repairs for seas whose map
// colours the classifier here misses (the southern kelp sea, the Backwater),
// and verifies every port, wreck, shoal and charting task can be routed to.
//
// Hazard waters (fetid, icy, ...) are not published as polygons anywhere, but
// they are rendered with distinct water colours on the map tiles. We learn a
// reference colour per hazard by sampling around each hazard's seas (the sea
// list comes from the Sailing hazards page, sea positions from the wiki's own
// ocean-label overlay), then classify every game tile by nearest reference
// colour, constrained to the hazard's neighbourhood so lookalike colours far
// away cannot mislabel. QA previews land in .naval-cache/preview-*.png.

import { PNG } from 'pngjs';
import jpeg from 'jpeg-js';
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const API = 'https://oldschool.runescape.wiki/api.php';
const CACHE = '.naval-cache';
const OUT = 'public/tools/runescape/data/naval';
const ZOOM = 2;               // 4 px per game tile, 64 game tiles per 256px map tile
const PX_PER_TILE = 4;
const TILE_SPAN = 64;
const FRESH = process.argv.includes('--fresh');

mkdirSync(CACHE, { recursive: true });
mkdirSync(OUT, { recursive: true });
if (FRESH) for (const f of ['mapversion.txt']) rmSync(join(CACHE, f), { force: true });

// ---------------------------------------------------------------------------
// fetch helpers (disk-cached)
// ---------------------------------------------------------------------------

async function fetchRetry(url, asBuffer = false) {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { 'user-agent': 'peligaming naval pathfinder data build (github.com/peligwen/peligaming)' },
        signal: AbortSignal.timeout(30000),
      });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return asBuffer ? Buffer.from(await res.arrayBuffer()) : await res.text();
    } catch (e) {
      if (attempt >= 3) throw new Error(`${url}: ${e.message}`);
      await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
    }
  }
}

function cacheKey(name) {
  return join(CACHE, name.replace(/[^a-zA-Z0-9._-]/g, '_'));
}

async function cached(name, url, asBuffer = false) {
  const file = cacheKey(name);
  const miss = cacheKey(name + '.404');
  if (existsSync(miss)) return null;
  if (existsSync(file)) return asBuffer ? readFileSync(file) : readFileSync(file, 'utf8');
  const body = await fetchRetry(url, asBuffer);
  if (body === null) { writeFileSync(miss, ''); return null; }
  writeFileSync(file, body);
  return body;
}

async function apiJSON(name, params) {
  const url = `${API}?${new URLSearchParams({ format: 'json', ...params })}`;
  return JSON.parse(await cached(name, url));
}

async function pageWikitext(title) {
  const d = await apiJSON(`wt_${title}`, { action: 'parse', page: title, prop: 'wikitext' });
  return d?.parse?.wikitext?.['*'] ?? null;
}

async function pool(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const i = next++; results[i] = await fn(items[i], i); }
  }));
  return results;
}

const stripWiki = s => (s || '')
  .replace(/\{\{[^{}]*\}\}/g, '')
  .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1')
  .replace(/<[^>]+>/g, ' ')
  .replace(/'{2,}/g, '')
  .replace(/\s+/g, ' ').trim();

// ---------------------------------------------------------------------------
// map version + world bounds
// ---------------------------------------------------------------------------

const verMsg = await apiJSON('mapversion', {
  action: 'query', meta: 'allmessages', ammessages: 'kartographer-map-version',
});
const MAP_VERSION = verMsg.query.allmessages[0]['*'];
console.log('map version:', MAP_VERSION);

const basemaps = JSON.parse(await cached(`basemaps_${MAP_VERSION}`,
  `https://maps.runescape.wiki/osrs/versions/${MAP_VERSION}/basemaps.json`));
const surface = basemaps.find(m => m.mapId === 0);
const [[WX0, WY0], [WX1, WY1]] = surface.bounds; // game-tile bounds, y grows north
const W = WX1 - WX0, H = WY1 - WY0;
console.log(`world: x ${WX0}..${WX1}, y ${WY0}..${WY1} (${W}x${H} tiles)`);

// ---------------------------------------------------------------------------
// stage 1: fetch tiles, build per-game-tile mean colours + texture
// ---------------------------------------------------------------------------

// per-game-tile mean colour, indexed [ty*W+tx] with ty=0 at the SOUTH edge
const meanR = new Uint8Array(W * H), meanG = new Uint8Array(W * H), meanB = new Uint8Array(W * H);
const havePx = new Uint8Array(W * H);
// texture at 2 px per game tile, rows top-down (north first)
const TEXW = W * 2, TEXH = H * 2;
const tex = Buffer.alloc(TEXW * TEXH * 4);

{
  const jobs = [];
  for (let tx = Math.floor(WX0 / TILE_SPAN); tx * TILE_SPAN < WX1; tx++)
    for (let ty = Math.floor(WY0 / TILE_SPAN); ty * TILE_SPAN < WY1; ty++)
      jobs.push([tx, ty]);
  console.log(`fetching ${jobs.length} map tiles (zoom ${ZOOM})...`);
  let done = 0, missing = 0;
  await pool(jobs, 12, async ([tx, ty]) => {
    const url = `https://maps.runescape.wiki/osrs/versions/${MAP_VERSION}/tiles/rendered/0/${ZOOM}/0_${tx}_${ty}.png`;
    const buf = await cached(`tile_${ZOOM}_${tx}_${ty}.png`, url, true);
    if (++done % 300 === 0) console.log(`  ${done}/${jobs.length}`);
    if (!buf) { missing++; return; }
    const png = PNG.sync.read(buf);
    const d = png.data; // RGBA, row 0 = north edge of this map tile
    const baseTx = tx * TILE_SPAN - WX0, baseTy = ty * TILE_SPAN - WY0;
    for (let gy = 0; gy < TILE_SPAN; gy++) {       // gy: game-tile row within map tile, from south
      const wy = baseTy + gy;
      if (wy < 0 || wy >= H) continue;
      for (let gx = 0; gx < TILE_SPAN; gx++) {
        const wx = baseTx + gx;
        if (wx < 0 || wx >= W) continue;
        let r = 0, g = 0, b = 0;
        const py0 = (TILE_SPAN - 1 - gy) * PX_PER_TILE; // image y of this game tile's top
        for (let dy = 0; dy < PX_PER_TILE; dy++)
          for (let dx = 0; dx < PX_PER_TILE; dx++) {
            const o = ((py0 + dy) * 256 + gx * PX_PER_TILE + dx) * 4;
            r += d[o]; g += d[o + 1]; b += d[o + 2];
          }
        const n = PX_PER_TILE * PX_PER_TILE, idx = wy * W + wx;
        meanR[idx] = r / n; meanG[idx] = g / n; meanB[idx] = b / n; havePx[idx] = 1;
        // texture: 2x2 px per game tile, downsampled from the 4x4 block
        for (let sy = 0; sy < 2; sy++)
          for (let sx = 0; sx < 2; sx++) {
            let tr = 0, tg = 0, tb = 0;
            for (let dy = 0; dy < 2; dy++)
              for (let dx = 0; dx < 2; dx++) {
                const o = ((py0 + sy * 2 + dy) * 256 + gx * PX_PER_TILE + sx * 2 + dx) * 4;
                tr += d[o]; tg += d[o + 1]; tb += d[o + 2];
              }
            const texX = wx * 2 + sx, texY = (H - 1 - wy) * 2 + sy; // texture rows top-down
            const to = (texY * TEXW + texX) * 4;
            tex[to] = tr / 4; tex[to + 1] = tg / 4; tex[to + 2] = tb / 4; tex[to + 3] = 255;
          }
      }
    }
  });
  console.log(`tiles done (${missing} missing/void)`);
}

// ---------------------------------------------------------------------------
// stage 2: sea labels + hazard definitions
// ---------------------------------------------------------------------------

// The shared "ocean" overlay (transcluded on every sea page) carries every
// named sea/strait/bay as a labelled point. Any sea page's mapdata has it.
const seaLabels = [];
{
  const d = await apiJSON('mapdata_seas', { action: 'query', titles: 'Breakbone Strait', prop: 'mapdata' });
  const page = Object.values(d.query.pages)[0];
  const md = JSON.parse(page.mapdata[0]);
  for (const f of md.ocean[0].features) {
    const name = stripWiki(f.properties.label || '').replace(/\s+/g, ' ');
    if (!name) continue;
    const [x, y] = f.geometry.coordinates;
    seaLabels.push({ name, x: Math.round(x), y: Math.round(y) });
  }
  console.log(`sea labels: ${seaLabels.length}`);
}
const seaByName = new Map(seaLabels.map(s => [s.name.toLowerCase(), s]));

// Hazard classes. mode: 'gear' = safe with the listed fitting, 'penalty' =
// always damaging but survivable (routed around, never a wall), 'wall' =
// currently untraversable. Sea lists are parsed live from the hazards page.
const HAZARDS = {
  stormy:   { name: 'Stormy seas',            mode: 'gear', gate: 'Oak mast & linen sails', sailing: 24, construction: 11 },
  reefs:    { name: 'Jagged reefs',           mode: 'penalty' },
  fetid:    { name: 'Fetid waters',           mode: 'gear', gate: 'Inoculation station',    sailing: 40, construction: 37 },
  crystal:  { name: 'Crystal-flecked waters', mode: 'gear', gate: 'Adamant keel or better', sailing: 66, construction: 62 },
  kelp:     { name: 'Tangled kelp',           mode: 'gear', gate: 'Adamant helm or better', sailing: 72, construction: 59 },
  icy:      { name: 'Icy seas',               mode: 'gear', gate: 'Eternal brazier',        sailing: 78, construction: 72 },
  cold:     { name: 'Eternal cold',           mode: 'wall' },
  sunbaked: { name: 'Sunbaked seas',          mode: 'wall' },
  profane:  { name: 'Profane waters',         mode: 'wall' },
  scalding: { name: 'Scalding seas',          mode: 'wall' },
  cursed:   { name: 'Cursed seas',            mode: 'wall' },
};

// resolve a wiki page title to map coordinates: sea label first, then the
// page's own {{Ocean map|x=..|y=..}} / first {{Map|..|x,y}} infobox coords
async function resolveCoords(title) {
  const label = seaByName.get(title.toLowerCase());
  if (label) return { x: label.x, y: label.y };
  const wt = await pageWikitext(title);
  if (!wt) return null;
  let m = wt.match(/\{\{Ocean map\s*\|[^}]*x\s*=\s*(\d+)[^}]*y\s*=\s*(\d+)/i)
       || wt.match(/\{\{Ocean map\s*\|[^}]*y\s*=\s*(\d+)[^}]*x\s*=\s*(\d+)/i);
  if (m) return m[0].indexOf('x') < m[0].indexOf('y')
    ? { x: +m[1], y: +m[2] } : { x: +m[2], y: +m[1] };
  m = wt.match(/\{\{Map[^{}]*?\|(\d{3,4}),(\d{3,4})/);
  if (m) return { x: +m[1], y: +m[2] };
  return null;
}

// hazard -> seed coordinates, from the Sailing hazards page's location lists
{
  const wt = await pageWikitext('Sailing hazards');
  const rows = wt.split(/\n\|-/).slice(1);
  const byName = Object.fromEntries(Object.entries(HAZARDS).map(([k, h]) => [h.name.toLowerCase(), k]));
  for (const row of rows) {
    const nameM = row.match(/'''\[?\[?([^'\]|]+)/);
    if (!nameM) continue;
    const key = byName[nameM[1].trim().toLowerCase()];
    if (!key) continue;
    // The locations cell is a nested list: '*' is the container ocean, '**'
    // the hazard seas within it. The seas are the trusted seeds; ocean labels
    // sit wherever the overlay centres the whole ocean — often plain safe
    // water (the Western Ocean label floats east of Port Roberts), and a
    // hazard seed there teaches the classifier that open-water blue means
    // hazard. Containers are kept aside and vetted by colour in stage 3.
    // An ocean listed bare (no '**' seas) is wholly the hazard.
    const items = [...row.matchAll(/^(\*+)[^[\]*\n]*\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/gm)]
      .filter(m => !/^(File|Category):/i.test(m[2]));
    const deepest = items.reduce((d, m) => Math.max(d, m[1].length), 0);
    HAZARDS[key].locations = [...new Set(items.filter(m => m[1].length === deepest).map(m => m[2]))];
    HAZARDS[key].containers = deepest > 1
      ? [...new Set(items.filter(m => m[1].length === 1).map(m => m[2]))] : [];
  }
  // Jagged reefs' "around Crandor" is prose, not a link on every revision
  HAZARDS.reefs.locations = [...new Set([...(HAZARDS.reefs.locations || []), 'Crandor', 'Aehecatl'])];
  for (const [key, h] of Object.entries(HAZARDS)) {
    h.seeds = [];
    for (const t of h.locations || []) {
      const c = await resolveCoords(t);
      if (c) h.seeds.push({ ...c, title: t });
      else console.log(`  [warn] ${key}: could not resolve "${t}"`);
    }
    h.containerSeeds = [];
    for (const t of h.containers || []) {
      const c = await resolveCoords(t);
      if (c) h.containerSeeds.push({ ...c, title: t });
    }
    console.log(`hazard ${key}: ${h.seeds.length} seeds (${(h.locations || []).length} listed)`);
  }
}

// open-water seeds: well-known safe seas spread across the map (the southern
// seas are dappled shallows with their own palette, so they need seeds too)
const OPEN_SEAS = ['Bay of Sarim', 'Sea of Shells', 'Gulf of Kourend', 'Sunset Bay',
  'Fremensund', 'The Everdeep', 'Menaphite Sea', 'Tortugan Sea', 'Catherby Bay',
  'Kharidian Sea', 'The Lonely Sea', 'Misty Sea', 'Fortis Bay', 'Lunar Bay',
  'Turtle Belt', 'Pearl Bank', 'Red Reef', "Anglerfish's Light", 'The Skullhorde',
  'Arrow Passage', 'Bay of Elidinis', "Dusk's Maw", 'Aestuarium Tempestus',
  'Great Sound', 'Moonshadow', 'Fremennik Strait', 'Sapphire Sea', 'Ochre Sea'];
const openSeeds = OPEN_SEAS.map(n => seaByName.get(n.toLowerCase())).filter(Boolean);

// ---------------------------------------------------------------------------
// stage 3: classify every game tile by water colour
// ---------------------------------------------------------------------------

const tileAt = (x, y) => {
  const wx = x - WX0, wy = y - WY0;
  return wx >= 0 && wx < W && wy >= 0 && wy < H ? wy * W + wx : -1;
};

// dominant colours in a patch: labels sit over water, so the modal colours
// (quantised) of the surrounding tiles are that water's palette. Dappled
// water (shallows, ice floes) has several tones, so return the top buckets
// that each cover a meaningful share of the patch.
function dominantColors(cx, cy, radius = 24) {
  const buckets = new Map();
  let total = 0;
  for (let y = cy - radius; y <= cy + radius; y++)
    for (let x = cx - radius; x <= cx + radius; x++) {
      const i = tileAt(x, y);
      if (i < 0 || !havePx[i]) continue;
      const k = ((meanR[i] >> 4) << 8) | ((meanG[i] >> 4) << 4) | (meanB[i] >> 4);
      let b = buckets.get(k);
      if (!b) buckets.set(k, b = { n: 0, r: 0, g: 0, b: 0 });
      b.n++; b.r += meanR[i]; b.g += meanG[i]; b.b += meanB[i];
      total++;
    }
  return [...buckets.values()]
    .sort((a, b) => b.n - a.n).slice(0, 3)
    .filter(b => b.n >= total * 0.12)
    .map(b => [b.r / b.n, b.g / b.n, b.b / b.n]);
}

const CLASS_KEYS = ['land', 'open', 'stormy', 'reefs', 'fetid', 'crystal', 'kelp', 'icy',
  'cold', 'sunbaked', 'profane', 'scalding', 'cursed'];
const classIndex = Object.fromEntries(CLASS_KEYS.map((k, i) => [k, i]));

// Reference seeds. Different seas can render with the *same* water sprite yet
// carry different rules (kelp waters look like the southern shallows), so
// colour alone cannot classify — but the wiki's own sea labels give a dense
// spatial prior. Every sea label becomes a seed: hazard seas (per the Sailing
// hazards page) carry their hazard class, every other label is open water.
// A tile is claimed by the seed minimising colourDist + k * spatialDist:
// distinctive palettes (fetid murk) win on colour even far from their seed,
// colliding palettes fall back to nearest-sea Voronoi — which is how the sea
// regions are actually laid out.
const refs = []; // {cls, r, g, b, cx, cy}
{
  const hazardSeas = new Set();
  for (const h of Object.values(HAZARDS))
    for (const s of [...h.seeds, ...h.containerSeeds]) hazardSeas.add(`${s.x},${s.y}`);
  for (const s of openSeeds)
    for (const c of dominantColors(s.x, s.y))
      refs.push({ cls: classIndex.open, r: c[0], g: c[1], b: c[2], cx: s.x, cy: s.y });
  for (const s of seaLabels) {
    if (hazardSeas.has(`${s.x},${s.y}`)) continue;
    if (openSeeds.some(o => o.x === s.x && o.y === s.y)) continue;
    const cs = dominantColors(s.x, s.y);
    if (cs.length) refs.push({ cls: classIndex.open, r: cs[0][0], g: cs[0][1], b: cs[0][2], cx: s.x, cy: s.y });
  }
  // A hazard sea's own label can float in plain water too: the wiki lists
  // the Piscatoris Sea under crystal-flecked waters, but only its southern
  // reaches are crystal — the label sits in the open middle of the sea, and
  // seeding there teaches the classifier that plain blue means crystal (the
  // phantom that reached Drumstick Isle). Drop a sea's colour refs when they
  // all read as open water while its sibling seas wear a genuine hazard
  // palette. The sea keeps its name, flood seed and open-seed exclusion; its
  // hazardous parts still classify from the sibling refs.
  const near = (c, rs) => rs.reduce((d, r) => Math.min(d, Math.hypot(c[0] - r.r, c[1] - r.g, c[2] - r.b)), Infinity);
  const opens = refs.filter(r => r.cls === classIndex.open);
  for (const [key, h] of Object.entries(HAZARDS)) {
    const cols = h.seeds.map(s => dominantColors(s.x, s.y));
    const asRefs = cs => cs.map(c => ({ r: c[0], g: c[1], b: c[2] }));
    const dead = cols.map((cs, i) => {
      const sib = asRefs(cols.flatMap((c2, k) => k === i ? [] : c2));
      return sib.length > 0 && cs.length > 0 && cs.every(c => near(c, opens) + 6 < near(c, sib));
    });
    for (let i = 0; i < h.seeds.length; i++) {
      if (dead[i]) {
        // The label verifiably sits in open water, so let it anchor open
        // there: without a close open ref, a sibling sea's identical plain
        // tone (Zul-Egil's murk-boundary bucket) would claim the safe water
        // around this label from hundreds of tiles away.
        console.log(`  seed ${h.seeds[i].title} (${key}): open-water label, seeding open instead`);
        for (const c of cols[i])
          refs.push({ cls: classIndex.open, r: c[0], g: c[1], b: c[2], cx: h.seeds[i].x, cy: h.seeds[i].y });
        continue;
      }
      for (const c of cols[i])
        refs.push({ cls: classIndex[key], r: c[0], g: c[1], b: c[2], cx: h.seeds[i].x, cy: h.seeds[i].y });
    }
  }
  // Container oceans become extra seeds only when the water at their label
  // actually wears the hazard's palette. The Northern and Forgotten Ocean
  // labels sit in genuine icy/cold water that the listed seas don't spatially
  // cover; the Western, Ardent, Shrouded, Sunset and Eastern Ocean labels all
  // float over plain safe water, where a seed would mislabel open sea as
  // hazard (the "crystal waters east of Port Roberts" bug).
  for (const [key, h] of Object.entries(HAZARDS)) {
    h.keptContainers = [];
    const own = refs.filter(r => r.cls === classIndex[key]);
    const open = refs.filter(r => r.cls === classIndex.open);
    for (const s of h.containerSeeds) {
      const cs = dominantColors(s.x, s.y);
      const ok = cs.length && own.length && cs.every(c => near(c, own) + 6 < near(c, open));
      console.log(`  container ${s.title} (${key}): ${ok ? 'kept' : 'dropped'}`);
      if (!ok) continue;
      h.keptContainers.push(s);
      for (const c of cs) refs.push({ cls: classIndex[key], r: c[0], g: c[1], b: c[2], cx: s.x, cy: s.y });
    }
  }
}
console.log(`colour refs: ${refs.length}`);
for (const key of CLASS_KEYS.slice(1)) {
  const rs = refs.filter(r => r.cls === classIndex[key]);
  if (rs.length) console.log(`  ${key}: ${rs.map(r => `(${r.r | 0},${r.g | 0},${r.b | 0})`).slice(0, 4).join(' ')}${rs.length > 4 ? ` +${rs.length - 4}` : ''}`);
}

const MAX_COLOR_DIST = 30;   // colour distance beyond which a tile is land/obstacle
const SEED_RADIUS = 60;      // no spatial penalty this close to a seed
const SPATIAL_K = 0.08;      // colour-units of penalty per tile beyond the radius
const SEED_REACH = 520;      // a seed cannot claim tiles farther than this
const classGrid = new Uint8Array(W * H); // 0 = land/void
{
  for (let wy = 0; wy < H; wy++) {
    const gy = wy + WY0;
    for (let wx = 0; wx < W; wx++) {
      const i = wy * W + wx;
      if (!havePx[i]) continue;
      const gx = wx + WX0;
      let bestScore = Infinity, bestCls = 0, bestColorD = Infinity;
      for (const rf of refs) {
        const sx = gx - rf.cx, sy = gy - rf.cy;
        if (sx > SEED_REACH || sx < -SEED_REACH || sy > SEED_REACH || sy < -SEED_REACH) continue;
        const sd = Math.sqrt(sx * sx + sy * sy);
        if (sd > SEED_REACH) continue;
        const dr = meanR[i] - rf.r, dg = meanG[i] - rf.g, db = meanB[i] - rf.b;
        const cd = Math.sqrt(dr * dr + dg * dg + db * db);
        const score = cd + SPATIAL_K * Math.max(0, sd - SEED_RADIUS);
        if (score < bestScore) { bestScore = score; bestCls = rf.cls; bestColorD = cd; }
      }
      if (bestColorD <= MAX_COLOR_DIST) classGrid[i] = bestCls;
    }
  }
}

// despeckle: 1-2 tile "land" specks in open sea are classifier noise (wave
// sparkle, dapple tones outside the refs), not obstacles a boat cares about
// at 4-tile cell granularity — absorb them into the surrounding water class
for (let pass = 0; pass < 2; pass++) {
  let fixed = 0;
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      if (classGrid[i] !== 0 || !havePx[i]) continue;
      const counts = new Map();
      let water = 0;
      for (const o of [i - 1, i + 1, i - W, i + W, i - W - 1, i - W + 1, i + W - 1, i + W + 1]) {
        const c = classGrid[o];
        if (c > 0) { water++; counts.set(c, (counts.get(c) || 0) + 1); }
      }
      if (water >= 7) {
        let best = 0, bn = 0;
        for (const [c, n] of counts) if (n > bn) { best = c; bn = n; }
        classGrid[i] = best; fixed++;
      }
    }
  console.log(`despeckle pass ${pass + 1}: ${fixed} tiles`);
}

// dilate land by 2 tiles (boat clearance), then flood-fill the connected sea
// from the seed points so lakes and rivers drop out
const preDilate = classGrid.slice(); // undilated water, for harbour dredging below
{
  const blocked = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) blocked[i] = classGrid[i] === 0 ? 1 : 0;
  const dilated = new Uint8Array(blocked);
  const R = 2;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!blocked[y * W + x]) continue;
      for (let dy = -R; dy <= R; dy++)
        for (let dx = -R; dx <= R; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && nx < W && ny >= 0 && ny < H) dilated[ny * W + nx] = 1;
        }
    }
  const reach = new Uint8Array(W * H);
  const stack = [];
  for (const s of [...openSeeds, ...Object.values(HAZARDS).flatMap(h => [...h.seeds, ...h.keptContainers])]) {
    const i = tileAt(s.x, s.y);
    if (i >= 0 && !dilated[i]) stack.push(i);
  }
  while (stack.length) {
    const i = stack.pop();
    if (reach[i]) continue;
    reach[i] = 1;
    const x = i % W, y = (i / W) | 0;
    if (x > 0 && !dilated[i - 1] && !reach[i - 1]) stack.push(i - 1);
    if (x < W - 1 && !dilated[i + 1] && !reach[i + 1]) stack.push(i + 1);
    if (y > 0 && !dilated[i - W] && !reach[i - W]) stack.push(i - W);
    if (y < H - 1 && !dilated[i + W] && !reach[i + W]) stack.push(i + W);
  }
  let nav = 0;
  for (let i = 0; i < W * H; i++) {
    if (!reach[i]) classGrid[i] = 0;
    else nav++;
  }
  console.log(`navigable tiles: ${nav} (${(100 * nav / (W * H)).toFixed(1)}% of world)`);
}

// ---------------------------------------------------------------------------
// stage 4: POIs
// ---------------------------------------------------------------------------

// ports (mooring points)
const ports = [];
{
  const wt = await pageWikitext('Mooring point');
  for (const row of wt.split(/\n\|-/)) {
    const name = row.match(/\{\{(?:i|p)linkt?\|([^}|]+)/)?.[1]?.trim();
    const coord = row.match(/\{\{Map\|[^{}]*?\|(\d{3,4}),(\d{3,4})[^{}]*\}\}/);
    if (!name || !coord) continue;
    const level = +(row.match(/\n\|\s*(\d{1,2})\s*\n/)?.[1] ?? 1);
    const flags = [...row.matchAll(/\{\{(Okay|Not okay)\}\}/g)].map(m => m[1] === 'Okay');
    const reqM = row.split(/\n\|/).map(s => s.trim());
    // requirements cell: first non-template prose cell after the level
    let req = null;
    for (const cell of reqM) {
      if (/^Must |^Completion|^Partial|quest/i.test(stripWiki(cell))) { req = stripWiki(cell); break; }
    }
    ports.push({
      name, x: +coord[1], y: +coord[2], level, req,
      facilities: flags.length === 6
        ? { shipwright: flags[0], noticeBoard: flags[1], salvaging: flags[2], ledger: flags[3], crewRegistrar: flags[4], bank: flags[5] }
        : null,
    });
  }
  console.log(`ports: ${ports.length}`);
}

// shipwrecks
const wrecks = [];
{
  const wt = await pageWikitext('Shipwreck salvaging');
  for (const row of wt.split(/\n\|-/)) {
    const mapM = row.match(/\{\{Map\|([^{}]*)\}\}/);
    if (!mapM || !/group=/.test(mapM[1])) continue;
    const group = mapM[1].match(/group=([a-z]+)/i)?.[1] ?? 'unknown';
    const level = +(row.match(/\{\{SCP\|Sailing\|(\d+)/)?.[1] ?? row.match(/\n\|\s*(\d{1,2})\s*\n/)?.[1] ?? 0);
    const pts = [...mapM[1].matchAll(/(?:^|\|)(\d{3,4}),(\d{3,4})/g)].map(m => ({ x: +m[1], y: +m[2] }));
    if (pts.length) wrecks.push({ type: group, level: level || null, points: pts });
  }
  console.log(`shipwreck groups: ${wrecks.length} (${wrecks.reduce((n, w) => n + w.points.length, 0)} wrecks)`);
}

// sea services — hand-curated: these have no wiki table to scrape.
// The bank boat sits in the Barracuda Belt south of the Isle of Souls;
// position triangulated from the charting tasks and monster fields that
// name it ("near the bank boat", "north of the bank boat").
const services = [
  { name: 'Bank boat', kind: 'bank', x: 2280, y: 2535,
    desc: 'A full bank at sea — deposit salvage, draw supplies, and collect Grand Exchange purchases without ever disembarking.' },
];

// sea charting tasks — every page that transcludes {{SeaChartRow}}
const charting = [];
{
  const titles = new Set();
  for (let offset = 0; ;) {
    const d = await apiJSON(`chartsearch_${offset}`, {
      action: 'query', list: 'search', srsearch: 'insource:"SeaChartRow"', srlimit: 50, sroffset: offset,
    });
    for (const r of d.query.search) titles.add(r.title);
    if (!d.continue) break;
    offset = d.continue.sroffset;
  }
  console.log(`charting: scanning ${titles.size} pages...`);
  await pool([...titles], 8, async title => {
    const wt = await pageWikitext(title);
    if (!wt) return;
    for (const m of wt.matchAll(/\{\{SeaChartRow\|([^{}]*(?:\{\{[^{}]*\}\}[^{}]*)*)\}\}/g)) {
      const body = m[1];
      const get = k => body.match(new RegExp(`\\|\\s*${k}\\s*=\\s*([^|}]+)`))?.[1]?.trim();
      const loc = get('location')?.match(/(\d{3,4}),\s*(\d{3,4})/);
      if (!loc) continue;
      // tasks located inside caves carry the cave-plane offset (y + 6400 in
      // OSRS map space); fold them back onto the overworld spot they sit above
      let ty = +loc[2];
      if (ty > WY1 && ty - 6400 >= WY0 && ty - 6400 <= WY1) ty -= 6400;
      charting.push({
        task: stripWiki(body.split('|')[0]),
        level: +(get('level') ?? 0) || null,
        type: get('type') || null,
        hazard: get('hazard') || null,
        sea: get('sea') || null,
        ocean: get('ocean') || null,
        x: +loc[1], y: ty,
      });
    }
  });
  // the same row template can be transcluded on both a sea page and its ocean
  // page, sometimes with the task text trimmed differently — dedupe by spot,
  // type and level, keeping the fuller wording. This also keeps x,y,level
  // unique, which the pathfinder uses as the saved-progress key.
  const byKey = new Map();
  for (const t of charting) {
    const k = `${t.x},${t.y},${t.type},${t.level}`;
    const prev = byKey.get(k);
    if (!prev) byKey.set(k, t);
    else if ((t.task || '').length > (prev.task || '').length) prev.task = t.task;
  }
  charting.length = 0;
  charting.push(...byKey.values());
  console.log(`charting tasks: ${charting.length}`);
}

// trawling shoals — shoal pages linked from Deep sea trawling
const shoals = [];
{
  const wt = await pageWikitext('Deep sea trawling');
  const names = [...new Set([...wt.matchAll(/\[\[([A-Z][^\]|]*shoal)\]\]/gi)].map(m => m[1]))];
  for (const name of names) {
    const pw = await pageWikitext(name);
    if (!pw) { console.log(`  [warn] shoal page missing: ${name}`); continue; }
    const level = +(pw.match(/\{\{SCP\|Fishing\|(\d+)/)?.[1] ?? 0) || null;
    const pts = [];
    const mapM = [...pw.matchAll(/\{\{Map\|([^{}]*)\}\}/g)];
    for (const m of mapM)
      for (const c of m[1].matchAll(/(?:^|\|)(\d{3,4}),(\d{3,4})/g)) pts.push({ x: +c[1], y: +c[2] });
    if (!pts.length) {
      // fall back to the seas named on the page
      for (const l of pw.matchAll(/\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g)) {
        const s = seaByName.get(l[1].toLowerCase());
        if (s) pts.push({ x: s.x, y: s.y, approx: true });
      }
    }
    if (pts.length) shoals.push({ name, level, points: pts.slice(0, 12) });
    else console.log(`  [warn] no location for shoal: ${name}`);
  }
  console.log(`shoals: ${shoals.length}`);
}

// sea monsters (bounty creatures) — every creature the notice boards offer
// bounties on, with its hunting fields: each {{LocLine}} on the creature's
// page is a cluster of exact spawn points (a "field of krakens"), which the
// app renders as a danger area and the pathfinder steers around
const monsters = [];
{
  const bounty = await pageWikitext('Bounty tasks');
  const names = [...new Set([...bounty.matchAll(/monster=([^|}]+)/g)].map(m => m[1].trim()))];
  for (const title of names) {
    const wt = await pageWikitext(title);
    if (!wt) { console.log(`  [skip] no page: ${title}`); continue; }
    const combat = +(wt.match(/\|\s*combat\s*=\s*(\d+)/)?.[1] ?? 0) || null;
    // any variant with aggressive = Yes marks the creature as a ship-attacker;
    // the rest are harmless quarry (the app routes around attackers only)
    const aggressive = /\|\s*aggressive\d*\s*=\s*yes/i.test(wt);
    const fields = [];
    for (const m of wt.matchAll(/\{\{LocLine([\s\S]*?)\}\}/g)) {
      const body = m[1];
      const loc = stripWiki(body.match(/\|\s*location\s*=\s*([^\n|]*(?:\[\[[^\]]*\]\][^\n|]*)*)/)?.[1] ?? '');
      const level = +(body.match(/\|\s*levels\s*=\s*(\d+)/)?.[1] ?? 0) || combat;
      const pts = [];
      for (const c of body.matchAll(/\|(?:x:)?(\d{3,4}),(?:y:)?(\d{3,4})/g)) {
        const x = +c[1], y = +c[2];
        if (x >= WX0 && x < WX1 && y >= WY0 && y < WY1) pts.push([x, y]);
      }
      if (pts.length) fields.push({ name: loc || 'At sea', level, points: pts });
    }
    if (fields.length) monsters.push({
      name: title.replace(/ \((monster|sea|Sailing)\)/i, ''), combat, aggressive, fields,
    });
    else console.log(`  [warn] no spawn fields: ${title}`);
  }
  const nf = monsters.reduce((n, m) => n + m.fields.length, 0);
  const np = monsters.reduce((n, m) => n + m.fields.reduce((a, f) => a + f.points.length, 0), 0);
  console.log(`monsters: ${monsters.length} (${nf} fields, ${np} spawn points)`);
}

// ---------------------------------------------------------------------------
// stage 5: cell grid (4x4 tiles per cell), harbour dredging, outputs
// ---------------------------------------------------------------------------

const CELL = 4;
const CW = Math.ceil(W / CELL), CH = Math.ceil(H / CELL);
const cellClass = new Uint8Array(CW * CH);
{
  const counts = new Uint16Array(CLASS_KEYS.length);
  for (let cy = 0; cy < CH; cy++)
    for (let cx = 0; cx < CW; cx++) {
      counts.fill(0);
      let water = 0, total = 0;
      for (let dy = 0; dy < CELL; dy++)
        for (let dx = 0; dx < CELL; dx++) {
          const x = cx * CELL + dx, y = cy * CELL + dy;
          if (x >= W || y >= H) continue;
          total++;
          const c = classGrid[y * W + x];
          counts[c]++;
          if (c > 0) water++;
        }
      if (total && water >= total * 0.75) {
        let best = 1;
        for (let c = 2; c < CLASS_KEYS.length; c++) if (counts[c] > counts[best]) best = c;
        cellClass[cy * CW + cx] = best;
      }
    }
  let nav = 0;
  for (let i = 0; i < CW * CH; i++) if (cellClass[i]) nav++;
  console.log(`nav cells: ${nav}/${CW * CH} (${CW}x${CH})`);
}

// Harbour dredging. The 2-tile clearance dilation can seal genuinely sailable
// narrow approaches (Brimhaven's passage, the reef ring at Rainbow's End).
// Boats demonstrably dock at every mooring point, so for each port cut off
// from the main sea we carve the shortest channel that stays on undilated
// water — relaxing the clearance rule only where the game itself does.
{
  // undilated water fraction per cell
  const cellWater = new Uint8Array(CW * CH); // 1 = enough real water to dredge through
  const cellPre = new Uint8Array(CW * CH);   // majority pre-dilation class
  const counts = new Uint16Array(CLASS_KEYS.length);
  for (let cy = 0; cy < CH; cy++)
    for (let cx = 0; cx < CW; cx++) {
      counts.fill(0);
      let water = 0, total = 0;
      for (let dy = 0; dy < CELL; dy++)
        for (let dx = 0; dx < CELL; dx++) {
          const x = cx * CELL + dx, y = cy * CELL + dy;
          if (x >= W || y >= H) continue;
          total++;
          const c = preDilate[y * W + x];
          counts[c]++;
          if (c > 0) water++;
        }
      if (total && water >= total * 0.5) {
        cellWater[cy * CW + cx] = 1;
        let best = 1;
        for (let c = 2; c < CLASS_KEYS.length; c++) if (counts[c] > counts[best]) best = c;
        cellPre[cy * CW + cx] = best;
      }
    }

  // connectivity must mirror the app's movement model: 8-neighbour steps over
  // SAILABLE water only. Wall seas (eternal cold, sunbaked, ...) render on the
  // map but block routes, so water joined to the sea only through a wall is
  // landlocked for the pathfinder even though it looks connected here.
  const WALLS = new Set(Object.entries(HAZARDS)
    .filter(([, h]) => h.mode === 'wall').map(([k]) => classIndex[k]));
  const isSailable = i => cellClass[i] !== 0 && !WALLS.has(cellClass[i]);
  const mainComponent = () => {
    // largest 8-connected component of sailable water (walls stay comp -1)
    const comp = new Int32Array(CW * CH).fill(-1);
    let bestId = -1, bestSize = 0, id = 0;
    for (let s = 0; s < CW * CH; s++) {
      if (!isSailable(s) || comp[s] >= 0) continue;
      let size = 0;
      const stack = [s]; comp[s] = id;
      while (stack.length) {
        const i = stack.pop(); size++;
        const x = i % CW, y = (i / CW) | 0;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || nx >= CW || ny < 0 || ny >= CH) continue;
            const j = ny * CW + nx;
            if (isSailable(j) && comp[j] < 0) { comp[j] = id; stack.push(j); }
          }
      }
      if (size > bestSize) { bestSize = size; bestId = id; }
      id++;
    }
    return { comp, bestId };
  };

  let dredged = 0;
  for (const p of ports) {
    const { comp, bestId } = mainComponent();
    const pcx = Math.min(CW - 1, Math.max(0, Math.floor((p.x - WX0) / CELL)));
    const pcy = Math.min(CH - 1, Math.max(0, Math.floor((p.y - WY0) / CELL)));
    // the app snaps to the NEAREST navigable cell, so the port is only fine
    // if that nearest cell sits in the main sea (not a sealed harbour pocket)
    let nearest = -1, nd = Infinity;
    for (let dy = -10; dy <= 10; dy++)
      for (let dx = -10; dx <= 10; dx++) {
        const nx = pcx + dx, ny = pcy + dy;
        if (nx < 0 || nx >= CW || ny < 0 || ny >= CH || !isSailable(ny * CW + nx)) continue;
        const d = dx * dx + dy * dy;
        if (d < nd) { nd = d; nearest = ny * CW + nx; }
      }
    if (nearest >= 0 && comp[nearest] === bestId) continue;
    // BFS over undilated water from the port to the main component
    const prev = new Int32Array(CW * CH).fill(-2);
    const q = [];
    for (let dy = -8; dy <= 8; dy++)
      for (let dx = -8; dx <= 8; dx++) {
        const nx = pcx + dx, ny = pcy + dy;
        if (nx >= 0 && nx < CW && ny >= 0 && ny < CH && cellWater[ny * CW + nx] && prev[ny * CW + nx] === -2) {
          prev[ny * CW + nx] = -1; q.push(ny * CW + nx);
        }
      }
    let hit = -1;
    for (let qi = 0; qi < q.length && hit < 0 && qi < 40000; qi++) {
      const i = q[qi];
      if (cellClass[i] && comp[i] === bestId) { hit = i; break; }
      const x = i % CW, y = (i / CW) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || nx >= CW || ny < 0 || ny >= CH) continue;
        const j = ny * CW + nx;
        if (cellWater[j] && prev[j] === -2) { prev[j] = i; q.push(j); }
      }
    }
    if (hit < 0) { console.log(`  [warn] cannot dredge a channel to ${p.name}`); continue; }
    let n = 0;
    for (let i = hit; i >= 0; i = prev[i]) {
      // a dredged channel must be sailable — never assign a wall class
      const pre = cellPre[i];
      if (!cellClass[i]) { cellClass[i] = pre && !WALLS.has(pre) ? pre : classIndex.open; n++; }
    }
    dredged++;
    console.log(`  dredged ${n} cells to ${p.name}`);
  }
  console.log(`harbour dredging: ${dredged} ports connected`);

  // prune isolated pockets: keep only the main sea, so any snap in the app
  // lands on water a route can actually leave. A landlocked pocket is absorbed
  // whole into the wall sea that seals it off (it usually IS that sea, just
  // rendered in a plain-water colour), or turned to land when no wall borders
  // it. Wall cells themselves always stay — they are display-only.
  const { comp, bestId } = mainComponent();
  const pocketCells = new Map(); // comp id -> cell list
  for (let i = 0; i < CW * CH; i++) {
    if (!isSailable(i) || comp[i] === bestId || comp[i] < 0) continue;
    if (!pocketCells.has(comp[i])) pocketCells.set(comp[i], []);
    pocketCells.get(comp[i]).push(i);
  }
  let pruned = 0;
  for (const cells of pocketCells.values()) {
    const walls = new Map();
    for (const i of cells) {
      const x = i % CW, y = (i / CW) | 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || nx >= CW || ny < 0 || ny >= CH) continue;
          const c = cellClass[ny * CW + nx];
          if (WALLS.has(c)) walls.set(c, (walls.get(c) || 0) + 1);
        }
    }
    let into = 0, bn = 0;
    for (const [c, n] of walls) if (n > bn) { bn = n; into = c; }
    for (const i of cells) cellClass[i] = into;
    pruned += cells.length;
  }
  console.log(`absorbed ${pruned} landlocked water cells across ${pocketCells.size} pockets`);

  // drop ports with no navigable water in reach (interior docks like
  // Wyrmscraig Cavern live on other map planes and cannot be routed to)
  for (let pi = ports.length - 1; pi >= 0; pi--) {
    const pcx = Math.floor((ports[pi].x - WX0) / CELL), pcy = Math.floor((ports[pi].y - WY0) / CELL);
    let found = false;
    outer: for (let dy = -12; dy <= 12; dy++)
      for (let dx = -12; dx <= 12; dx++) {
        const nx = pcx + dx, ny = pcy + dy;
        if (nx >= 0 && nx < CW && ny >= 0 && ny < CH && cellClass[ny * CW + nx]) { found = true; break outer; }
      }
    if (!found) {
      console.log(`  [drop] port with no sea access: ${ports[pi].name}`);
      ports.splice(pi, 1);
    }
  }
}

// navcells.png — 1 px per cell, red = class index, rows top-down (north first)
{
  const png = new PNG({ width: CW, height: CH });
  for (let cy = 0; cy < CH; cy++)
    for (let cx = 0; cx < CW; cx++) {
      const o = ((CH - 1 - cy) * CW + cx) * 4;
      png.data[o] = cellClass[cy * CW + cx];
      png.data[o + 1] = 0; png.data[o + 2] = 0; png.data[o + 3] = 255;
    }
  writeFileSync(join(OUT, 'navcells.png'), PNG.sync.write(png));
}

// QA preview — classified world at cell resolution, tinted
{
  const tints = [[20, 20, 20], [40, 90, 200], [90, 90, 140], [200, 120, 60], [110, 140, 90],
    [150, 200, 230], [40, 120, 60], [220, 235, 245], [130, 170, 210], [230, 190, 90],
    [170, 90, 170], [230, 90, 40], [120, 60, 90]];
  const png = new PNG({ width: CW, height: CH });
  for (let cy = 0; cy < CH; cy++)
    for (let cx = 0; cx < CW; cx++) {
      const t = tints[cellClass[cy * CW + cx]];
      const o = ((CH - 1 - cy) * CW + cx) * 4;
      png.data[o] = t[0]; png.data[o + 1] = t[1]; png.data[o + 2] = t[2]; png.data[o + 3] = 255;
    }
  writeFileSync(join(CACHE, 'preview-classes.png'), PNG.sync.write(png));
}

// map.jpg
{
  const out = jpeg.encode({ data: tex, width: TEXW, height: TEXH }, 80);
  writeFileSync(join(OUT, 'map.jpg'), out.data);
  console.log(`map.jpg: ${TEXW}x${TEXH}, ${(out.data.length / 1e6).toFixed(1)} MB`);
}

// ---------------------------------------------------------------------------
// stage 6: naval.json
// ---------------------------------------------------------------------------

const naval = {
  generated: new Date().toISOString().slice(0, 10),
  mapVersion: MAP_VERSION,
  attribution: 'Data and map imagery from the Old School RuneScape Wiki (oldschool.runescape.wiki), CC BY-NC-SA 3.0. Map imagery derives from Old School RuneScape, intellectual property of Jagex Limited, used under the terms of Jagex’s Fan Content Policy (legal.jagex.com); not endorsed by or affiliated with Jagex.',
  world: { x0: WX0, y0: WY0, x1: WX1, y1: WY1 },
  cell: CELL,
  grid: { w: CW, h: CH },
  classes: CLASS_KEYS,
  hazards: Object.fromEntries(Object.entries(HAZARDS).map(([k, h]) => [k, {
    name: h.name, mode: h.mode, gate: h.gate ?? null,
    sailing: h.sailing ?? null, construction: h.construction ?? null,
    seas: [...(h.keptContainers ?? []), ...(h.seeds ?? [])].map(s => s.title),
  }])),
  hulls: [
    { name: 'Wooden / Oak hull', speed: 1.5, level: 1 },
    { name: 'Teak / Mahogany hull', speed: 2.0, level: 31 },
    { name: 'Camphor / Ironwood hull', speed: 2.5, level: 67 },
    { name: 'Rosewood hull', speed: 3.0, level: 90 },
  ],
  seas: seaLabels,
  ports, wrecks, services, charting, shoals, monsters,
};
writeFileSync(join(OUT, 'naval.json'), JSON.stringify(naval));
console.log(`naval.json: ${(JSON.stringify(naval).length / 1024).toFixed(0)} KB`);
console.log('done. QA previews in .naval-cache/');
