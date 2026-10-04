#!/usr/bin/env node
// Builds the Gyro Courier's world — Chattanooga around Lovell Field (KCHA) —
// from two public sources into public/tools/irl/data/gyro-courier/:
//
//   height.bin   the terrain, 2048×1624 cells of 14.16 m: heights in 5 cm steps
//                above the minimum, predicted from the left, upper and
//                upper-left neighbours (as PNG's Paeth filter does), the
//                residuals as int16 split into a high-byte plane and a low-byte
//                plane, gzipped (a browser's DecompressionStream reads it)
//   cover.bin    the land cover, 4096×3248 cells of 7.08 m, one class per byte
//                (grass, forest, water, residential, commercial, industrial,
//                farmland, park, pavement, bare, scrub, rail) with every road
//                and apron painted in, gzipped
//   world.bin    the geometry, gzipped: every road and railway as a polyline,
//                every building footprint with its height and kind, as int16
//                half-metres, each vertex a delta from the one before
//   world.json   the index into world.bin, the airport (runways, taxiways,
//                aprons, the parking spot the flight starts from), every named
//                business and a sample of houses with the street point nearest
//                each one (where a delivery is landed), the bridges with their
//                deck heights, and the projection
//   minimap.jpg  a shaded 1024-wide map for the in-game map
//   imagery-*.jpg  USDA NAIP aerial imagery (public domain) in two layers: the
//                whole box at 7 m/px, the city and the airport at 3 m/px
//
// Sources:
//   - Terrain: the AWS Open Data "Terrain Tiles" (Mapzen Terrarium PNGs, in the
//     US from USGS 3DEP), zoom 14 (7.8 m/px), averaged onto the 14 m grid.
//   - Everything else: OpenStreetMap, through the Overpass API (the French
//     mirror first; others as fallbacks). © OpenStreetMap contributors, ODbL.
// Downloads are cached in .gyro-cache/; `--fresh` refetches everything.
//
//   node scripts/fetch-gyro-courier.mjs [--fresh]      (npm run data:gyro)

import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { PNG } from 'pngjs';
import jpeg from 'jpeg-js';

const OUT = 'public/tools/irl/data/gyro-courier';
const CACHE = '.gyro-cache';
const FRESH = process.argv.includes('--fresh');
const UA = 'peligaming gyro-courier data build (github.com/peligwen/peligaming)';
mkdirSync(CACHE, { recursive: true });
mkdirSync(OUT, { recursive: true });

// ------------------------------------------------------------ the world box
// A local tangent plane centred between downtown and the airport: x east, n
// north, in metres. The game's z axis is south (three.js), z = -n.
const LAT0 = 35.055, LON0 = -85.24;
const M_PER_DEG_LAT = 110942, M_PER_DEG_LON = 91230; // at 35.055° N
const HALF_X = 14500, HALF_N = 11500;               // 29 km × 23 km
const toLocal = (lat, lon) => [(lon - LON0) * M_PER_DEG_LON, (lat - LAT0) * M_PER_DEG_LAT];
const toLatLon = (x, n) => [LAT0 + n / M_PER_DEG_LAT, LON0 + x / M_PER_DEG_LON];
const BBOX = (() => {
  const [s, w] = toLatLon(-HALF_X, -HALF_N), [n, e] = toLatLon(HALF_X, HALF_N);
  return `${s.toFixed(4)},${w.toFixed(4)},${n.toFixed(4)},${e.toFixed(4)}`;
})();
console.log(`world box ${BBOX} (${2 * HALF_X / 1000} × ${2 * HALF_N / 1000} km)`);

const HM_COLS = 2048, HM_ROWS = 1624;                 // 14.16 m cells
const HM_CELL = (2 * HALF_X) / HM_COLS;
const CV_COLS = 4096, CV_ROWS = 3248;                 // 7.08 m cells
const CV_CELL = (2 * HALF_X) / CV_COLS;

// ------------------------------------------------------------ fetching
async function fetchRetry(url, init = {}, tries = 4) {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, { ...init, headers: { 'User-Agent': UA, ...(init.headers || {}) }, signal: AbortSignal.timeout(init.timeoutMs || 120000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (e) {
      if (attempt >= tries - 1) throw new Error(`${url}: ${e.message}`);
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
    }
  }
}
async function cachedBuffer(name, url, timeoutMs) {
  const file = join(CACHE, name);
  if (FRESH) rmSync(file, { force: true });
  if (!existsSync(file)) {
    const res = await fetchRetry(url, timeoutMs ? { timeoutMs } : {});
    writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
  return readFileSync(file);
}

const OVERPASS = [
  'https://overpass.openstreetmap.fr/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];
async function overpass(label, body) {
  const query = `[out:json][timeout:900][maxsize:1073741824];${body}`;
  const file = join(CACHE, `${label}-${createHash('sha1').update(query).digest('hex').slice(0, 10)}.json`);
  if (FRESH) rmSync(file, { force: true });
  if (!existsSync(file)) {
    let lastErr;
    for (const host of OVERPASS) {
      try {
        process.stdout.write(`  overpass ${label} ← ${new URL(host).hostname} … `);
        const t0 = Date.now();
        const res = await fetchRetry(host, { method: 'POST', body: new URLSearchParams({ data: query }), timeoutMs: 1000 * 1000 }, 1);
        const text = await res.text();
        const json = JSON.parse(text); // throws on the HTML error pages
        if (json.remark && /timed out|runtime error/i.test(json.remark)) throw new Error(json.remark);
        writeFileSync(file, text);
        console.log(`${(text.length / 1e6).toFixed(1)} MB in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
        break;
      } catch (e) {
        lastErr = e;
        console.log(`failed (${e.message.slice(0, 80)})`);
      }
    }
    if (!existsSync(file)) throw lastErr;
  }
  return JSON.parse(readFileSync(file, 'utf8')).elements;
}
// The box is fetched in strips so no single answer is unwieldy; a way that
// crosses a strip edge comes back in both and is kept once.
function strips(n) {
  const [s, w] = toLatLon(-HALF_X, -HALF_N), [no, e] = toLatLon(HALF_X, HALF_N);
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = s + ((no - s) * i) / n, b = s + ((no - s) * (i + 1)) / n;
    out.push(`${a.toFixed(5)},${w.toFixed(4)},${b.toFixed(5)},${e.toFixed(4)}`);
  }
  return out;
}
async function overpassStriped(label, bodyFor, n) {
  const seen = new Set(), out = [];
  for (const [i, bb] of strips(n).entries()) {
    for (const el of await overpass(`${label}-${i}`, bodyFor(bb))) {
      const key = `${el.type}/${el.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(el);
    }
  }
  return out;
}

// ------------------------------------------------------------ aerial imagery
// USDA's National Agriculture Imagery Program, public domain, served by the
// USGS National Map as an image service that reprojects on request. Asked
// for in plain latitude/longitude, with pixels square in degrees (the
// service keeps them so, widening any box that is not), the image maps
// linearly onto the game's grid: a pixel is one width in x and, by the
// ratio of a degree of latitude to one of longitude here, 1.216 of it in z.
// Two layers, each in four chunks the page composites: the whole box at the
// land cover's 7 m, and downtown to the airport at 3 m. The chunk JPEGs are
// kept as the service made them, so nothing is encoded twice.
const NAIP = 'https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPImagery/ImageServer/exportImage';
const NAIP_CREDIT = 'Aerial imagery: USDA National Agriculture Imagery Program (NAIP) via the USGS National Map (public domain)';
const IMAGERY = [
  // the whole box, on the land cover's 7.08 m in x (and 8.6 m in z, so 2 × 1336 rows cover the 23 km)
  { name: 'overview', centre: [0, 0], pxX: CV_CELL, cols: 2, rows: 2, chunk: [CV_COLS / 2, 1336], quality: 70 },
  // downtown to the airport, 4096 px at 3 m
  { name: 'city', centre: [-1000, 1800], pxX: 3, cols: 2, rows: 2, chunk: [2048, 2048], quality: 72 },
];
async function buildImagery() {
  console.log('aerial imagery: NAIP from the USGS National Map');
  const layers = [];
  for (const L of IMAGERY) {
    const [cw, ch] = L.chunk, deg = L.pxX / M_PER_DEG_LON, pxX = L.pxX, pxZ = deg * M_PER_DEG_LAT;
    const min = [L.centre[0] - (L.cols * cw * pxX) / 2, L.centre[1] - (L.rows * ch * pxZ) / 2];
    const max = [L.centre[0] + (L.cols * cw * pxX) / 2, L.centre[1] + (L.rows * ch * pxZ) / 2];
    for (let r = 0; r < L.rows; r++) for (let c = 0; c < L.cols; c++) {
      // the chunk's box in degrees, north up: row 0 is the north edge (z = -n)
      const [lat1, lon0] = toLatLon(min[0] + c * cw * pxX, -(min[1] + r * ch * pxZ));
      const w = lon0, e = lon0 + cw * deg, n = lat1, s = lat1 - ch * deg;
      const bbox = [w, s, e, n].map((v) => v.toFixed(8)).join(',');
      const query = `bbox=${bbox}&bboxSR=4326&imageSR=4326&size=${cw},${ch}&format=jpg&compressionQuality=${L.quality}&interpolation=RSP_BilinearInterpolation&renderingRule=${encodeURIComponent('{"rasterFunction":"NaturalColor"}')}`;
      const file = `imagery-${L.name}-${c}${r}.jpg`, key = `naip-${L.name}-${c}${r}-${createHash('sha1').update(query).digest('hex').slice(0, 10)}`;
      process.stdout.write(`  ${file} (${cw}×${ch} at ${pxX.toFixed(2)} × ${pxZ.toFixed(2)} m) … `);
      // the service says which box it will actually render; it must be the one asked for
      const info = JSON.parse((await cachedBuffer(`${key}.json`, `${NAIP}?${query}&f=json`, 600000)).toString());
      const ex = info.extent || {};
      const off = Math.max(Math.abs(ex.xmin - w), Math.abs(ex.xmax - e), Math.abs(ex.ymin - s), Math.abs(ex.ymax - n));
      if (!(off < deg * 0.5)) { rmSync(join(CACHE, `${key}.json`), { force: true }); throw new Error(`${file}: the service would render ${JSON.stringify(ex)} for ${bbox}`); }
      const t0 = Date.now();
      const buf = await cachedBuffer(`${key}.jpg`, `${NAIP}?${query}&f=image`, 600000);
      const dims = jpegSize(buf);
      if (!dims || dims[0] !== cw || dims[1] !== ch) { rmSync(join(CACHE, `${key}.jpg`), { force: true }); throw new Error(`${file}: not a ${cw}×${ch} JPEG (${dims ? dims.join('×') : buf.slice(0, 80).toString()})`); }
      writeFileSync(join(OUT, file), buf);
      console.log(`${(buf.length / 1e6).toFixed(2)} MB${Date.now() - t0 > 1000 ? ` in ${((Date.now() - t0) / 1000).toFixed(0)} s` : ''}`);
    }
    layers.push({ name: L.name, file: `imagery-${L.name}-{c}{r}.jpg`, cols: L.cols, rows: L.rows, chunk: L.chunk, min: min.map((v) => Math.round(v * 10) / 10), max: max.map((v) => Math.round(v * 10) / 10), px: [pxX, pxZ].map((v) => Math.round(v * 1000) / 1000) });
  }
  return { credit: NAIP_CREDIT, source: 'USGS National Map USGSNAIPImagery image service, NaturalColor, bilinear, in plain latitude/longitude', layers };
}
// the size in a JPEG's start-of-frame marker, without decoding it
function jpegSize(buf) {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  for (let i = 2; i + 9 < buf.length;) {
    if (buf[i] !== 0xff) return null;
    const m = buf[i + 1], len = buf.readUInt16BE(i + 2);
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return [buf.readUInt16BE(i + 7), buf.readUInt16BE(i + 5)];
    i += 2 + len;
  }
  return null;
}
if (process.argv.includes('--imagery')) { // only the imagery, patched into the world index already built
  const imagery = await buildImagery();
  const wj = join(OUT, 'world.json');
  const meta = JSON.parse(readFileSync(wj, 'utf8'));
  meta.imagery = imagery;
  meta.credits = [...meta.credits.filter((c) => !/aerial imagery/i.test(c)), NAIP_CREDIT];
  writeFileSync(wj, JSON.stringify(meta));
  console.log(`patched ${wj} with ${imagery.layers.length} imagery layers`);
  process.exit(0);
}

// ------------------------------------------------------------ terrain
const Z = 14;
const merc = (lat, lon) => {
  const n = 256 * 2 ** Z, la = (lat * Math.PI) / 180;
  return [((lon + 180) / 360) * n, ((1 - Math.log(Math.tan(la) + 1 / Math.cos(la)) / Math.PI) / 2) * n];
};
async function buildTerrain() {
  console.log('terrain: Terrarium tiles');
  const [s, w] = toLatLon(-HALF_X - 500, -HALF_N - 500), [n, e] = toLatLon(HALF_X + 500, HALF_N + 500);
  const [px0, py0] = merc(n, w), [px1, py1] = merc(s, e);
  const tx0 = Math.floor(px0 / 256), ty0 = Math.floor(py0 / 256), tx1 = Math.floor(px1 / 256), ty1 = Math.floor(py1 / 256);
  const W = (tx1 - tx0 + 1) * 256, H = (ty1 - ty0 + 1) * 256;
  const mosaic = new Float32Array(W * H);
  let count = 0;
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      const buf = await cachedBuffer(`terrarium-${Z}-${tx}-${ty}.png`, `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${Z}/${tx}/${ty}.png`);
      const png = PNG.sync.read(buf);
      for (let y = 0; y < 256; y++) {
        for (let x = 0; x < 256; x++) {
          const i = (y * 256 + x) * 4;
          mosaic[(ty - ty0) * 256 * W + (tx - tx0) * 256 + y * W + x] = png.data[i] * 256 + png.data[i + 1] + png.data[i + 2] / 256 - 32768;
        }
      }
      if (++count % 40 === 0) process.stdout.write(`  ${count} tiles\n`);
    }
  }
  console.log(`  ${count} tiles → mosaic ${W}×${H}`);
  const sample = (px, py) => {
    const x = Math.min(Math.max(px - tx0 * 256, 0), W - 1.001), y = Math.min(Math.max(py - ty0 * 256, 0), H - 1.001);
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    const a = mosaic[iy * W + ix], b = mosaic[iy * W + ix + 1], c = mosaic[(iy + 1) * W + ix], d = mosaic[(iy + 1) * W + ix + 1];
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
  };
  const grid = new Float32Array(HM_COLS * HM_ROWS);
  let hMin = Infinity, hMax = -Infinity;
  for (let j = 0; j < HM_ROWS; j++) {
    for (let i = 0; i < HM_COLS; i++) {
      let sum = 0;
      for (const [dx, dn] of [[-0.25, -0.25], [0.25, -0.25], [-0.25, 0.25], [0.25, 0.25]]) {
        const x = -HALF_X + (i + 0.5 + dx) * HM_CELL, nn = HALF_N - (j + 0.5 + dn) * HM_CELL;
        const [lat, lon] = toLatLon(x, nn);
        sum += sample(...merc(lat, lon));
      }
      const h = sum / 4;
      grid[j * HM_COLS + i] = h;
      if (h < hMin) hMin = h;
      if (h > hMax) hMax = h;
    }
  }
  console.log(`  heights ${hMin.toFixed(1)} … ${hMax.toFixed(1)} m`);
  const HSTEP = 0.05;
  const qz = new Int32Array(HM_COLS * HM_ROWS);
  for (let k = 0; k < qz.length; k++) qz[k] = Math.round((grid[k] - hMin) / HSTEP);
  const hi = Buffer.alloc(qz.length), lo = Buffer.alloc(qz.length);
  for (let j = 0; j < HM_ROWS; j++) for (let i = 0; i < HM_COLS; i++) {
    const k = j * HM_COLS + i;
    const a = i ? qz[k - 1] : 0, b = j ? qz[k - HM_COLS] : 0, c = i && j ? qz[k - HM_COLS - 1] : 0;
    const r = qz[k] - (a + b - c) + 32768;
    if (r < 0 || r > 65535) throw new Error('height residual out of range');
    hi[k] = r >> 8; lo[k] = r & 255;
  }
  writeFileSync(join(OUT, 'height.bin'), gzipSync(Buffer.concat([hi, lo]), { level: 9 }));
  const heightAt = (x, z) => { // x east, z south, bilinear, clamped
    const u = Math.min(Math.max(x + HALF_X, 0) / HM_CELL - 0.5, HM_COLS - 1.001), v = Math.min(Math.max(z + HALF_N, 0) / HM_CELL - 0.5, HM_ROWS - 1.001);
    const i = Math.floor(Math.max(u, 0)), j = Math.floor(Math.max(v, 0)), fx = Math.max(u, 0) - i, fy = Math.max(v, 0) - j;
    const a = grid[j * HM_COLS + i], b = grid[j * HM_COLS + Math.min(i + 1, HM_COLS - 1)], c = grid[Math.min(j + 1, HM_ROWS - 1) * HM_COLS + i], d = grid[Math.min(j + 1, HM_ROWS - 1) * HM_COLS + Math.min(i + 1, HM_COLS - 1)];
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
  };
  return { grid, hMin, hMax, heightAt, step: HSTEP };
}

// ------------------------------------------------------------ rasters
const COVER = ['grass', 'forest', 'water', 'residential', 'commercial', 'industrial', 'farmland', 'park', 'pavement', 'bare', 'scrub', 'rail'];
const C = Object.fromEntries(COVER.map((n, i) => [n, i]));
const cover = new Uint8Array(CV_COLS * CV_ROWS); // 0 = grass
const toPx = ([x, z]) => [(x + HALF_X) / CV_CELL, (z + HALF_N) / CV_CELL];
function fillRings(raster, W, H, rings, value) {
  let minY = Infinity, maxY = -Infinity;
  for (const r of rings) for (const p of r) { if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1]; }
  const y0 = Math.max(0, Math.ceil(minY - 0.5)), y1 = Math.min(H - 1, Math.floor(maxY - 0.5));
  const xs = [];
  for (let y = y0; y <= y1; y++) {
    const sy = y + 0.5;
    xs.length = 0;
    for (const r of rings) {
      for (let i = 0, m = r.length; i < m; i++) {
        const a = r[i], b = r[(i + 1) % m];
        if ((a[1] <= sy) !== (b[1] <= sy)) xs.push(a[0] + ((sy - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
      }
    }
    xs.sort((p, q) => p - q);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const xa = Math.max(0, Math.ceil(xs[i] - 0.5)), xb = Math.min(W - 1, Math.floor(xs[i + 1] - 0.5));
      for (let x = xa; x <= xb; x++) raster[y * W + x] = value;
    }
  }
}
function paintLine(raster, W, H, pts, widthPx, value) {
  const r = Math.max(widthPx / 2, 0.55);
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
    const len = Math.hypot(bx - ax, by - ay), steps = Math.max(1, Math.ceil(len / 0.5));
    for (let s = 0; s <= steps; s++) {
      const x = ax + ((bx - ax) * s) / steps, y = ay + ((by - ay) * s) / steps;
      const x0 = Math.max(0, Math.floor(x - r)), x1 = Math.min(W - 1, Math.ceil(x + r)), y0 = Math.max(0, Math.floor(y - r)), y1 = Math.min(H - 1, Math.ceil(y + r));
      for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) {
        if ((xx + 0.5 - x) ** 2 + (yy + 0.5 - y) ** 2 <= r * r) raster[yy * W + xx] = value;
      }
    }
  }
}

// ------------------------------------------------------------ OSM helpers
const local = (p) => { const [x, n] = toLocal(p.lat, p.lon); return [x, -n]; }; // → [x east, z south]
const inBox = ([x, z]) => Math.abs(x) <= HALF_X + 2000 && Math.abs(z) <= HALF_N + 2000;
const closed = (r) => r.length > 3 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1];
// Joins a relation's member ways into closed rings (outer and inner alike;
// the even-odd fill makes the holes).
function assembleRings(members) {
  const segs = members.filter((m) => m.type === 'way' && m.geometry && m.geometry.length > 1 && (m.role === 'outer' || m.role === 'inner' || !m.role)).map((m) => m.geometry.map((p) => [p.lat, p.lon]));
  const rings = [];
  const same = (a, b) => a[0] === b[0] && a[1] === b[1];
  while (segs.length) {
    let ring = segs.pop();
    let grew = true;
    while (!closed(ring) && grew) {
      grew = false;
      for (let i = 0; i < segs.length; i++) {
        const s = segs[i], last = ring[ring.length - 1], first = ring[0];
        if (same(last, s[0])) ring = ring.concat(s.slice(1));
        else if (same(last, s[s.length - 1])) ring = ring.concat(s.slice().reverse().slice(1));
        else if (same(first, s[s.length - 1])) ring = s.concat(ring.slice(1));
        else if (same(first, s[0])) ring = s.slice().reverse().concat(ring.slice(1));
        else continue;
        segs.splice(i, 1); grew = true; break;
      }
    }
    if (closed(ring)) rings.push(ring.map(([lat, lon]) => local({ lat, lon })));
  }
  return rings;
}
function ringsOf(el) {
  if (el.type === 'way') {
    if (!el.geometry || el.geometry.length < 4) return [];
    return [el.geometry.map(local)];
  }
  if (el.type === 'relation' && el.members) return assembleRings(el.members);
  return [];
}
function ringArea(r) { let a = 0; for (let i = 0, m = r.length; i < m; i++) { const p = r[i], q = r[(i + 1) % m]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; }
function centroid(rings) {
  const r = rings[0]; let cx = 0, cz = 0, a = 0;
  for (let i = 0, m = r.length; i < m; i++) { const p = r[i], q = r[(i + 1) % m]; const w = p[0] * q[1] - q[0] * p[1]; cx += (p[0] + q[0]) * w; cz += (p[1] + q[1]) * w; a += w; }
  if (Math.abs(a) < 1e-6) return [r.reduce((s, p) => s + p[0], 0) / r.length, r.reduce((s, p) => s + p[1], 0) / r.length];
  return [cx / (3 * a), cz / (3 * a)];
}
const num = (v) => { if (v == null) return null; const m = String(v).match(/-?\d+(\.\d+)?/); return m ? Number(m[0]) : null; };

// ------------------------------------------------------------ main
const terrain = await buildTerrain();

console.log('land cover: OSM areas');
const areas = await overpass('areas', `(
  way["landuse"](${BBOX}); relation["landuse"](${BBOX});
  way["natural"](${BBOX}); relation["natural"](${BBOX});
  way["leisure"~"^(park|golf_course|pitch|garden|nature_reserve|playground|recreation_ground|track|stadium|dog_park)$"](${BBOX});
  relation["leisure"~"^(park|golf_course|nature_reserve|recreation_ground)$"](${BBOX});
  way["amenity"~"^(parking|school|university|college|hospital|grave_yard)$"](${BBOX});
  way["aeroway"~"^(apron|runway|taxiway|helipad|terminal|hangar)$"](${BBOX});
  way["waterway"~"^(river|riverbank|canal|stream|dock)$"](${BBOX}); relation["waterway"](${BBOX});
  relation["water"](${BBOX});
  way["railway"~"^(rail|light_rail|preserved|narrow_gauge)$"](${BBOX});
  way["man_made"~"^(pier|breakwater)$"](${BBOX});
  way["highway"]["area"="yes"](${BBOX});
  way["water"](${BBOX});
); out tags geom;`);
console.log(`  ${areas.length} areas`);

// Paint order: the broad zoning first, then the specific things over it,
// water over all of those, and pavement last.
function coverClass(t) {
  if (!t) return null;
  if (t.natural === 'water' || t.water || t.waterway === 'riverbank' || t.waterway === 'dock' || t.landuse === 'reservoir' || t.landuse === 'basin') return C.water;
  if (t.natural === 'wood' || t.landuse === 'forest' || t.landuse === 'orchard') return C.forest;
  if (t.natural === 'scrub' || t.natural === 'heath') return C.scrub;
  if (t.natural === 'sand' || t.natural === 'beach' || t.natural === 'bare_rock' || t.natural === 'cliff' || t.natural === 'scree' || t.landuse === 'quarry' || t.landuse === 'brownfield' || t.landuse === 'construction') return C.bare;
  if (t.natural === 'grassland' || t.landuse === 'grass' || t.landuse === 'meadow' || t.landuse === 'village_green') return C.grass;
  if (t.landuse === 'farmland' || t.landuse === 'farmyard' || t.landuse === 'vineyard' || t.landuse === 'plant_nursery') return C.farmland;
  if (t.landuse === 'residential' || t.landuse === 'allotments') return C.residential;
  if (t.landuse === 'commercial' || t.landuse === 'retail' || t.landuse === 'education' || t.landuse === 'institutional' || t.amenity === 'school' || t.amenity === 'university' || t.amenity === 'college' || t.amenity === 'hospital') return C.commercial;
  if (t.landuse === 'industrial' || t.landuse === 'railway' || t.landuse === 'depot' || t.landuse === 'garages' || t.landuse === 'landfill' || t.landuse === 'port') return C.industrial;
  if (t.landuse === 'cemetery' || t.amenity === 'grave_yard' || t.landuse === 'recreation_ground' || t.landuse === 'religious' || t.leisure) return C.park;
  if (t.amenity === 'parking' || t.aeroway || (t.highway && t.area === 'yes') || t.man_made) return C.pavement;
  return null;
}
const ORDER = [C.residential, C.commercial, C.industrial, C.farmland, C.grass, C.park, C.scrub, C.bare, C.forest, C.water, C.pavement];
const painted = new Map();
for (const el of areas) {
  if (el.type === 'way' && el.tags.railway && el.geometry && el.geometry.length > 1 && !(el.tags.tunnel && el.tags.tunnel !== 'no')) {
    const line = el.geometry.map(local);
    if (line.some(inBox)) (painted.get(C.rail) || painted.set(C.rail, []).get(C.rail)).push({ line, w: 4 });
    continue;
  }
  const cls = coverClass(el.tags);
  if (cls == null) continue;
  const rings = ringsOf(el).filter((r) => r.some(inBox));
  if (!rings.length) continue;
  // a riverbank way is a polygon; a river way is a line, drawn 20 m wide
  if (el.type === 'way' && el.tags.waterway && !el.tags.water && el.tags.waterway !== 'riverbank' && el.tags.waterway !== 'dock' && !el.tags.area) {
    const w = el.tags.waterway === 'river' ? 25 : el.tags.waterway === 'canal' ? 12 : 4;
    (painted.get(C.water) || painted.set(C.water, []).get(C.water)).push({ line: el.geometry.map(local), w });
    continue;
  }
  if (el.type === 'way' && !closed(el.geometry.map((p) => [p.lat, p.lon]))) continue; // an unclosed way is no area
  (painted.get(cls) || painted.set(cls, []).get(cls)).push({ rings });
}
for (const cls of ORDER) {
  for (const a of painted.get(cls) || []) {
    if (a.rings) fillRings(cover, CV_COLS, CV_ROWS, a.rings.map((r) => r.map(toPx)), cls);
    else paintLine(cover, CV_COLS, CV_ROWS, a.line.map(toPx), a.w / CV_CELL, cls);
  }
}
for (const a of painted.get(C.rail) || []) paintLine(cover, CV_COLS, CV_ROWS, a.line.map(toPx), a.w / CV_CELL, C.rail);

// ------------------------------------------------------------ the aerodrome
// No trees on the airport: inside the aerodrome's polygon the wooded and
// scrub cover becomes grass (so neither the canopy nor the forest texture
// appears there), and the page keeps its tree scatter out of the polygon.
console.log('airport: the aerodrome polygon');
const aerodromes = await overpass('aerodrome', `(way["aeroway"="aerodrome"]["icao"="KCHA"](${BBOX}); relation["aeroway"="aerodrome"]["icao"="KCHA"](${BBOX});); out tags geom;`);
let airportBounds = null;
for (const el of aerodromes) {
  if (!el.tags || el.tags.aeroway !== 'aerodrome') continue;
  const rings = ringsOf(el).filter((r) => r.some(inBox));
  if (!rings.length) continue;
  const ring = rings.reduce((a, b) => (Math.abs(ringArea(b)) > Math.abs(ringArea(a)) ? b : a));
  airportBounds = simplifyRing(ring, 2);
  const mask = new Uint8Array(CV_COLS * CV_ROWS);
  fillRings(mask, CV_COLS, CV_ROWS, [ring.map(toPx)], 1);
  let n = 0;
  for (let i = 0; i < mask.length; i++) if (mask[i] && (cover[i] === C.forest || cover[i] === C.scrub)) { cover[i] = C.grass; n++; }
  console.log(`  ${el.tags.name || el.id}: ${airportBounds.length} vertices, ${(Math.abs(ringArea(ring)) / 1e4).toFixed(0)} ha, ${n} wooded cells cleared`);
  break;
}
if (!airportBounds) console.warn('  no aerodrome polygon found: the page cannot keep trees off the airport');

// ------------------------------------------------------------ roads
console.log('roads: OSM highways');
const highways = await overpassStriped('highways', (bb) => `way["highway"](${bb}); out tags geom;`, 3);
console.log(`  ${highways.length} ways`);
const ROAD_CLASSES = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'residential', 'unclassified', 'service', 'living_street', 'track', 'pedestrian'];
const ROAD_WIDTH = [12, 11, 11, 9.5, 8.5, 7, 7, 4.5, 6, 3, 4];
const LANDABLE = new Set([0, 1, 2, 3, 4, 5, 6, 8]);
function roadClass(t) {
  let h = t.highway;
  if (h.endsWith('_link')) h = h.slice(0, -5);
  if (h === 'road') h = 'unclassified';
  const i = ROAD_CLASSES.indexOf(h);
  return i;
}
const names = []; const nameIdx = new Map();
const nameId = (n) => { if (!n) return 0; if (!nameIdx.has(n)) { nameIdx.set(n, names.length + 1); names.push(n); } return nameIdx.get(n); };
const roads = []; // {c, w, name, pts:[[x,z]...], bridge, layer}
for (const el of highways) {
  const t = el.tags;
  if (!el.geometry || el.geometry.length < 2 || t.area === 'yes') continue;
  const c = roadClass(t);
  if (c < 0) continue;
  if (t.tunnel && t.tunnel !== 'no') continue;
  if (t.layer && Number(t.layer) < 0 && !t.bridge) continue;
  const pts = el.geometry.map(local);
  if (!pts.some(inBox)) continue;
  let w = ROAD_WIDTH[c];
  if (t.highway.endsWith('_link')) w = 7;
  const lanes = num(t.lanes);
  if (lanes && lanes > 0 && lanes < 12) w = lanes * 3.5 + (c <= 2 ? 2 : 0.5);
  const tw = num(t.width);
  if (tw && tw > 2 && tw < 40) w = tw;
  if (t.oneway === 'yes' && c === 0 && !lanes) w = 11;
  roads.push({ c, w, name: t.name || t.ref || '', pts, bridge: !!(t.bridge && t.bridge !== 'no'), surface: t.surface || '' });
}
console.log(`  ${roads.length} drawn`);
// paint them, pavement last so it reads over everything
for (const r of roads) paintLine(cover, CV_COLS, CV_ROWS, r.pts.map(toPx), r.w / CV_CELL, r.c === 9 ? C.bare : C.pavement);

// bridges: the deck runs straight between the heights at its two ends (the
// terrain is bare earth, so a deck over water would otherwise lie in the river)
const bridges = [];
for (const r of roads) {
  if (!r.bridge) continue;
  const h0 = terrain.heightAt(...r.pts[0]), h1 = terrain.heightAt(...r.pts[r.pts.length - 1]);
  let total = 0; const cum = [0];
  for (let i = 1; i < r.pts.length; i++) { total += Math.hypot(r.pts[i][0] - r.pts[i - 1][0], r.pts[i][1] - r.pts[i - 1][1]); cum.push(total); }
  if (total < 15) continue;
  const clearance = total > 200 ? 6 : 2.5; // a long span over a river stands well above the banks
  r.deck = r.pts.map((p, i) => { const f = total ? cum[i] / total : 0; const base = h0 * (1 - f) + h1 * f; return Math.max(base, terrain.heightAt(...p)) + clearance * Math.sin(Math.PI * f) * 0.5 + clearance * 0.5; });
  bridges.push({ w: Math.round(r.w * 10) / 10, p: r.pts.map((p, i) => [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10, Math.round(r.deck[i] * 10) / 10]).flat() });
}
console.log(`  ${bridges.length} bridges`);

// a grid of road segments for "nearest landable street" lookups
const SEG_CELL = 250;
const segGrid = new Map();
const segKey = (x, z) => `${Math.floor(x / SEG_CELL)},${Math.floor(z / SEG_CELL)}`;
roads.forEach((r, ri) => {
  if (!LANDABLE.has(r.c) || r.bridge) return;
  for (let i = 0; i + 1 < r.pts.length; i++) {
    const a = r.pts[i], b = r.pts[i + 1];
    const keys = new Set([segKey(...a), segKey(...b), segKey((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)]);
    for (const k of keys) (segGrid.get(k) || segGrid.set(k, []).get(k)).push([ri, i]);
  }
});
function nearestStreet([x, z], maxDist) {
  let best = null;
  const cx = Math.floor(x / SEG_CELL), cz = Math.floor(z / SEG_CELL), reach = Math.ceil(maxDist / SEG_CELL);
  for (let i = -reach; i <= reach; i++) for (let j = -reach; j <= reach; j++) {
    for (const [ri, si] of segGrid.get(`${cx + i},${cz + j}`) || []) {
      const r = roads[ri], a = r.pts[si], b = r.pts[si + 1];
      const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz;
      let t = L2 ? ((x - a[0]) * dx + (z - a[1]) * dz) / L2 : 0; t = Math.max(0, Math.min(1, t));
      const px = a[0] + t * dx, pz = a[1] + t * dz, d = Math.hypot(px - x, pz - z);
      // prefer a real street over a service lane by a margin
      const score = d + (r.c === 7 ? 40 : 0) + (r.c === 0 || r.c === 1 ? 25 : 0);
      if (d <= maxDist && (!best || score < best.score)) best = { score, d, x: px, z: pz, heading: ((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360, name: r.name, cls: r.c, ri };
    }
  }
  return best;
}

// ------------------------------------------------------------ buildings
console.log('buildings: OSM footprints');
const bways = await overpassStriped('buildings', (bb) => `way["building"](${bb}); out tags geom;`, 6);
const brels = await overpass('building-relations', `relation["building"](${BBOX}); out tags geom;`);
console.log(`  ${bways.length} ways, ${brels.length} relations`);
const KINDS = ['house', 'apartments', 'commercial', 'industrial', 'office', 'civic', 'church', 'school', 'hangar', 'other', 'garage', 'retail'];
const K = Object.fromEntries(KINDS.map((n, i) => [n, i]));
const HOUSE_TYPES = new Set(['house', 'detached', 'residential', 'semidetached_house', 'terrace', 'bungalow', 'static_caravan', 'cabin', 'farm']);
function coverAt([x, z]) { const i = Math.floor((x + HALF_X) / CV_CELL), j = Math.floor((z + HALF_N) / CV_CELL); if (i < 0 || j < 0 || i >= CV_COLS || j >= CV_ROWS) return 0; return cover[j * CV_COLS + i]; }
function buildingKind(t, area, c) {
  const b = t.building;
  if (HOUSE_TYPES.has(b)) return K.house;
  if (b === 'apartments' || b === 'dormitory' || b === 'hotel') return K.apartments;
  if (b === 'garage' || b === 'garages' || b === 'shed' || b === 'carport' || b === 'roof' || b === 'hut') return K.garage;
  if (b === 'industrial' || b === 'warehouse' || b === 'manufacture' || b === 'service' || b === 'storage_tank' || b === 'silo') return K.industrial;
  if (b === 'office' || t.office) return K.office;
  if (b === 'retail' || b === 'supermarket' || b === 'kiosk' || t.shop) return K.retail;
  if (b === 'commercial' || t.amenity === 'restaurant' || t.amenity === 'fast_food' || t.amenity === 'bank' || t.amenity === 'fuel') return K.commercial;
  if (b === 'church' || b === 'chapel' || b === 'cathedral' || b === 'religious' || t.amenity === 'place_of_worship') return K.church;
  if (b === 'school' || b === 'university' || b === 'college' || b === 'kindergarten' || t.amenity === 'school') return K.school;
  if (b === 'hangar' || t.aeroway === 'hangar') return K.hangar;
  if (b === 'civic' || b === 'public' || b === 'hospital' || b === 'government' || b === 'fire_station' || b === 'train_station' || b === 'transportation' || b === 'terminal' || t.aeroway === 'terminal') return K.civic;
  // untyped: small inside residential zoning is a house, large is a shed of commerce
  if (c === C.residential && area < 350) return K.house;
  if (c === C.industrial) return K.industrial;
  if (c === C.commercial && area > 250) return K.commercial;
  if (area < 60) return K.garage;
  if (area < 300 && c !== C.commercial) return K.house;
  return K.other;
}
function buildingHeight(t, kind, area, rng) {
  const h = num(t.height), lv = num(t['building:levels']);
  if (h && h > 2 && h < 300) return h;
  if (lv && lv > 0 && lv < 80) return lv * (kind === K.industrial ? 4.5 : kind === K.office ? 3.8 : 3.1) + 1;
  switch (kind) {
    case K.house: return 4.2 + rng() * 3.2;          // one or two storeys with a roof
    case K.garage: return 2.8 + rng() * 0.8;
    case K.apartments: return 8 + rng() * 10;
    case K.industrial: return area > 3000 ? 10 + rng() * 4 : 7 + rng() * 3;
    case K.office: return area > 1500 ? 14 + rng() * 14 : 8 + rng() * 6;
    case K.retail: return 5.5 + rng() * 2;
    case K.commercial: return area > 2000 ? 7 + rng() * 3 : 5 + rng() * 3;
    case K.church: return 9 + rng() * 5;
    case K.school: return 6 + rng() * 4;
    case K.hangar: return 9 + rng() * 4;
    case K.civic: return 8 + rng() * 6;
    default: return 4.5 + rng() * 3;
  }
}
let seed = 12345; const rng = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const buildings = []; // {ring:[[x,z]], h, kind, tags, area}
// Douglas-Peucker on an open polyline: the vertices that keep it within tol
function simplifyLine(pts, tol) {
  if (pts.length <= 2) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const ax = pts[a][0], az = pts[a][1], dx = pts[b][0] - ax, dz = pts[b][1] - az, L = Math.hypot(dx, dz);
    let md = -1, mi = -1;
    for (let i = a + 1; i < b; i++) {
      const d = L > 1e-9 ? Math.abs(dx * (az - pts[i][1]) - (ax - pts[i][0]) * dz) / L : Math.hypot(pts[i][0] - ax, pts[i][1] - az);
      if (d > md) { md = d; mi = i; }
    }
    if (mi > 0 && md > tol) { keep[mi] = 1; stack.push([a, mi], [mi, b]); }
  }
  return pts.filter((p, i) => keep[i]);
}
function simplifyRing(r, tol = 0.35) { // closed ring given open (no repeat)
  let pts = [];
  for (const p of r) { const q = pts[pts.length - 1]; if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > 0.3) pts.push(p); }
  if (pts.length > 1 && Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) <= 0.3) pts.pop();
  if (pts.length < 4) return pts;
  // split at the vertex farthest from the first, simplify both halves
  let far = 1, fd = -1;
  for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[0][0], pts[i][1] - pts[0][1]); if (d > fd) { fd = d; far = i; } }
  const a = simplifyLine(pts.slice(0, far + 1), tol), b = simplifyLine(pts.slice(far).concat([pts[0]]), tol);
  return a.concat(b.slice(1, -1));
}
for (const el of [...bways, ...brels]) {
  const t = el.tags || {};
  if (!t.building || t.building === 'no') continue;
  if (t.layer && Number(t.layer) < 0) continue;
  const rings = ringsOf(el);
  if (!rings.length) continue;
  // the outer ring only; the few courtyards are not worth the holes
  let ring = rings.reduce((a, b) => (Math.abs(ringArea(b)) > Math.abs(ringArea(a)) ? b : a));
  ring = simplifyRing(ring.slice(0, -1));
  if (ring.length < 3) continue;
  if (!ring.some(inBox)) continue;
  if (ring.some((p) => Math.abs(p[0]) > HALF_X + 100 || Math.abs(p[1]) > HALF_N + 100)) continue;
  const area = Math.abs(ringArea(ring));
  if (area < 12) continue;
  if (ringArea(ring) < 0) ring.reverse(); // consistent winding (clockwise in x-east/z-south = counter-clockwise seen from above)
  const c = coverAt(centroid([ring]));
  const kind = buildingKind(t, area, c);
  buildings.push({ ring, h: buildingHeight(t, kind, area, rng), kind, tags: t, area, center: centroid([ring]) });
}
console.log(`  ${buildings.length} buildings kept`);

// ------------------------------------------------------------ airport
console.log('airport: KCHA');
const aero = areas.filter((e) => e.tags && e.tags.aeroway);
const runways = [], taxiways = [], aprons = [];
for (const el of aero) {
  const t = el.tags, pts = el.geometry ? el.geometry.map(local) : [];
  if (!pts.length || !pts.some(inBox)) continue;
  if (t.aeroway === 'runway' && pts.length >= 2) runways.push({ ref: t.ref || '', w: num(t.width) || 45, pts: [pts[0], pts[pts.length - 1]] });
  else if (t.aeroway === 'taxiway' && pts.length >= 2) taxiways.push({ ref: t.ref || '', w: num(t.width) || 15, pts });
  else if (t.aeroway === 'apron') aprons.push(pts);
}
// the runways' own strips are painted as pavement with their width
for (const r of runways) paintLine(cover, CV_COLS, CV_ROWS, r.pts.map(toPx), r.w / CV_CELL, C.pavement);
for (const r of taxiways) paintLine(cover, CV_COLS, CV_ROWS, r.pts.map(toPx), r.w / CV_CELL, C.pavement);
const kcha = runways.filter((r) => Math.hypot(r.pts[0][0] - toLocal(35.0353, -85.2038)[0], r.pts[0][1] + toLocal(35.0353, -85.2038)[1]) < 3000);
const rwMid = kcha.length ? kcha.map((r) => [(r.pts[0][0] + r.pts[1][0]) / 2, (r.pts[0][1] + r.pts[1][1]) / 2]) : [[(() => { const [x] = toLocal(35.0353, -85.2038); return x; })(), -toLocal(35.0353, -85.2038)[1]]];
const arp = rwMid.reduce((a, b) => [a[0] + b[0] / rwMid.length, a[1] + b[1] / rwMid.length], [0, 0]);
// The flight starts on the general-aviation ramp, east of runway 2/20 and
// north of the terminal, on the apron nearest that corner, pointed at the
// taxiway. (35.0385 N, 85.1995 W is the Wilson Air Center ramp.)
const startLL = toLocal(35.0386, -85.1996);
let start = { x: startLL[0], z: -startLL[1], heading: 200 };
{ // snap onto the nearest apron pixel so we never start on grass
  let best = null;
  for (let dz = -60; dz <= 60; dz += 6) for (let dx = -60; dx <= 60; dx += 6) {
    const p = [start.x + dx, start.z + dz];
    if (coverAt(p) === C.pavement) { const d = Math.hypot(dx, dz); if (!best || d < best.d) best = { d, p }; }
  }
  if (best) { start.x = best.p[0]; start.z = best.p[1]; }
}
console.log(`  ${runways.length} runways, ${taxiways.length} taxiways, ${aprons.length} aprons; ARP at ${arp.map((v) => v.toFixed(0))}, start at ${start.x.toFixed(0)},${start.z.toFixed(0)} (${coverAt([start.x, start.z]) === C.pavement ? 'pavement' : 'not pavement!'})`);

// ------------------------------------------------------------ businesses and houses
console.log('places: OSM businesses');
const pois = await overpass('pois', `(
  nwr["shop"]["name"](${BBOX});
  nwr["amenity"~"^(restaurant|cafe|fast_food|bar|pub|biergarten|food_court|ice_cream|bank|pharmacy|fuel|dentist|doctors|clinic|hospital|veterinary|post_office|library|cinema|theatre|car_wash|car_rental|car_repair|marketplace|nightclub|coworking_space|animal_shelter|childcare|community_centre|courthouse|townhall|fire_station|police)$"]["name"](${BBOX});
  nwr["office"]["name"](${BBOX});
  nwr["craft"]["name"](${BBOX});
  nwr["tourism"~"^(hotel|motel|museum|attraction|gallery|zoo|aquarium|theme_park|guest_house|hostel)$"]["name"](${BBOX});
  nwr["healthcare"]["name"](${BBOX});
); out tags center;`);
function poiKind(t) {
  if (t.amenity === 'restaurant' || t.amenity === 'fast_food' || t.amenity === 'food_court' || t.shop === 'bakery' || t.shop === 'deli' || t.shop === 'pastry') return 'food';
  if (t.amenity === 'cafe' || t.shop === 'coffee' || t.shop === 'tea') return 'cafe';
  if (t.amenity === 'bar' || t.amenity === 'pub' || t.amenity === 'biergarten' || t.amenity === 'nightclub' || t.shop === 'alcohol' || t.shop === 'wine' || t.craft === 'brewery' || t.craft === 'distillery') return 'drink';
  if (t.amenity === 'ice_cream' || t.shop === 'ice_cream' || t.shop === 'confectionery' || t.shop === 'chocolate') return 'sweets';
  if (t.amenity === 'pharmacy' || t.shop === 'chemist' || t.healthcare === 'pharmacy') return 'pharmacy';
  if (t.amenity === 'dentist' || t.amenity === 'doctors' || t.amenity === 'clinic' || t.amenity === 'hospital' || t.amenity === 'veterinary' || t.healthcare) return 'medical';
  if (t.amenity === 'bank' || t.office === 'insurance' || t.office === 'financial' || t.office === 'accountant' || t.office === 'lawyer' || t.amenity === 'courthouse' || t.amenity === 'townhall') return 'papers';
  if (t.amenity === 'fuel' || t.shop === 'car_parts' || t.shop === 'car_repair' || t.amenity === 'car_repair' || t.shop === 'tyres' || t.shop === 'car' || t.shop === 'motorcycle' || t.amenity === 'car_wash') return 'auto';
  if (t.shop === 'florist' || t.shop === 'garden_centre') return 'flowers';
  if (t.shop === 'hardware' || t.shop === 'doityourself' || t.shop === 'trade' || t.shop === 'electronics' || t.shop === 'computer' || t.shop === 'mobile_phone' || t.craft) return 'parts';
  if (t.shop === 'supermarket' || t.shop === 'convenience' || t.shop === 'greengrocer' || t.shop === 'butcher' || t.shop === 'farm' || t.shop === 'general' || t.shop === 'department_store' || t.shop === 'wholesale') return 'groceries';
  if (t.shop === 'books' || t.shop === 'stationery' || t.amenity === 'library' || t.shop === 'music' || t.shop === 'video_games' || t.shop === 'toys' || t.shop === 'gift' || t.shop === 'art' || t.shop === 'photo' || t.shop === 'frame') return 'gifts';
  if (t.shop === 'clothes' || t.shop === 'shoes' || t.shop === 'jewelry' || t.shop === 'boutique' || t.shop === 'fabric' || t.shop === 'tailor' || t.shop === 'bag' || t.shop === 'beauty' || t.shop === 'hairdresser' || t.shop === 'cosmetics') return 'fashion';
  if (t.shop === 'pet' || t.amenity === 'animal_shelter') return 'pets';
  if (t.tourism) return 'luggage';
  if (t.office) return 'papers';
  if (t.shop) return 'parcel';
  return 'parcel';
}
const businesses = [];
for (const el of pois) {
  const t = el.tags || {};
  if (!t.name) continue;
  const p = el.type === 'node' ? local(el) : el.center ? local(el.center) : null;
  if (!p || Math.abs(p[0]) > HALF_X - 200 || Math.abs(p[1]) > HALF_N - 200) continue;
  const s = nearestStreet(p, 160);
  if (!s) continue;
  businesses.push({ n: t.name.slice(0, 48), k: poiKind(t), x: Math.round(p[0]), z: Math.round(p[1]), s: [Math.round(s.x), Math.round(s.z)], h: Math.round(s.heading), r: s.name || '', c: s.cls });
}
// one entry per name within 60 m (a shop mapped as both node and building)
{
  const seen = new Map();
  for (const b of businesses) { const k = b.n.toLowerCase(); const prev = seen.get(k); if (prev && Math.hypot(prev.x - b.x, prev.z - b.z) < 60) { prev.dup = true; continue; } seen.set(k, b); }
}
const bizOut = businesses.filter((b) => !b.dup);
console.log(`  ${pois.length} places → ${bizOut.length} businesses with a street`);

const houses = [];
{
  const candidates = buildings.filter((b) => b.kind === K.house && b.area >= 50 && b.area <= 600);
  const withAddr = candidates.filter((b) => b.tags['addr:housenumber'] && b.tags['addr:street']);
  const rest = candidates.filter((b) => !(b.tags['addr:housenumber'] && b.tags['addr:street']));
  // shuffle the unaddressed ones deterministically and take a sample
  for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]]; }
  for (const b of [...withAddr, ...rest.slice(0, 4500)]) {
    const p = b.center;
    if (Math.abs(p[0]) > HALF_X - 300 || Math.abs(p[1]) > HALF_N - 300) continue;
    const s = nearestStreet(p, 120);
    if (!s || s.cls === 0 || s.cls === 1) continue; // nobody lives on the interstate
    const addr = b.tags['addr:housenumber'] && b.tags['addr:street'] ? `${b.tags['addr:housenumber']} ${b.tags['addr:street']}` : '';
    houses.push({ a: addr.slice(0, 48), x: Math.round(p[0]), z: Math.round(p[1]), s: [Math.round(s.x), Math.round(s.z)], h: Math.round(s.heading), r: s.name || '' });
  }
}
console.log(`  ${houses.length} houses with a street`);

// ------------------------------------------------------------ pack
console.log('packing');
const sections = {}; const chunks = []; let offset = 0;
function addSection(name, arr) {
  const buf = Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
  const pad = (8 - (buf.length % 8)) % 8;
  sections[name] = { offset, length: arr.length, type: arr.constructor.name };
  chunks.push(buf, Buffer.alloc(pad));
  offset += buf.length + pad;
}
const q = (v) => Math.max(-32767, Math.min(32767, Math.round(v * 2))); // half metres
// a polyline's vertices as deltas from the previous vertex (the first from 0)
function pushDelta(coords, pts) { let px = 0, pz = 0; for (const p of pts) { const x = q(p[0]), z = q(p[1]); coords.push(x - px, z - pz); px = x; pz = z; } }
// roads: densified so each ribbon follows the terrain; stored as int16 pairs
{
  const coords = [], start = [], count = [], cls = [], width = [], name = [], flags = [];
  for (const r of roads) {
    const pts = r.pts;
    start.push(coords.length / 2); count.push(pts.length);
    pushDelta(coords, pts);
    cls.push(r.c); width.push(Math.round(r.w * 10)); name.push(nameId(r.name)); flags.push((r.bridge ? 1 : 0) | (r.surface && /unpaved|gravel|dirt|ground|grass|compacted|fine_gravel|sand|earth/.test(r.surface) ? 2 : 0));
  }
  addSection('roadCoords', Int16Array.from(coords));
  addSection('roadStart', Uint32Array.from(start));
  addSection('roadCount', Uint16Array.from(count));
  addSection('roadClass', Uint8Array.from(cls));
  addSection('roadWidth', Uint16Array.from(width));
  addSection('roadName', Uint16Array.from(name));
  addSection('roadFlags', Uint8Array.from(flags));
}
{
  const coords = [], start = [], count = [], h = [], kind = [];
  for (const b of buildings) {
    start.push(coords.length / 2); count.push(b.ring.length);
    pushDelta(coords, b.ring);
    h.push(Math.min(255, Math.round(b.h * 2))); kind.push(b.kind);
  }
  addSection('bldCoords', Int16Array.from(coords));
  addSection('bldStart', Uint32Array.from(start));
  addSection('bldCount', Uint16Array.from(count));
  addSection('bldHeight', Uint8Array.from(h));
  addSection('bldKind', Uint8Array.from(kind));
}
{
  const coords = [], start = [], count = [];
  for (const a of painted.get(C.rail) || []) { start.push(coords.length / 2); count.push(a.line.length); pushDelta(coords, a.line); }
  addSection('railCoords', Int16Array.from(coords));
  addSection('railStart', Uint32Array.from(start));
  addSection('railCount', Uint16Array.from(count));
}
writeFileSync(join(OUT, 'world.bin'), gzipSync(Buffer.concat(chunks), { level: 9 }));
writeFileSync(join(OUT, 'cover.bin'), gzipSync(Buffer.from(cover.buffer), { level: 9 }));

// the minimap: cover colours under a hillshade, 4 cover cells per pixel
{
  const MW = CV_COLS / 4, MH = CV_ROWS / 4;
  const COL = { grass: [146, 170, 112], forest: [74, 110, 66], water: [62, 104, 150], residential: [168, 172, 150], commercial: [178, 164, 150], industrial: [160, 150, 148], farmland: [182, 176, 120], park: [132, 168, 104], pavement: [92, 92, 96], bare: [170, 160, 136], scrub: [128, 146, 96], rail: [110, 100, 96] };
  const img = Buffer.alloc(MW * MH * 4);
  for (let j = 0; j < MH; j++) for (let i = 0; i < MW; i++) {
    const counts = new Array(COVER.length).fill(0);
    for (let dj = 0; dj < 4; dj++) for (let di = 0; di < 4; di++) counts[cover[(j * 4 + dj) * CV_COLS + i * 4 + di]]++;
    // pavement and water win ties so streets stay visible at this scale
    let cls = 0, best = -1;
    counts.forEach((n, c) => { const w = n * (c === C.pavement ? 3 : c === C.water ? 1.5 : 1); if (w > best) { best = w; cls = c; } });
    const x = -HALF_X + (i + 0.5) * CV_CELL * 4, z = -HALF_N + (j + 0.5) * CV_CELL * 4;
    const hx = terrain.heightAt(x + 30, z) - terrain.heightAt(x - 30, z), hz = terrain.heightAt(x, z + 30) - terrain.heightAt(x, z - 30);
    const shade = 1 + Math.max(-0.45, Math.min(0.35, (-hx * 0.6 - hz * 0.8) / 40));
    const [r, g, b] = COL[COVER[cls]];
    const k = (j * MW + i) * 4;
    img[k] = Math.min(255, r * shade); img[k + 1] = Math.min(255, g * shade); img[k + 2] = Math.min(255, b * shade); img[k + 3] = 255;
  }
  writeFileSync(join(OUT, 'minimap.jpg'), jpeg.encode({ data: img, width: MW, height: MH }, 82).data);
}

const imagery = await buildImagery();
const meta = {
  name: 'Chattanooga, Tennessee — Lovell Field (KCHA) and the city around it',
  origin: { lat: LAT0, lon: LON0, mPerDegLat: M_PER_DEG_LAT, mPerDegLon: M_PER_DEG_LON },
  halfX: HALF_X, halfZ: HALF_N,
  height: { file: 'height.bin', cols: HM_COLS, rows: HM_ROWS, cell: HM_CELL, min: Math.round(terrain.hMin * 100) / 100, max: Math.round(terrain.hMax * 100) / 100, step: terrain.step, encoding: 'gzip; paeth-predicted residuals + 32768 as a high-byte plane then a low-byte plane' },
  cover: { file: 'cover.bin', cols: CV_COLS, rows: CV_ROWS, cell: CV_CELL, classes: COVER, encoding: 'gzip; one class byte per cell, row-major from the north-west corner' },
  minimap: { file: 'minimap.jpg', cols: CV_COLS / 4, rows: CV_ROWS / 4 },
  bin: { file: 'world.bin', sections, coordScale: 0.5, encoding: 'gzip; coordinates are per-polyline deltas in half metres' },
  roadClasses: ROAD_CLASSES, buildingKinds: KINDS, names,
  airport: {
    icao: 'KCHA', name: 'Chattanooga Metropolitan Airport (Lovell Field)',
    arp: { x: Math.round(arp[0]), z: Math.round(arp[1]) }, elevation: Math.round(terrain.heightAt(...arp) * 10) / 10,
    runways: kcha.map((r) => ({ ref: r.ref, w: r.w, pts: r.pts.map((p) => p.map((v) => Math.round(v * 10) / 10)) })),
    otherRunways: runways.filter((r) => !kcha.includes(r)).map((r) => ({ ref: r.ref, w: r.w, pts: r.pts.map((p) => p.map((v) => Math.round(v * 10) / 10)) })),
    taxiways: taxiways.map((t) => ({ ref: t.ref, w: t.w, pts: t.pts.map((p) => p.map((v) => Math.round(v * 10) / 10)) })),
    start: { x: Math.round(start.x * 10) / 10, z: Math.round(start.z * 10) / 10, heading: start.heading },
    bounds: airportBounds ? { ring: airportBounds.map((p) => p.map((v) => Math.round(v * 10) / 10)), min: [0, 1].map((k) => Math.floor(Math.min(...airportBounds.map((p) => p[k])))), max: [0, 1].map((k) => Math.ceil(Math.max(...airportBounds.map((p) => p[k])))) } : null,
  },
  bridges, businesses: bizOut, houses,
  imagery,
  credits: ['Map data © OpenStreetMap contributors (ODbL), via the Overpass API', 'Terrain: USGS 3DEP via the AWS Terrain Tiles (Mapzen Terrarium)', NAIP_CREDIT],
  built: new Date().toISOString().slice(0, 10),
};
writeFileSync(join(OUT, 'world.json'), JSON.stringify(meta));
const sz = (f) => (readFileSync(join(OUT, f)).length / 1e6).toFixed(2) + ' MB';
console.log(`wrote ${OUT}/: height.bin ${sz('height.bin')}, cover.bin ${sz('cover.bin')}, world.bin ${sz('world.bin')}, world.json ${sz('world.json')}, minimap.jpg ${sz('minimap.jpg')}`);
