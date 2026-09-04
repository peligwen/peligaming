// Re-apply the Chart Plotter collision seed (see scripts/lib/collision-seed.mjs)
// to the committed navigation grid:
//
//   public/tools/runescape/data/naval/navcells.png   red = class, green = seed-verified
//   public/tools/runescape/data/naval/naval.json     `collision` block + attribution
//
// fetch-naval-data.mjs applies the same override on every rebuild; this script
// re-applies it in place — after bumping SEED.commit to a newer capture, say —
// without refetching a thousand map tiles. Re-running is a no-op. The seed is
// cached under .naval-cache/ like everything else; pass --fresh to refetch.
// A QA preview lands in .naval-cache/preview-collision.png (green = opened,
// red = closed, light = verified unchanged, dark = the seed's void).
//
// Run from the repo root:  node scripts/merge-collision-seed.mjs [--fresh]

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import jpeg from 'jpeg-js';
import {
  SEED, seedUrl, seedCacheName, parseCollisionSeed, applyCollisionSeed, isVoidColour,
} from './lib/collision-seed.mjs';

const OUT = 'public/tools/runescape/data/naval';
const CACHE = '.naval-cache';
mkdirSync(CACHE, { recursive: true });

const nav = JSON.parse(readFileSync(join(OUT, 'naval.json'), 'utf8'));
const { x0: WX0, y0: WY0 } = nav.world;
const CELL = nav.cell, CW = nav.grid.w, CH = nav.grid.h;
const CLASS_KEYS = nav.classes;
const WALLS = new Set(Object.entries(nav.hazards)
  .filter(([, h]) => h.mode === 'wall').map(([k]) => CLASS_KEYS.indexOf(k)));

// ---------------------------------------------------------------- the seed
const cacheFile = join(CACHE, seedCacheName());
let text;
if (existsSync(cacheFile) && !process.argv.includes('--fresh')) {
  text = readFileSync(cacheFile, 'utf8');
} else {
  const res = await fetch(seedUrl(), {
    headers: { 'user-agent': 'peligaming naval pathfinder data build (github.com/peligwen/peligaming)' },
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) throw new Error(`collision seed fetch failed: HTTP ${res.status} for ${seedUrl()}`);
  text = await res.text();
  writeFileSync(cacheFile, text);
}
const seed = parseCollisionSeed(text);
if (!seed.version || !seed.chunks.size) throw new Error('collision seed did not parse');
console.log(`seed ${seed.version} from ${SEED.repo}@${SEED.commit.slice(0, 12)}: `
  + `${seed.chunks.size} chunks, ${seed.tiles.open} open / ${seed.tiles.blocked} blocked tiles`);

// ---------------------------------------------------------------- the grid
const png = PNG.sync.read(readFileSync(join(OUT, 'navcells.png')));
if (png.width !== CW || png.height !== CH) throw new Error(`navcells.png is ${png.width}x${png.height}, naval.json says ${CW}x${CH}`);
const cellClass = new Uint8Array(CW * CH);              // cy = 0 at the south edge
for (let cy = 0; cy < CH; cy++)
  for (let cx = 0; cx < CW; cx++) cellClass[cy * CW + cx] = png.data[((CH - 1 - cy) * CW + cx) * 4];
const before = cellClass.slice();

// void mask from the map render: a cell is void when nearly all of its pixels
// wear the render's "no world here" colour
const img = jpeg.decode(readFileSync(join(OUT, 'map.jpg')), { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 2048 });
const PX = Math.round(img.width / (CW * CELL));          // map.jpg pixels per game tile (2)
const SPAN = CELL * PX;                                   // pixels per cell edge
const voidCell = new Uint8Array(CW * CH);
for (let cy = 0; cy < CH; cy++)
  for (let cx = 0; cx < CW; cx++) {
    let n = 0;
    const py0 = (CH - 1 - cy) * SPAN, px0 = cx * SPAN;
    for (let y = 0; y < SPAN; y++)
      for (let x = 0; x < SPAN; x++) {
        const o = ((py0 + y) * img.width + px0 + x) * 4;
        if (isVoidColour(img.data[o], img.data[o + 1], img.data[o + 2])) n++;
      }
    if (n * 8 >= SPAN * SPAN * 7) voidCell[cy * CW + cx] = 1;
  }

// ---------------------------------------------------------------- apply
const { stats, verified } = applyCollisionSeed({
  cellClass, CW, CH, CELL, WX0, WY0, classes: CLASS_KEYS, walls: WALLS, seed,
  isVoidCell: (cx, cy) => voidCell[cy * CW + cx] === 1,
  log: console.log,
});
let changed = 0;
for (let i = 0; i < CW * CH; i++) if (cellClass[i] !== before[i]) changed++;

// ---------------------------------------------------------------- outputs
{
  const out = new PNG({ width: CW, height: CH });
  const preview = new PNG({ width: CW, height: CH });
  for (let cy = 0; cy < CH; cy++)
    for (let cx = 0; cx < CW; cx++) {
      const i = cy * CW + cx, o = ((CH - 1 - cy) * CW + cx) * 4;
      out.data[o] = cellClass[i]; out.data[o + 1] = verified[i]; out.data[o + 2] = 0; out.data[o + 3] = 255;
      let t;
      if (before[i] === 0 && cellClass[i] !== 0) t = [40, 220, 80];
      else if (before[i] !== 0 && cellClass[i] === 0) t = [230, 40, 40];
      else if (voidCell[i]) t = [10, 10, 10];
      else if (verified[i]) t = cellClass[i] ? [90, 150, 230] : [150, 150, 150];
      else t = cellClass[i] ? [25, 50, 90] : [40, 40, 40];
      preview.data[o] = t[0]; preview.data[o + 1] = t[1]; preview.data[o + 2] = t[2]; preview.data[o + 3] = 255;
    }
  writeFileSync(join(OUT, 'navcells.png'), PNG.sync.write(out));
  writeFileSync(join(CACHE, 'preview-collision.png'), PNG.sync.write(preview));
}

// naval.json records the pass that last changed the grid; a no-op re-run
// leaves it alone so the repo does not churn
if (changed || nav.collision?.commit !== SEED.commit) {
  const credit = 'Sea collision ground truth from the Chart Plotter RuneLite plugin by Dazuzi (github.com/Dazuzi/chart-plotter), BSD-2-Clause.';
  if (!nav.attribution.includes('Chart Plotter')) nav.attribution += ' ' + credit;
  nav.collision = {
    source: 'Chart Plotter RuneLite plugin collision seed',
    repo: SEED.repo, commit: SEED.commit, url: seedUrl(),
    seedVersion: seed.version, license: SEED.license, copyright: SEED.copyright,
    applied: new Date().toISOString().slice(0, 10),
    cells: stats,
  };
  writeFileSync(join(OUT, 'naval.json'), JSON.stringify(nav));
}
let navCells = 0;
for (let i = 0; i < CW * CH; i++) if (cellClass[i]) navCells++;
console.log(`grid: ${changed} cells changed, ${navCells}/${CW * CH} navigable. Preview in ${CACHE}/preview-collision.png`);
