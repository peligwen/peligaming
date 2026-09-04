// Ground-truth sea collision from the Chart Plotter RuneLite plugin
// (github.com/Dazuzi/chart-plotter, BSD-2-Clause; notice in
// THIRD_PARTY_NOTICES.md). Shared by scripts/fetch-naval-data.mjs, which
// applies it on every rebuild, and scripts/merge-collision-seed.mjs, which
// re-applies it to the committed grid.
//
// Chart Plotter copies the game client's collision flags for every scene a
// player sails through and ships the merged capture as a seed file: one line
// per 8x8-tile chunk, `cx cy blocked` (all 64 tiles known) or
// `cx cy known blocked`, masks as 16 hex digits, plus a `data YYYY-MM-DD`
// version line. Bit i of a mask is tile (x & 7) + ((y & 7) << 3) of chunk
// (x >> 3, y >> 3). Three things to know before trusting it:
//   - only scenes someone actually sailed through are known; the rest is absent
//   - the client reports NO collision for map regions that do not exist, so
//     the void beyond the map edge reads as open water. Callers pass a void
//     test built from the wiki's map render, whose fill there is one colour.
//   - fetid pools are counted as blocked (the plugin routes around them); for
//     the pathfinder they are a hazard class, not a wall
//
// applyCollisionSeed() overrides the colour-classified cell grid only where
// the seed is certain, and keeps the generator's 2-tile clearance model:
//   - a land cell whose 4x4 tiles AND their 2-tile surround are all known open
//     water becomes water, with a class inferred from its neighbours. This is
//     where map labels and over-eroded coastlines had been read as land.
//   - a water cell whose 4x4 tiles are all blocked becomes land: a route
//     through solid rock (fetid cells excepted, see above)
//   - everything else — partial knowledge, mixed coast cells, void, wall
//     seas — keeps the colour classifier's answer
// Re-applying is a no-op. Cells the seed vouched for are reported back so the
// grid can carry a "verified" flag (navcells.png green channel) that later
// repairs must not paint over.

export const SEED = {
  repo: 'Dazuzi/chart-plotter',
  commit: '4d930c24b595ee1e3f996e1410075319243aa406',
  path: 'src/main/resources/com/chartplotter/collision.txt',
  license: 'BSD-2-Clause',
  copyright: 'Copyright (c) 2026, Dazuzi',
};

export const seedUrl = () => `https://raw.githubusercontent.com/${SEED.repo}/${SEED.commit}/${SEED.path}`;
export const seedCacheName = () => `collision-seed-${SEED.commit.slice(0, 12)}.txt`;

// The wiki's map render paints regions that do not exist in one flat colour
// (pure black where no tile was rendered at all).
export const VOID_RGB = [31, 46, 61];
export function isVoidColour(r, g, b, tol = 6) {
  return (Math.abs(r - VOID_RGB[0]) <= tol && Math.abs(g - VOID_RGB[1]) <= tol && Math.abs(b - VOID_RGB[2]) <= tol)
    || r + g + b <= 12;
}

export const UNKNOWN = 0, OPEN = 1, BLOCKED = 2;

// -> { version, chunks: Map<chunkKey, Uint8Array(64) of UNKNOWN/OPEN/BLOCKED>, tiles: { known, open, blocked } }
export function parseCollisionSeed(text) {
  const chunks = new Map();
  let version = null, known = 0, open = 0;
  const words = (hex) => {
    const h = hex.padStart(16, '0');
    return [parseInt(h.slice(0, 8), 16) >>> 0, parseInt(h.slice(8), 16) >>> 0]; // [hi, lo]
  };
  const bit = ([hi, lo], i) => (i < 32 ? (lo >>> i) : (hi >>> (i - 32))) & 1;
  for (const line of text.split('\n')) {
    const p = line.trim().split(/\s+/);
    if (p.length === 2 && p[0] === 'data') { version = p[1]; continue; }
    if (p.length !== 3 && p.length !== 4) continue;
    const cx = +p[0], cy = +p[1];
    if (!Number.isInteger(cx) || !Number.isInteger(cy) || cx < 0 || cy < 0) continue;
    const k = p.length === 4 ? words(p[2]) : [0xffffffff, 0xffffffff];
    const b = words(p[p.length - 1]);
    const states = new Uint8Array(64);
    for (let i = 0; i < 64; i++) {
      if (!bit(k, i)) continue;
      known++;
      if (bit(b, i)) states[i] = BLOCKED; else { states[i] = OPEN; open++; }
    }
    chunks.set(chunkKey(cx, cy), states);
  }
  return { version, chunks, tiles: { known, open, blocked: known - open } };
}

const chunkKey = (cx, cy) => cx * 65536 + cy;

export function tileState(seed, x, y) {
  if (x < 0 || y < 0) return UNKNOWN;
  const c = seed.chunks.get(chunkKey(x >> 3, y >> 3));
  return c ? c[(x & 7) + ((y & 7) << 3)] : UNKNOWN;
}

// Majority water class among the 8 neighbours (then the radius-2 ring).
// Sailable classes win over wall seas so an opened cell next to real water
// is always routable; a cell with only wall neighbours joins the wall (it is
// that sea, rendered in a plain colour); `open` when nothing nearby is water.
function inferClass(cellClass, CW, CH, cx, cy, walls, openClass) {
  for (const r of [1, 2]) {
    const sail = new Map(), wall = new Map();
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (!dx && !dy) continue;
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || nx >= CW || ny < 0 || ny >= CH) continue;
        const c = cellClass[ny * CW + nx];
        if (!c) continue;
        const m = walls.has(c) ? wall : sail;
        m.set(c, (m.get(c) || 0) + 1);
      }
    for (const counts of [sail, wall]) {
      let best = 0, bn = 0;
      for (const [c, n] of counts) if (n > bn) { bn = n; best = c; }
      if (best) return best;
    }
  }
  return openClass;
}

// Largest 8-connected component of sailable water is the sea; every other
// component is absorbed into the wall sea that borders it most, or land. The
// same rule the generator applies after dredging. Components larger than
// `maxAbsorb` are left alone and reported: those mean an override cut the
// sea in two, which needs a human look rather than a silent fill.
export function absorbPockets(cellClass, CW, CH, walls, { maxAbsorb = 400 } = {}) {
  const sailable = (i) => cellClass[i] !== 0 && !walls.has(cellClass[i]);
  const comp = new Int32Array(CW * CH).fill(-1);
  const sizes = [];
  for (let s = 0; s < CW * CH; s++) {
    if (!sailable(s) || comp[s] >= 0) continue;
    const id = sizes.length; let size = 0;
    const stack = [s]; comp[s] = id;
    while (stack.length) {
      const i = stack.pop(); size++;
      const x = i % CW, y = (i / CW) | 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || nx >= CW || ny < 0 || ny >= CH) continue;
          const j = ny * CW + nx;
          if (sailable(j) && comp[j] < 0) { comp[j] = id; stack.push(j); }
        }
    }
    sizes.push(size);
  }
  let main = -1, mainSize = 0;
  sizes.forEach((n, id) => { if (n > mainSize) { mainSize = n; main = id; } });
  const cells = new Map();
  for (let i = 0; i < CW * CH; i++)
    if (comp[i] >= 0 && comp[i] !== main) {
      if (!cells.has(comp[i])) cells.set(comp[i], []);
      cells.get(comp[i]).push(i);
    }
  const result = { pockets: 0, absorbed: 0, left: [] };
  for (const list of cells.values()) {
    if (list.length > maxAbsorb) { result.left.push(list.length); continue; }
    const border = new Map();
    for (const i of list) {
      const x = i % CW, y = (i / CW) | 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || nx >= CW || ny < 0 || ny >= CH) continue;
          const c = cellClass[ny * CW + nx];
          if (walls.has(c)) border.set(c, (border.get(c) || 0) + 1);
        }
    }
    let into = 0, bn = 0;
    for (const [c, n] of border) if (n > bn) { bn = n; into = c; }
    for (const i of list) cellClass[i] = into;
    result.pockets++; result.absorbed += list.length;
  }
  return result;
}

// Mutates cellClass in place. Returns { stats, verified: Uint8Array(CW*CH) }.
//   cellClass  Uint8Array, cellClass[cy*CW+cx], cy = 0 at the SOUTH edge
//   WX0/WY0    game-tile coordinate of cell (0,0)'s south-west tile
//   walls      Set of class indices whose seas are display-only walls
//   isVoidCell (cx, cy) -> true where the map render shows no world
export function applyCollisionSeed({
  cellClass, CW, CH, CELL, WX0, WY0, classes, walls, seed, isVoidCell,
  clearance = 2, absorb = true, log = () => {},
}) {
  const N = CELL * CELL;
  const fetid = classes.indexOf('fetid');
  const openClass = classes.indexOf('open');
  const verified = new Uint8Array(CW * CH);
  const before = cellClass.slice();
  const stats = {
    verified: 0, agree: 0, opened: 0, closed: 0,
    keptClearance: 0, keptFetid: 0, keptWall: 0, mixed: 0, partial: 0, void: 0,
  };
  const closedFrom = new Map();
  const bump = (m, k) => m.set(k, (m.get(k) || 0) + 1);
  let openedRaw = 0;

  for (let cy = 0; cy < CH; cy++)
    for (let cx = 0; cx < CW; cx++) {
      const i = cy * CW + cx;
      const tx0 = WX0 + cx * CELL, ty0 = WY0 + cy * CELL;
      let open = 0, blocked = 0;
      for (let dy = 0; dy < CELL; dy++)
        for (let dx = 0; dx < CELL; dx++) {
          const s = tileState(seed, tx0 + dx, ty0 + dy);
          if (s === OPEN) open++; else if (s === BLOCKED) blocked++;
        }
      if (open + blocked === 0) continue;                    // never captured
      if (open + blocked < N) { stats.partial++; continue; }  // half-known: no verdict
      if (isVoidCell(cx, cy)) { stats.void++; continue; }     // the client's "open" beyond the map edge
      verified[i] = 1; stats.verified++;
      const cls = cellClass[i];

      if (blocked === N) {                                    // solid rock
        if (cls === 0) { stats.agree++; continue; }
        if (walls.has(cls)) { stats.keptWall++; continue; }
        if (cls === fetid) { stats.keptFetid++; continue; }
        cellClass[i] = 0; stats.closed++; bump(closedFrom, classes[cls]);
        continue;
      }
      if (open === N) {                                       // clear water
        if (cls !== 0) { stats.agree++; continue; }
        let clear = true;
        outer: for (let dy = -clearance; dy < CELL + clearance; dy++)
          for (let dx = -clearance; dx < CELL + clearance; dx++) {
            if (dx >= 0 && dx < CELL && dy >= 0 && dy < CELL) continue;
            if (tileState(seed, tx0 + dx, ty0 + dy) !== OPEN) { clear = false; break outer; }
          }
        if (!clear) { stats.keptClearance++; continue; }       // inside the 2-tile clearance band
        cellClass[i] = inferClass(cellClass, CW, CH, cx, cy, walls, openClass);
        openedRaw++;
        continue;
      }
      stats.mixed++;                                          // coast: the clearance model decides
    }

  if (absorb) {
    const r = absorbPockets(cellClass, CW, CH, walls);
    stats.pocketsAbsorbed = r.pockets;
    if (r.left.length) stats.componentsLeft = r.left;
  }

  // net effect, so the numbers describe the grid rather than the pass: cells
  // the seed opened that stay landlocked under the clearance model were
  // absorbed straight back and are counted separately
  const openedBy = new Map();
  let lost = 0;
  for (let i = 0; i < CW * CH; i++) {
    if (before[i] === 0 && cellClass[i] !== 0) { stats.opened++; bump(openedBy, classes[cellClass[i]]); }
    else if (before[i] !== 0 && cellClass[i] === 0) lost++;
  }
  stats.landlocked = openedRaw - stats.opened;
  stats.absorbedExisting = lost - stats.closed;   // water->land beyond the rock closures
  stats.openedBy = Object.fromEntries(openedBy);
  stats.closedFrom = Object.fromEntries(closedFrom);

  log(`collision seed: ${stats.verified} cells verified, ${stats.agree} already agreed; `
    + `${stats.opened} opened (${[...openedBy].map(([k, n]) => `${n} ${k}`).join(', ') || 'none'}), `
    + `${stats.closed} closed as rock (${[...closedFrom].map(([k, n]) => `${n} ${k}`).join(', ') || 'none'})`);
  log(`  kept: ${stats.keptClearance} within clearance, ${stats.mixed} coast, ${stats.keptFetid} fetid, `
    + `${stats.keptWall} wall; skipped: ${stats.partial} half-known, ${stats.void} void`);
  if (absorb) {
    log(`  ${stats.pocketsAbsorbed} landlocked pockets absorbed`
      + (stats.absorbedExisting ? ` (${stats.absorbedExisting} previously-water cells among them)` : ''));
    if (stats.componentsLeft) log(`  [warn] large water component(s) left unattached: ${stats.componentsLeft.join(', ')} cells`);
  }
  return { stats, verified };
}
