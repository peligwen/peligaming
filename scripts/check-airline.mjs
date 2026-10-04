#!/usr/bin/env node
// Flies the Airline Comfort Visualizer's model under Node and checks that the
// aeroplane and its cabin do what the physics says: level flight trims, a
// steady bank loads everyone straight down with nothing sliding, a push-over
// lightens the cabin and a pull-up presses it down, a nose-down pitch builds
// speed, a nose-up pitch bleeds it to the stall, a yaw shoves the cabin
// sideways (harder at the tail than at the centre) and then fades as the
// flight path comes round, a downdraft lifts the unbuckled and not the
// buckled, and a gentle turn never spills a drink.
// The model is the <script id="cabin-engine"> block of the tool page.
//
//   node scripts/check-airline.mjs [--verbose]      (npm run check:airline)

import { readFileSync } from 'node:fs';

const VERBOSE = process.argv.includes('--verbose');
const PAGE = 'public/tools/irl/airline-comfort.html';
const html = readFileSync(PAGE, 'utf8');
const m = html.match(/<script id="cabin-engine">([\s\S]*?)<\/script>/);
if (!m) throw new Error(`${PAGE} has no <script id="cabin-engine"> block`);
const A = new Function(`${m[1]}\nreturn AIRLINER;`)();
const { D2R, R2D, G } = A;

let failures = 0, checks = 0;
function check(name, value, lo, hi, unit = '') {
  checks++;
  const ok = value >= lo && value <= hi;
  if (!ok) failures++;
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}: ${fmt(value)}${unit} (want ${fmt(lo)} … ${fmt(hi)}${unit})`);
}
const fmt = (x) => (Math.abs(x) >= 100 ? x.toFixed(0) : Math.abs(x) >= 10 ? x.toFixed(1) : x.toFixed(2));
const FRAME = 1 / 60;
function run(s, seconds, each) {
  const n = Math.round(seconds / FRAME);
  const acc = { nMin: Infinity, nMax: -Infinity, nyMax: 0, nyAbsMax: 0 };
  for (let k = 0; k < n; k++) {
    A.step(s, FRAME);
    acc.nMin = Math.min(acc.nMin, s.info.n); acc.nMax = Math.max(acc.nMax, s.info.n);
    if (Math.abs(s.info.ny) > acc.nyAbsMax) { acc.nyAbsMax = Math.abs(s.info.ny); acc.nyMax = s.info.ny; }
    if (each) each(s, k * FRAME, acc);
    if (VERBOSE && k % 60 === 0) console.log(`      t=${s.t.toFixed(1)} V=${s.info.V.toFixed(0)} n=${s.info.n.toFixed(2)} ny=${s.info.ny.toFixed(2)} pitch=${(s.info.pitch * R2D).toFixed(1)} roll=${(s.info.roll * R2D).toFixed(1)} γ=${(s.info.gamma * R2D).toFixed(1)} α=${(s.info.alpha * R2D).toFixed(1)}`);
  }
  return acc;
}
const fresh = () => { const s = A.createState(7); s.beltSign = false; return s; };
const F = [0, 0, 0];
const cabinForce = (s, x, y, z) => { A.specificForce(s, [x, y, z], F); return F.slice(); };

console.log('Level flight at 15,000 ft');
{
  const s = fresh();
  const V0 = s.info.V;
  const acc = run(s, 30);
  check('load factor', s.info.n, 0.98, 1.02, ' g');
  check('speed held over 30 s', s.info.V - V0, -1.5, 1.5, ' m/s');
  check('flight path angle', s.info.gamma * R2D, -0.5, 0.5, '°');
  check('indicated airspeed', s.info.ias / A.KT, 200, 260, ' kt');
  check('cabin floor slopes nose-up (the specific force has an aft component)', cabinForce(s, 0, 0, 0)[0], 0.3, 1.0, ' m/s²');
  check('nobody fell, nothing spilled', s.events.falls + s.events.spills + s.events.cupsDown, 0, 0);
  check('people up and about', s.pax.filter((p) => p.mode !== 'seated').length, 1, 6);
  check('belts off', s.pax.filter((p) => p.mode === 'seated' && !p.belt).length, 30, 90);
  void acc;
}

console.log('A 45° bank, held: the turn loads everyone straight down');
{
  const s = fresh();
  run(s, 3);
  A.command(s, s.trimPitch + 4 * D2R, 45 * D2R, 0);
  const acc = run(s, 20);
  check('load factor settles near 1/cos 45°', s.info.n, 1.25, 1.5, ' g');
  check('lateral force stays small through the roll-in', acc.nyAbsMax, 0, 0.15, ' g');
  check('lateral force in the steady bank', Math.abs(s.info.ny), 0, 0.08, ' g');
  check('heading has turned', ((s.info.heading - Math.PI / 2) * R2D + 360) % 360, 30, 120, '°');
  check('a drink stays flat in the cup: slosh tilt', Math.hypot(...s.cups[0].slosh), 0, 0.12, ' rad');
  check('no cup off its tray', s.events.cupsDown, 0, 0);
  check('nobody on the floor', s.events.falls, 0, 0);
}

console.log('Nose down 20°: the speed builds, the push-over lightens the cabin');
{
  const s = fresh();
  run(s, 3);
  const V0 = s.info.V;
  A.command(s, -20 * D2R, 0, 0);
  const acc = run(s, 12);
  check('push-over minimum load', acc.nMin, -0.3, 0.5, ' g');
  check('speed gained in 12 s', s.info.V - V0, 12, 60, ' m/s');
  check('flight path follows the nose', s.info.gamma * R2D, -26, -14, '°');
  check('load factor at the steady dive near cos 20°', s.info.n, 0.8, 1.0, ' g');
  check('cups lifted off their trays', s.events.cupsDown, 1, 80);
}

console.log('Nose up 45°, held: a pull, then the speed bleeds and the wing stalls');
{
  const s = fresh();
  run(s, 3);
  A.command(s, 45 * D2R, 0, 0);
  let tStall = null, tBuffet = null;
  const acc = run(s, 40, (st, t) => { if (tBuffet == null && st.info.stall > 0) tBuffet = t; if (tStall == null && st.info.stall >= 1) tStall = t; });
  check('the pull-up load', acc.nMax, 1.5, 2.2, ' g');
  check('buffet before the break', tBuffet ?? 99, 5, 25, ' s');
  check('stalled within', tStall ?? 99, 10, 30, ' s');
  check('speed at the end', s.info.V, 40, 110, ' m/s');
  check('mushing down', s.info.gamma * R2D, -90, -20, '°');
  check('light in the seats', s.info.n, 0.1, 0.85, ' g');
}

console.log('Nose 30° right of the flight path: a shove to the side that fades as the path comes round');
{
  const s = fresh();
  run(s, 3);
  A.command(s, s.trimPitch, 0, 30 * D2R);
  let tailMax = 0, cgMax = 0;
  const acc = run(s, 14, (st) => {
    const cg = Math.abs(cabinForce(st, 0, 0, 0)[2]), tail = Math.abs(cabinForce(st, A.C.xRear + 1, 0, 0)[2]);
    cgMax = Math.max(cgMax, cg); tailMax = Math.max(tailMax, tail);
  });
  check('peak lateral load at the centre', acc.nyAbsMax, 0.25, 0.9, ' g');
  check('the tail gets more of it than the centre', tailMax / cgMax, 1.02, 1.6);
  check('sideslip fades', Math.abs(s.info.beta) * R2D, 0, 10, '°');
  check('lateral load at the end', Math.abs(s.info.ny), 0, 0.15, ' g');
  check('someone in the aisle went down', s.events.falls, 1, 20);
  check('drinks slid or spilled', s.events.spills, 1, 400);
}

console.log('A 30 m/s downdraft: the unbuckled meet the bins, the buckled stay');
{
  const s = fresh();
  run(s, 3);
  const buckled = s.pax.find((p) => p.mode === 'seated' && p.belt), loose = s.pax.find((p) => p.mode === 'seated' && !p.belt);
  let bMax = 0, lMax = 0;
  A.jolt(s, -30);
  const acc = run(s, 4, () => { bMax = Math.max(bMax, buckled.y); lMax = Math.max(lMax, loose.y); });
  check('minimum load', acc.nMin, -1.0, 0.1, ' g');
  check('buckled passenger rises into the belt', bMax, 0.02, 0.06, ' m');
  check('unbuckled passenger rises until the head finds the bin', lMax, 0.08, 0.3, ' m');
  check('heads on the bins', s.events.headHits, 20, 120);
  check('drinks in the air', s.events.spills, 20, 200);
  check('the aisle went down', s.events.falls, 1, 10);
  check('back in the seat afterwards', loose.y, 0, 0.001, ' m');
}

console.log('A 9 m/s downdraft: stomachs drop, nobody leaves the seat far');
{
  const s = fresh();
  run(s, 3);
  const loose = s.pax.find((p) => p.mode === 'seated' && !p.belt);
  let lMax = 0;
  A.jolt(s, -9);
  const acc = run(s, 4, () => { lMax = Math.max(lMax, loose.y); });
  check('minimum load', acc.nMin, 0.35, 0.65, ' g');
  check('unbuckled passenger stays down', lMax, 0, 0.001, ' m');
  check('no heads on the bins', s.events.headHits, 0, 0);
}

console.log('A 15 m/s updraft: pressed into the seats');
{
  const s = fresh();
  run(s, 3);
  A.jolt(s, 15);
  const acc = run(s, 4);
  check('maximum load', acc.nMax, 1.6, 2.0, ' g');
  check('no heads on the bins', s.events.headHits, 0, 0);
}

console.log('Light chop for a minute, then severe');
{
  const s = fresh();
  s.turb.intensity = 0.4;
  const acc = run(s, 60);
  check('light chop: load stays between', acc.nMin, 0.6, 1.0, ' g');
  check('light chop: and', acc.nMax, 1.0, 1.4, ' g');
  check('light chop: nobody on the floor', s.events.falls, 0, 3);
  s.turb.intensity = 1;
  const acc2 = run(s, 60);
  check('severe: the cabin goes light', acc2.nMin, -1.5, 0.3, ' g');
  check('severe: and heavy', acc2.nMax, 1.6, 3.5, ' g');
  check('severe: heads on the bins', s.events.headHits, 1, 500);
}

console.log('The seat-belt sign');
{
  const s = fresh();
  run(s, 20);
  s.beltSign = true;
  run(s, 90);
  check('everyone seated', s.pax.filter((p) => p.mode !== 'seated').length, 0, 0);
  check('almost everyone buckled (a few never do)', s.pax.filter((p) => p.mode === 'seated' && !p.belt).length, 0, 20);
  check('the attendant strapped in', s.attendant.mode === 'strapped' ? 1 : 0, 1, 1);
  check('the cart parked and braked', s.cart.brake && Math.abs(s.cart.x - (A.GALLEY_R + 0.9)) < 0.3 ? 1 : 0, 1, 1);
}

console.log(`\n${checks - failures}/${checks} checks pass`);
process.exit(failures ? 1 : 0);
