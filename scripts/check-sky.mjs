#!/usr/bin/env node
// Checks the Sky Pointer's astronomy engine against reference values:
//   - SGP4 against the Spacetrack Report #3 test case (near-earth),
//   - the magnetic model against NOAA's WMM2025 test table,
//   - precession against Meeus' worked example 21.b,
//   - the constellation illustrations' placement (their anchor stars, and the
//     figures' stars landing on painted pixels) and the IAU boundaries (both
//     sides of every edge, and the constellations stars are catalogued in),
//   - the Sun, Moon and planets against JPL Horizons (fetched live; skipped
//     without network),
//   - and the camera/projection maths for self-consistency.
// The engine is the <script id="sky-engine"> block of the tool page; pass
// `--engine path.js` to check a copy somewhere else.
//
//   node scripts/check-sky.mjs [--engine file] [--offline]      (npm run check:sky)

import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

const args = process.argv.slice(2);
const enginePath = args.includes('--engine') ? args[args.indexOf('--engine') + 1] : null;
const OFFLINE = args.includes('--offline');
const PAGE = 'public/tools/irl/sky-pointer.html';

let src;
if (enginePath) src = readFileSync(enginePath, 'utf8');
else {
  const html = readFileSync(PAGE, 'utf8');
  const m = html.match(/<script id="sky-engine">([\s\S]*?)<\/script>/);
  if (!m) throw new Error(`${PAGE} has no <script id="sky-engine"> block`);
  src = m[1];
}
const SKY = new Function(`${src}\nreturn SKY;`)();

let failures = 0, checks = 0;
function check(name, actual, expected, tol, unit = '') {
  checks++;
  const err = Math.abs(actual - expected);
  const ok = err <= tol;
  if (!ok) failures++;
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}: ${fmt(actual)} vs ${fmt(expected)} (Δ ${fmt(err)}${unit}, tol ${tol}${unit})`);
}
const fmt = (x) => (Math.abs(x) >= 1000 ? x.toFixed(2) : x.toPrecision(6));
const angDiff = (a, b) => { const d = ((a - b) % 360 + 540) % 360 - 180; return Math.abs(d); };

// ------------------------------------------------------------------ SGP4
console.log('SGP4 — Spacetrack Report #3 test case 88888 (WGS72)');
{
  const tle = SKY.parseTle(
    'TEST 88888\n' +
    '1 88888U          80275.98708465  .00073094  13844-3  66816-4 0    87\n' +
    '2 88888  72.8435 115.9689 0086731  52.6988 110.5714 16.05824518  1058\n');
  const rec = SKY.sgp4Init(tle[0]);
  const ref = [
    [0, [2328.97048951, -5995.22076416, 1719.97067261], [2.91207230, -0.98341546, -7.09081703]],
    [360, [2456.10705566, -6071.93853760, 1222.89727783], [2.67938992, -0.44829041, -7.22879231]],
    [720, [2567.56195068, -6112.50384522, 713.96397400], [2.44024599, 0.09810869, -7.31995916]],
    [1080, [2663.09078980, -6115.48229408, 196.39640427], [2.19611958, 0.65241995, -7.36282432]],
    [1440, [2742.55133624, -6079.67144181, -326.38095260], [1.94850229, 1.21106251, -7.35619372]],
  ];
  for (const [t, p, v] of ref) {
    const s = SKY.sgp4(rec, t);
    const dp = Math.hypot(s.pos[0] - p[0], s.pos[1] - p[1], s.pos[2] - p[2]);
    const dv = Math.hypot(s.vel[0] - v[0], s.vel[1] - v[1], s.vel[2] - v[2]);
    check(`t=${t} min position`, dp, 0, 0.1, ' km');
    check(`t=${t} min velocity`, dv, 0, 0.001, ' km/s');
  }
  // a real, current element set parses and propagates to a sane orbit
  const iss = SKY.parseTle('ISS (ZARYA)\n1 25544U 98067A   26271.52347222  .00012345  00000+0  22345-3 0  9993\n2 25544  51.6400 120.0000 0004000  90.0000 270.0000 15.50000000000000\n')[0];
  const r2 = SKY.sgp4Init(iss);
  const s2 = SKY.sgp4(r2, 30);
  check('ISS-like orbit radius', Math.hypot(...s2.pos), 6378 + 415, 40, ' km');
  check('ISS-like speed', Math.hypot(...s2.vel), 7.66, 0.05, ' km/s');
  check('bstar parse', iss.bstar, 0.22345e-3, 1e-9);
  check('epoch parse (JD)', iss.epochJd, Date.UTC(2026, 8, 28, 12, 33, 48) / 86400000 + 2440587.5, 1e-5, ' d');
}

// ------------------------------------------------------------------ WMM
console.log('WMM2025 — NOAA test values');
{
  const sky = JSON.parse(readFileSync('public/tools/irl/data/sky-pointer/sky.json', 'utf8'));
  // decimal year, altitude km, lat, lon, D, I, H, X — rows of WMM2025_TestValues.txt (in the coefficient zip)
  const rows = [
    [2025.000000, 28, 89, -121, -99.77, 88.47, 1504.298146, -255.388723],
    [2025.000000, 94, -29, -110, 15.74, -38.25, 24181.990098, 23275.471080],
    [2025.500000, 8, -52, -75, 14.91, -49.63, 20005.506364, 19331.857134],
    [2026.000000, 46, -24, -122, 14.01, -34.17, 26638.500090, 25846.118652],
    [2026.000000, 34, -19, 43, -14.98, -52.33, 20212.448819, 19525.694050],
    [2026.500000, 12, 33, -145, 11.96, 52.51, 24672.289649, 24136.839639],
    [2027.000000, 44, 22, 174, 6.46, 31.89, 28867.487799, 28683.972510],
    [2027.000000, 67, -47, -32, -13.52, -57.98, 12805.786103, 12450.832543],
    [2027.500000, 96, -46, -85, 17.93, -47.37, 19914.457641, 18947.658009],
    [2028.000000, 86, -85, -79, 41.09, -70.25, 16867.459172, 12713.115116],
    [2028.500000, 28, 54, -120, 15.43, 73.74, 15286.094495, 14735.145798],
    [2028.500000, 59, 32, 163, 0.15, 43.10, 28217.204381, 28217.104175],
  ];
  for (const [t, h, lat, lon, D, I, H, X] of rows) {
    const f = SKY.magneticField(sky.wmm, lat, lon, h, t);
    check(`${t} h${h} (${lat},${lon}) D`, f.declination, D, 0.01, '°');
    check(`${t} h${h} (${lat},${lon}) I`, f.inclination, I, 0.01, '°');
    check(`${t} h${h} (${lat},${lon}) H`, f.H, H, 1, ' nT');
    check(`${t} h${h} (${lat},${lon}) X`, f.X, X, 1, ' nT');
  }
}

// ------------------------------------------------------------------ precession
console.log('Precession — Meeus example 21.b (θ Persei to 2028 Nov 13.19)');
{
  const jd = 2462088.69;
  // the example's J2000 position with its proper motion already applied to the date
  const ra0 = 41.054063, dec0 = 49.227750;
  const v = SKY.apply(SKY.precessionMatrix(jd), SKY.vec(ra0, dec0));
  const { lon, lat } = SKY.sph(v);
  check('α', lon, 41.547214, 0.0002, '°');
  check('δ', lat, 49.348483, 0.0002, '°');
  check('GMST 1987 Apr 10 0h (Meeus 12.a)', SKY.gmst(2446895.5), 197.693195, 0.0001, '°');
}

// ------------------------------------------------------------------ camera & projection
console.log('Camera & projection');
{
  const c1 = SKY.cameraFromOrientation(0, 90, 0, 0); // upright, top of phone up, back facing north
  const { az, alt } = SKY.cameraAzAlt(c1);
  check('upright phone, α=0 → back faces north (az)', az, 0, 1e-6, '°');
  check('upright phone, α=0 → level (alt)', alt, 0, 1e-6, '°');
  check('upright phone → screen up is zenith', c1.u[2], 1, 1e-9);
  const c2 = SKY.cameraFromOrientation(270, 90, 0, 0); // turned to face east
  check('α=270 → back faces east', SKY.cameraAzAlt(c2).az, 90, 1e-6, '°');
  const c3 = SKY.cameraFromOrientation(0, 0, 0, 0); // flat on a table, screen up
  check('flat phone → back faces the ground', SKY.cameraAzAlt(c3).alt, -90, 1e-6, '°');
  const c4 = SKY.cameraFromOrientation(0, 45, 0, 0);
  check('tilted 45° → looking 45° up... no: back faces 45° below', SKY.cameraAzAlt(c4).alt, -45, 1e-6, '°');
  const c5 = SKY.cameraFromOrientation(0, 135, 0, 0);
  check('tilted past vertical → back faces 45° up', SKY.cameraAzAlt(c5).alt, 45, 1e-6, '°');
  const cam = SKY.cameraFromAzAlt(123, 34);
  check('manual camera az', SKY.cameraAzAlt(cam).az, 123, 1e-9, '°');
  check('manual camera alt', SKY.cameraAzAlt(cam).alt, 34, 1e-9, '°');
  check('manual camera roll', SKY.cameraRoll(cam), 0, 1e-9, '°');
  const S = SKY.scaleForFov(60, 400);
  const v = SKY.enuFromAltAz(140, 50);
  const p = SKY.project(cam, v, S, 200, 300);
  const back = SKY.unproject(cam, p[0], p[1], S, 200, 300);
  check('project/unproject round trip', SKY.angle(v, back), 0, 1e-9, '°');
  const edge = SKY.project(cam, SKY.enuFromAltAz(123 + 30, 34 - 0), S, 200, 300); // roughly 25° off axis
  check('a point 30° of azimuth away lands right of centre', Math.sign(edge[0] - 200), 1, 0);
  const h = SKY.horizonOnScreen(cam, S, 200, 300);
  check('horizon is a circle when looking up', h.kind === 'circle' ? 1 : 0, 1, 0);
  check('ground outside the circle when looking up', h.groundInside ? 1 : 0, 0, 0);
  // the projected horizon point straight ahead lies on that circle
  const hp = SKY.project(cam, SKY.enuFromAltAz(123, 0), S, 200, 300);
  check('horizon point lies on the horizon circle', Math.hypot(hp[0] - h.x, hp[1] - h.y), h.radius, 1e-6, ' px');
  const yawed = SKY.yawCamera(cam, 10);
  check('yaw by +10° turns the camera east', SKY.cameraAzAlt(yawed).az, 133, 1e-9, '°');
}

// ------------------------------------------------------------------ orientation through vertical
console.log('Device orientation through vertical (Euler wrap, iOS compass offset)');
{
  // A browser reports α ∈ [0,360), β ∈ [−180,180), γ ∈ [−90,90): decompose a rotation the way it would.
  const columns = (cam) => ({ dx: cam.r, dy: cam.u, dz: SKY.scale(cam.f, -1) });
  const decompose = (cam) => {
    const { dx, dy, dz } = columns(cam);
    const m12 = dy[0], m22 = dy[1], m31 = dx[2], m32 = dy[2], m33 = dz[2];
    let beta = Math.asin(Math.max(-1, Math.min(1, m32))) * SKY.R2D;
    let alpha = Math.atan2(-m12, m22) * SKY.R2D, gamma = Math.atan2(-m31, m33) * SKY.R2D;
    if (gamma >= 90 || gamma < -90) { beta = 180 - beta; alpha += 180; gamma += 180; }
    const wrap = (x) => ((x + 180) % 360 + 360) % 360 - 180;
    return { alpha: SKY.norm360(alpha), beta: wrap(beta), gamma: wrap(gamma) };
  };
  let worst = 0;
  for (let beta = 60; beta <= 120; beta += 2) for (const gamma of [-40, -5, 0, 5, 40]) for (const alpha of [10, 200, 350]) {
    const truth = SKY.cameraFromOrientation(alpha, beta, gamma);
    const d = decompose(truth);
    const back = SKY.cameraFromOrientation(d.alpha, d.beta, d.gamma);
    worst = Math.max(worst, SKY.angle(truth.f, back.f), SKY.angle(truth.u, back.u));
  }
  check('browser-style Euler triples rebuild the same camera, β 60°–120°', worst, 0, 1e-4, '°');

  // iOS: relative alpha (arbitrary reference) plus webkitCompassHeading. Within 60° of flat, face up,
  // that heading is the top edge's azimuth and 360 − heading is the absolute alpha. Raised, what iOS
  // reports is not documented — in the field it does not turn around at vertical the way the top
  // edge's projection would — so the sweeps run against three stories for the raised phone: the top
  // edge's projection (turns around at vertical), the camera's azimuth (turns around past 120° of
  // tilt, when iOS would be back to an edge), and the yaw of a consistent Euler triple (never turns).
  // The held offset must not care which is true.
  const stories = ['top edge', 'camera', 'yaw'];
  const iosHeading = (truth, story) => {
    const { dy, dz } = columns(truth);
    if (story === 'yaw') return SKY.norm360(360 - decompose(truth).alpha);
    const v = story === 'camera' && Math.abs(dz[2]) <= 0.5 ? SKY.scale(dz, -1) : dy;
    return SKY.norm360(Math.atan2(v[0], v[1]) * SKY.R2D);
  };
  const ref = 137, trueAlpha = 300; // the device's top edge points toward azimuth 60
  const range = (a, b, step = 1) => Array.from({ length: Math.floor((b - a) / step) + 1 }, (_, i) => a + i * step);
  const sweep = (story, betas, gammaOf, tracker = SKY.compassTracker()) => {
    let worstF = 0, worstU = 0, worstUpright = 0;
    for (const beta of betas) {
      const gamma = gammaOf(beta);
      const truth = SKY.cameraFromOrientation(trueAlpha, beta, gamma);
      // what Safari reports: the same rotation relative to its own reference, as a consistent triple
      const raw = decompose(SKY.cameraFromOrientation(trueAlpha - ref, beta, gamma));
      const offset = tracker.update(raw.alpha, raw.beta, raw.gamma, iosHeading(truth, story));
      const cam = SKY.cameraFromOrientation(raw.alpha + offset, raw.beta, raw.gamma);
      const ef = SKY.angle(cam.f, truth.f), eu = SKY.angle(cam.u, truth.u);
      worstF = Math.max(worstF, ef); worstU = Math.max(worstU, eu);
      if (beta >= 80 && beta <= 100) worstUpright = Math.max(worstUpright, ef);
    }
    return { worstF, worstU, worstUpright, tracker };
  };
  // Flat first, then raised through vertical and on to 170° (the camera 80° above the horizon), rolling a little.
  for (const story of stories) {
    const { worstF, worstU, worstUpright, tracker } = sweep(story, range(10, 170), (b) => 20 * Math.sin(b * SKY.D2R));
    check(`iOS sweep 10°–170°, ${story} story: forward direction error`, worstF, 0, 0.5, '°');
    check(`iOS sweep 10°–170°, ${story} story: screen-up direction error`, worstU, 0, 0.5, '°');
    check(`…and through vertical (80°–100°), where the raw triple wraps`, worstUpright, 0, 0.5, '°');
    check('…calibrated, with the reference yaw recovered', tracker.calibrated() ? tracker.offset() : NaN, ref, 0.01, '°');
  }
  // Once calibrated, nothing a raised phone reports moves the offset: here the top-edge story feeds
  // headings 180° round past vertical and the offset does not budge.
  {
    const { tracker } = sweep('top edge', range(10, 50), () => 0);
    const before = tracker.offset();
    sweep('top edge', range(125, 175, 5), () => 0, tracker);
    check('past 120° of tilt the compass is not listened to', angDiff(tracker.offset(), before), 0, 1e-9, '°');
    sweep('top edge', range(60, 120, 5), () => 0, tracker);
    check('…nor between 60° and 120°', angDiff(tracker.offset(), before), 0, 1e-9, '°');
  }
  // Raised from the start and never flat: the heading is taken provisionally, in the AR convention,
  // while the camera is below 30° of altitude — right under the camera and yaw stories — and the
  // page keeps asking for a flat moment.
  for (const story of ['camera', 'yaw']) {
    const { worstF, tracker } = sweep(story, range(95, 130), () => 0);
    check(`raised from the start, 95°–130°, ${story} story: forward direction error`, worstF, 0, 0.5, '°');
    check('…not counted as calibrated', tracker.calibrated() ? 1 : 0, 0, 0);
  }
  // Flat means face up: a phone on its side with the screen facing sideways is not flat.
  {
    const tracker = SKY.compassTracker();
    tracker.update(10, 0, 70, 350);
    check('a phone rolled 70° does not count as flat', tracker.calibrated() ? 1 : 0, 0, 0);
    tracker.update(10, 20, 20, 350);
    check('…tilted 20° and rolled 20° does', tracker.calibrated() ? 1 : 0, 1, 0);
  }
  // the old way — heading pasted in as alpha next to the raw gamma — turns the view around past
  // vertical whenever the heading does (the top-edge story, as the first release assumed)
  let flipped = 0;
  for (let beta = 100; beta <= 170; beta += 10) {
    const gamma = 20 * Math.sin(beta * SKY.D2R);
    const truth = SKY.cameraFromOrientation(trueAlpha, beta, gamma);
    const raw = decompose(SKY.cameraFromOrientation(trueAlpha - ref, beta, gamma));
    const old = SKY.cameraFromOrientation(360 - iosHeading(truth, 'top edge'), raw.beta, raw.gamma);
    if (angDiff(SKY.cameraAzAlt(old).az, SKY.cameraAzAlt(truth).az) > 90) flipped++;
  }
  check('(for the record) pasting the heading into alpha turns the view around past vertical', flipped, 8, 0);
}

// ------------------------------------------------------------------ constellation art
// The illustrations are 8-bit greyscale or RGB PNGs; this reads one into a
// grey value per pixel, enough to ask whether a star lands on the drawing.
function readPng(file) {
  const buf = readFileSync(file);
  let p = 8, w = 0, h = 0, type = 0;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), kind = buf.toString('ascii', p + 4, p + 8), body = buf.subarray(p + 8, p + 8 + len);
    if (kind === 'IHDR') {
      w = body.readUInt32BE(0); h = body.readUInt32BE(4); type = body[9];
      if (body[8] !== 8 || ![0, 2, 4, 6].includes(type) || body[12] !== 0) throw new Error(`${file}: unsupported PNG (depth ${body[8]}, type ${type}, interlace ${body[12]})`);
    } else if (kind === 'IDAT') idat.push(body);
    p += 12 + len;
  }
  const bpp = { 0: 1, 2: 3, 4: 2, 6: 4 }[type], stride = w * bpp, raw = inflateSync(Buffer.concat(idat));
  const px = new Uint8Array(stride * h), grey = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), row = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[row + x - bpp] : 0, b = y ? px[row - stride + x] : 0, c = x >= bpp && y ? px[row - stride + x - bpp] : 0;
      const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
      const pred = f === 0 ? 0 : f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      px[row + x] = (src[x] + pred) & 255;
    }
    for (let x = 0; x < w; x++) grey[y * w + x] = px[row + x * bpp];
  }
  return { w, h, grey };
}

console.log('Constellation art — the illustrations pinned by their anchor stars');
const sky = JSON.parse(readFileSync('public/tools/irl/data/sky-pointer/sky.json', 'utf8'));
{
  let worstPx = 0, worstDeg = 0, onArt = 0, figureStars = 0, inFront = 0;
  const artOf = {};
  for (const [id, a] of Object.entries(sky.art)) { artOf[id] = id; for (const c of a.covers || []) artOf[c] = id; }
  check('every constellation has a picture (its own, or Argo\'s or Ophiuchus\')', Object.keys(artOf).length, 88, 0);
  const frames = Object.fromEntries(Object.entries(sky.art).map(([id, a]) => [id, SKY.artFrame(a.a)]));
  for (const [id, a] of Object.entries(sky.art)) {
    for (const [x, y, ra, dec] of a.a) {
      const v = SKY.vec(ra, dec), px = SKY.artPixel(frames[id], v);
      worstPx = Math.max(worstPx, Math.hypot(px[0] - x, px[1] - y));
      worstDeg = Math.max(worstDeg, SKY.angle(SKY.artDir(frames[id], x, y), v));
    }
  }
  check('each anchor star maps to its pixel', worstPx, 0, 1e-6, ' px');
  check('each anchor pixel maps to its star', worstDeg * 3600, 0, 0.01, '″');
  const images = Object.fromEntries(Object.entries(sky.art).map(([id, a]) => [id, readPng(`public/tools/irl/data/sky-pointer/${a.img}`)]));
  check('pictures are the size listed', Object.entries(sky.art).filter(([id, a]) => images[id].w !== a.w || images[id].h !== a.h).length, 0, 0);
  // the stick figures' stars sit on the drawing, with pixels counted from the top left as the page's
  // texture coordinates assume (d3-celestial's figures are not quite Stellarium's, so not all of them)
  for (const [con, c] of Object.entries(sky.cons)) {
    const id = artOf[con], img = images[id];
    const seen = new Set();
    for (const seg of c.lines) for (const [ra, dec] of seg) {
      const k = `${ra},${dec}`;
      if (seen.has(k)) continue;
      seen.add(k); figureStars++;
      const px = SKY.artPixel(frames[id], SKY.vec(ra, dec));
      if (!px) continue;
      inFront++;
      const x0 = Math.round(px[0]), y0 = Math.round(px[1]);
      let lit = 0;
      for (let y = y0 - 2; y <= y0 + 2; y++) for (let x = x0 - 2; x <= x0 + 2; x++) if (x >= 0 && y >= 0 && x < img.w && y < img.h) lit = Math.max(lit, img.grey[y * img.w + x]);
      if (lit > 20) onArt++;
    }
  }
  check('every figure star is in front of its picture', inFront, figureStars, 0);
  check(`figure stars that land on the drawing (${onArt} of ${figureStars})`, onArt / figureStars * 100, 100, 25, '%');
  // read with the rows counted from the bottom, most of the same stars miss
  let flipped = 0;
  for (const [con, c] of Object.entries(sky.cons)) {
    const id = artOf[con], img = images[id];
    const seen = new Set();
    for (const seg of c.lines) for (const [ra, dec] of seg) {
      const k = `${ra},${dec}`;
      if (seen.has(k)) continue;
      seen.add(k);
      const px = SKY.artPixel(frames[id], SKY.vec(ra, dec));
      const x0 = Math.round(px[0]), y0 = Math.round(img.h - px[1]);
      let lit = 0;
      for (let y = y0 - 2; y <= y0 + 2; y++) for (let x = x0 - 2; x <= x0 + 2; x++) if (x >= 0 && y >= 0 && x < img.w && y < img.h) lit = Math.max(lit, img.grey[y * img.w + x]);
      if (lit > 20) flipped++;
    }
  }
  check(`…and read bottom-up, far fewer would (${flipped} of ${figureStars})`, flipped < onArt * 0.6 ? 1 : 0, 1, 0);
}

console.log('Constellation boundaries — IAU, B1875');
{
  const index = SKY.boundaryIndex(sky.bounds.edges);
  const fromB1875 = SKY.transpose(SKY.precessionMatrix(SKY.B1875));
  const J = (ra, dec) => SKY.apply(fromB1875, SKY.vec(ra, dec));
  // just either side of the middle of every edge is the constellation the edge names on that side
  let wrong = 0;
  for (const [t, ra1, dec1, ra2, dec2, a, b] of sky.bounds.edges) {
    // a lies east of a meridian edge and south of a parallel one; b on the other side
    let sideA, sideB;
    if (t === 'M') { const d = (dec1 + dec2) / 2; sideA = J(ra1 + 0.01, d); sideB = J(ra1 - 0.01, d); }
    else { const r = ra1 + SKY.norm360(ra2 - ra1) / 2; sideA = J(r, dec1 - 0.01); sideB = J(r, dec1 + 0.01); }
    if (SKY.constellationAt(index, sideA) !== a) wrong++;
    if (SKY.constellationAt(index, sideB) !== b) wrong++;
  }
  check(`both sides of all ${sky.bounds.edges.length} edges are the constellations it names`, wrong, 0, 0);
  check('the north celestial pole is in Ursa Minor', SKY.constellationAt(index, [0, 0, 1]) === 'UMi' ? 1 : 0, 1, 0);
  check('the south celestial pole is in Octans', SKY.constellationAt(index, [0, 0, -1]) === 'Oct' ? 1 : 0, 1, 0);
  // the catalogued constellation of every Bayer/Flamsteed star; the Flamsteed numbers that predate the
  // boundaries and ended up across them (10 UMa in Lynx, 2 UMi in Cepheus...) are the known exceptions
  let agree = 0, total = 0;
  const at = {};
  for (const [ra, dec, , , hip] of sky.stars) {
    const nm = sky.names[hip];
    if (!nm || !nm[3]) continue;
    const c = SKY.constellationAt(index, SKY.vec(ra, dec));
    at[nm[0] || `${nm[1] || nm[2]} ${nm[3]}`] = c;
    total++; if (c === nm[3]) agree++;
  }
  check(`stars in the constellation they are catalogued in (${agree} of ${total})`, agree / total * 100, 100, 1.5, '%');
  for (const [star, con] of [['Betelgeuse', 'Ori'], ['Sirius', 'CMa'], ['Polaris', 'UMi'], ['Rigil Kentaurus', 'Cen'], ['Acrux', 'Cru'], ['Alpheratz', 'And'], ['Antares', 'Sco'], ['10 UMa', 'Lyn'], ['2 UMi', 'Cep'], ['ρ Aql', 'Del']]) {
    check(`${star} is in ${con}`, at[star] === con ? 1 : 0, 1, 0);
  }
  // the drawn paths start and end on the corners, in J2000
  let worstEnd = 0, worstStep = 0;
  for (const e of sky.bounds.edges) {
    const pts = SKY.boundaryPath(e);
    worstEnd = Math.max(worstEnd, SKY.angle(pts[0], J(e[1], e[2])), SKY.angle(pts.at(-1), J(e[3], e[4])));
    for (let i = 1; i < pts.length; i++) worstStep = Math.max(worstStep, SKY.angle(pts[i - 1], pts[i]));
  }
  check('boundary paths end on their corners', worstEnd * 3600, 0, 0.01, '″');
  check('boundary paths are drawn in short steps', worstStep, 0, 1.5 + 1e-9, '°');
}

// ------------------------------------------------------------------ Sun, Moon, planets vs Horizons
console.log('Sun, Moon and planets vs JPL Horizons (geocentric, apparent)');
if (OFFLINE) console.log('  (skipped: --offline)');
else {
  const dates = ['2026-09-29 00:00', '2031-03-15 12:00'];
  const bodies = [['10', 'sun', 1.5], ['301', 'moon', 4], ['199', 'mercury', 3], ['299', 'venus', 3], ['499', 'mars', 3], ['599', 'jupiter', 3], ['699', 'saturn', 3], ['799', 'uranus', 3], ['899', 'neptune', 3]];
  for (const when of dates) {
    const date = new Date(when.replace(' ', 'T') + ':00Z');
    const jd = SKY.jdFromDate(date);
    const sun = SKY.sunPosition(jd), moon = SKY.moonPosition(jd), planets = SKY.planetPositions(jd, sun);
    const mine = { sun, moon, ...Object.fromEntries(planets.map((p) => [p.id, p])) };
    for (const [id, key, tolMin] of bodies) {
      let text;
      try {
        const url = `https://ssd.jpl.nasa.gov/api/horizons.api?format=text&COMMAND='${id}'&OBJ_DATA='NO'&MAKE_EPHEM='YES'&EPHEM_TYPE='OBSERVER'&CENTER='500@399'&START_TIME='${encodeURIComponent(when)}'&STOP_TIME='${encodeURIComponent(when.slice(0, -2) + '01')}'&STEP_SIZE='1%20m'&QUANTITIES='2'&ANG_FORMAT='DEG'`;
        const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
        text = await res.text();
      } catch (e) {
        console.log(`  (skipped ${key} ${when}: ${e.message})`);
        continue;
      }
      const m = text.match(/\$\$SOE\s*\n\s*\S+ \S+\s+([-\d.]+)\s+([-\d.]+)/);
      if (!m) { console.log(`  (no ephemeris for ${key} ${when}: ${text.slice(0, 120).replace(/\n/g, ' ')})`); continue; }
      const ra = Number(m[1]), dec = Number(m[2]);
      const sep = SKY.angle(SKY.vec(ra, dec), SKY.vec(mine[key].ra, mine[key].dec)) * 60;
      check(`${mine[key].name} ${when}: separation`, sep, 0, tolMin, "'");
      if (key === 'moon') {
        const ill = SKY.illumination(moon, sun);
        const mm = text.match(/\$\$SOE/) && text; // illumination is checked loosely below via a second query
        void mm; void ill;
      }
    }
  }
  // Moon illumination and distance
  const jd = SKY.jdFromDate(new Date('2026-09-29T00:00:00Z'));
  const moon = SKY.moonPosition(jd), sun = SKY.sunPosition(jd);
  const ill = SKY.illumination(moon, sun);
  try {
    const url = `https://ssd.jpl.nasa.gov/api/horizons.api?format=text&COMMAND='301'&OBJ_DATA='NO'&MAKE_EPHEM='YES'&EPHEM_TYPE='OBSERVER'&CENTER='500@399'&START_TIME='2026-09-29%2000:00'&STOP_TIME='2026-09-29%2000:01'&STEP_SIZE='1%20m'&QUANTITIES='10,20'&ANG_FORMAT='DEG'`;
    const text = await (await fetch(url, { signal: AbortSignal.timeout(30000) })).text();
    const m = text.match(/\$\$SOE\s*\n\s*\S+ \S+\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)/);
    if (m) {
      check('Moon illuminated fraction', ill.fraction * 100, Number(m[1]), 1, '%');
      check('Moon distance', moon.distKm, Number(m[2]) * SKY.AU_KM, 1500, ' km');
    }
  } catch (e) { console.log(`  (skipped Moon illumination: ${e.message})`); }
}

console.log(`\n${checks - failures}/${checks} checks passed${failures ? ` — ${failures} FAILED` : ''}`);
process.exit(failures ? 1 : 0);
