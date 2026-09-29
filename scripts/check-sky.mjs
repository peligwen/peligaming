#!/usr/bin/env node
// Checks the Sky Pointer's astronomy engine against reference values:
//   - SGP4 against the Spacetrack Report #3 test case (near-earth),
//   - the magnetic model against NOAA's WMM2025 test table,
//   - precession against Meeus' worked example 21.b,
//   - the Sun, Moon and planets against JPL Horizons (fetched live; skipped
//     without network),
//   - and the camera/projection maths for self-consistency.
// The engine is the <script id="sky-engine"> block of the tool page; pass
// `--engine path.js` to check a copy somewhere else.
//
//   node scripts/check-sky.mjs [--engine file] [--offline]      (npm run check:sky)

import { readFileSync } from 'node:fs';

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
