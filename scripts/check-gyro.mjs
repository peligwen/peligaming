#!/usr/bin/env node
// Flies the Gyro Courier's flight model under Node and checks that it behaves
// like an autogyro: the prerotator brings the rotor up, a takeoff roll gets
// airborne in a sensible distance with the rotor spun up by the airflow
// alone, level flight trims at sane rotor speeds and power, the glide and the
// vertical autorotative descent land in the published ranges for machines of
// this class, pushing over unloads and slows the rotor, and a trimmed cruise
// rides out a disturbance; then it wrecks the machine five ways and checks
// that what should break does, what should not does not, and that the wreck
// comes to rest.
// The model is the <script id="gyro-engine"> block of the tool page; pass
// `--engine path.js` to check a copy somewhere else, `--verbose` for the
// time histories.
//
//   node scripts/check-gyro.mjs [--engine file] [--verbose]      (npm run check:gyro)

import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const enginePath = args.includes('--engine') ? args[args.indexOf('--engine') + 1] : null;
const VERBOSE = args.includes('--verbose');
const PAGE = 'public/tools/irl/gyro-courier.html';

let src;
if (enginePath) src = readFileSync(enginePath, 'utf8');
else {
  const html = readFileSync(PAGE, 'utf8');
  const m = html.match(/<script id="gyro-engine">([\s\S]*?)<\/script>/);
  if (!m) throw new Error(`${PAGE} has no <script id="gyro-engine"> block`);
  src = m[1];
}
const GYRO = new Function(`${src}\nreturn GYRO;`)();
const { KT, FT } = GYRO;

let failures = 0, checks = 0;
function check(name, value, lo, hi, unit = '') {
  checks++;
  const ok = value >= lo && value <= hi;
  if (!ok) failures++;
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}: ${fmt(value)}${unit} (want ${fmt(lo)} … ${fmt(hi)}${unit})`);
}
const fmt = (x) => (Math.abs(x) >= 100 ? x.toFixed(0) : Math.abs(x) >= 10 ? x.toFixed(1) : x.toFixed(2));

// a flat world at 200 m, paved; `kind` can be changed per test
const world = { h: 200, kind: 'pavement' };
const env = { surface: () => ({ h: world.h, kind: world.kind, n: [0, 1, 0] }) };
const calm = (s) => { s.wind.speed = 0; s.wind.gustiness = 0; s.wind.gust = [0, 0, 0]; };

// A pilot of sorts: attitude loops on the stick (with rate damping and an
// integral so a trim is found), speed on the pitch attitude (or a signed
// forward airspeed, so a vertical descent can be flown), climb on the
// throttle, wings level, the ball centred.
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const FRAME = 1 / 60;
function pilot(s, want) {
  const i = s.info, inp = s.input, m = s._pilot || (s._pilot = { pI: 0, rI: 0, vI: 0, tI: 0 });
  const q = s.omega[2] * GYRO.R2D, p = s.omega[0] * GYRO.R2D;
  let pitchCmd;
  if (want.pitch != null) pitchCmd = want.pitch;
  else {
    const vErr = want.u != null ? i.uAir - want.u : i.ias - want.ias; // m/s; faster → pitch up
    m.vI = clamp(m.vI + vErr * FRAME * 0.4, -12, 12);
    pitchCmd = clamp((want.pitchBias || 0) + 1.5 * vErr + m.vI, -20, 32);
  }
  const pErr = pitchCmd - i.pitch;
  m.pI = clamp(m.pI + pErr * FRAME * 0.04, -0.6, 0.6);
  inp.lon = clamp(0.035 * pErr - 0.011 * q + m.pI, -1, 1);
  const rErr = (want.roll || 0) - i.roll;
  m.rI = clamp(m.rI + rErr * FRAME * 0.03, -0.6, 0.6);
  inp.lat = clamp(0.03 * rErr - 0.012 * p + m.rI, -1, 1);
  inp.rudder = clamp(0.03 * i.slip, -1, 1);
  if (want.throttle != null) inp.throttle = want.throttle;
  else {
    const altTerm = want.alt != null ? clamp(0.08 * (want.alt - i.alt), -2.5, 2.5) : 0;
    const vsErr = (want.vs || 0) + altTerm - i.vs;
    m.tI = clamp(m.tI + 0.05 * vsErr * FRAME, -0.6, 0.6);
    inp.throttle = clamp(0.5 + 0.12 * vsErr + m.tI, 0, 1);
  }
}
function run(s, seconds, fn) {
  const n = Math.round(seconds / FRAME);
  for (let k = 0; k < n; k++) { if (fn) fn(k * FRAME); GYRO.step(s, env, FRAME); if (s.crashed) break; }
}
function runOn(s, seconds, fn) { // through a crash: the physics carries on
  const n = Math.round(seconds / FRAME);
  for (let k = 0; k < n; k++) { if (fn) fn(k * FRAME); GYRO.step(s, env, FRAME); }
}
const events = (s) => s.damage.events.map((e) => e.what).join(' | ');
function avg(s, seconds, fn, keys) {
  const sums = Object.fromEntries(keys.map((k) => [k, 0])); let n = 0;
  run(s, seconds, (t) => { if (fn) fn(t); for (const k of keys) sums[k] += typeof k === 'string' ? s.info[k] : 0; n++; });
  for (const k of keys) sums[k] /= n;
  return sums;
}
function airborne(ias, { rpm = 340, agl = 400 } = {}) {
  const s = GYRO.createState(); calm(s);
  GYRO.place(s, env, 0, 0, 0, { engineOn: true, rotorRpm: rpm, airborne: { agl, speed: ias } });
  s.input.throttle = 0.6;
  return s;
}

// ------------------------------------------------------------------ 1. the rotor on the ground
console.log('Prerotation and the takeoff roll');
{
  const s = GYRO.createState(); calm(s);
  GYRO.place(s, env, 0, 0, 0);
  run(s, 2);
  check('resting height of the CG over the pavement', s.info.agl, 0.9, 1.0, ' m');
  s.input.ignition = true; s.input.brake = 1;
  run(s, 3);
  check('engine idling', s.info.engineRpm, 700, 820, ' rpm');
  s.input.throttle = 0.5; s.input.prerotate = true;
  let t200 = null;
  run(s, 60, (t) => { if (t200 == null && s.info.rotorRpm >= 200) t200 = t; });
  check('prerotator reaches 200 rpm', t200 == null ? 999 : t200, 10, 45, ' s');
  check('held by the brakes while prerotating', Math.hypot(s.pos[0], s.pos[2]), 0, 0.5, ' m');
  check('heading held by the tyres', Math.abs(((s.info.heading + 180) % 360) - 180), 0, 3, '°');
  // the roll: brakes off, full power, stick back; the airflow must bring the rotor the rest of the way
  s.input.prerotate = false; s.input.brake = 0; s.input.throttle = 1; s.input.lon = 0.9;
  let lift = null, dist = 0, rpmLift = 0;
  const x0 = s.pos[0], z0 = s.pos[2];
  run(s, 40, () => {
    if (s.info.agl > 1.5 && lift == null) { lift = s.t; dist = Math.hypot(s.pos[0] - x0, s.pos[2] - z0); rpmLift = s.info.rotorRpm; }
    if (lift == null) { // stick back until the nose comes up, then balance on the mains at a shallow nose-up attitude and let it accelerate
      if (s.info.rotorRpm < 300 && s.info.pitch < 5) { s.input.lon = 0.9; s.input.lat = clamp(-0.03 * s.info.roll - 0.012 * s.omega[0] * GYRO.R2D, -1, 1); }
      else pilot(s, { pitch: 9, throttle: 1 });
    } else pilot(s, s.info.iasKt < 43 ? { pitch: 7, throttle: 1 } : { ias: 45 * KT, throttle: 1, pitchBias: 4 }); // hold the attitude until climb speed
  });
  check('climbing after liftoff', s.info.vs, 1.0, 8, ' m/s');
  check('takeoff roll from 200 rpm', lift == null ? 9999 : dist, 60, 500, ' m');
  check('rotor speed at liftoff', rpmLift, 280, 420, ' rpm');
  check('no crash in the climb-out', s.crashed ? 1 : 0, 0, 0);
  if (VERBOSE) console.log('   ', JSON.stringify(s.crashed), 'after', s.t.toFixed(1), 's: ias', s.info.iasKt.toFixed(0), 'kt agl', s.info.aglFt.toFixed(0), 'ft rotor', s.info.rotorRpm.toFixed(0));
}

// ------------------------------------------------------------------ 2. trimmed level flight
console.log('Level flight, trimmed by the autopilot');
const trims = {};
for (const kt of [35, 45, 55, 70]) {
  const s = airborne(kt * KT);
  run(s, 70, () => pilot(s, { ias: kt * KT, alt: 600 }));
  const a = avg(s, 20, () => pilot(s, { ias: kt * KT, alt: 600 }), ['rotorRpm', 'power', 'pitch', 'vs', 'discAlpha', 'nz', 'iasKt']);
  trims[kt] = { ...a, lon: s.ctl.lon, throttle: s.input.throttle, crashed: s.crashed };
  console.log(`   ${kt} kt: rotor ${a.rotorRpm.toFixed(0)} rpm, power ${(a.power / 1000).toFixed(1)} kW, pitch ${a.pitch.toFixed(1)}°, disc ${a.discAlpha.toFixed(1)}°, stick ${s.ctl.lon.toFixed(2)}, throttle ${s.input.throttle.toFixed(2)}, vs ${a.vs.toFixed(2)} m/s, ias ${a.iasKt.toFixed(1)}${s.crashed ? ' CRASHED ' + s.crashed.reason : ''}`);
}
check('holds 55 kt level', Math.abs(trims[55].vs), 0, 0.6, ' m/s');
check('rotor speed in cruise at 55 kt', trims[55].rotorRpm, 300, 400, ' rpm');
check('power to cruise at 55 kt', trims[55].power / 1000, 15, 40, ' kW');
check('disc angle of attack at 55 kt', trims[55].discAlpha, 3, 14, '°');
check('rotor speed at 35 kt', trims[35].rotorRpm, 280, 420, ' rpm');
check('rotor speed at 70 kt', trims[70].rotorRpm, 300, 430, ' rpm');
check('stick further forward at 70 than at 45 kt', trims[45].lon - trims[70].lon, 0.03, 1);
check('more power at 70 than at 55 kt', trims[70].power - trims[55].power, 1000, 40000, ' W');

// ------------------------------------------------------------------ 3. engine-off glide
console.log('Engine-off glide');
{
  const s = airborne(50 * KT, { agl: 800 });
  s.input.ignition = false;
  run(s, 40, () => pilot(s, { ias: 50 * KT, throttle: 0 }));
  const a = avg(s, 15, () => pilot(s, { ias: 50 * KT, throttle: 0 }), ['vs', 'rotorRpm', 'iasKt', 'engineRpm']);
  const ld = (a.iasKt * KT) / -a.vs;
  console.log(`   50 kt, engine off: sink ${(-a.vs / FT * 60).toFixed(0)} fpm, rotor ${a.rotorRpm.toFixed(0)} rpm, L/D ${ld.toFixed(1)}`);
  check('engine stopped', a.engineRpm, 0, 1, ' rpm');
  check('glide sink rate at 50 kt', -a.vs / FT * 60, 800, 1600, ' fpm');
  check('rotor speed in the glide', a.rotorRpm, 300, 420, ' rpm');
}

// ------------------------------------------------------------------ 4. vertical descent
console.log('Vertical autorotative descent');
{
  const s = airborne(30 * KT, { agl: 2500 });
  s.input.ignition = false;
  run(s, 45, () => pilot(s, { u: 0, throttle: 0 }));
  const a = avg(s, 15, () => pilot(s, { u: 0, throttle: 0 }), ['vs', 'rotorRpm', 'uAir', 'gsKt', 'nz', 'discAlpha']);
  console.log(`   no forward airspeed, engine off: sink ${(-a.vs / FT * 60).toFixed(0)} fpm, rotor ${a.rotorRpm.toFixed(0)} rpm, g ${a.nz.toFixed(2)}, disc ${a.discAlpha.toFixed(0)}°${s.crashed ? ' CRASHED ' + s.crashed.reason : ''}`);
  check('vertical descent sink rate', -a.vs / FT * 60, 1500, 2600, ' fpm');
  check('rotor keeps turning in the vertical descent', a.rotorRpm, 300, 450, ' rpm');
  check('forward airspeed held near zero', Math.abs(a.uAir), 0, 2, ' m/s');
  check('the disc sees the air from below', a.discAlpha, 60, 90, '°');
  check('no crash', s.crashed ? 1 : 0, 0, 0);
}

// ------------------------------------------------------------------ 5. unloading the rotor
console.log('Pushing over');
{
  const s = airborne(55 * KT);
  run(s, 40, () => pilot(s, { ias: 55 * KT, alt: 600 }));
  const rpm0 = s.info.rotorRpm;
  let minNz = 9, minRpm = 999;
  run(s, 2.5, () => { s.input.lon = -1; minNz = Math.min(minNz, s.info.nz); minRpm = Math.min(minRpm, s.info.rotorRpm); });
  console.log(`   stick full forward for 2.5 s from ${rpm0.toFixed(0)} rpm: g down to ${minNz.toFixed(2)}, rotor down to ${minRpm.toFixed(0)} rpm`);
  check('load factor drops when pushed over', minNz, -1.5, 0.4);
  check('rotor slows when unloaded', rpm0 - minRpm, 8, 200, ' rpm');
}

// ------------------------------------------------------------------ 6. stability
console.log('Hands off: the bare machine, and with the flight assist');
for (const assist of [false, true]) {
  const s = airborne(55 * KT);
  run(s, 120, () => pilot(s, { ias: 55 * KT, alt: 600 }));
  const lon = s.ctl.lon, thr = s.input.throttle, lat = s.ctl.lat, rud = s.ctl.rudder;
  s.input.lon = 0; s.input.lat = 0; s.input.trimLon = lon; s.input.trimLat = lat; s.input.throttle = thr; s.input.rudder = rud; s.input.assist = assist;
  s.omega[2] += 0.2; // a pitch-rate kick
  let maxRoll = 0, maxPitch = 0, tDepart = null;
  run(s, 60, () => { maxRoll = Math.max(maxRoll, Math.abs(s.info.roll)); maxPitch = Math.max(maxPitch, Math.abs(s.info.pitch)); if (tDepart == null && (Math.abs(s.info.roll) > 30 || Math.abs(s.info.pitch) > 30)) tDepart = s.t - 120; });
  console.log(`   ${assist ? 'assist on ' : 'assist off'}: roll within ${maxRoll.toFixed(0)}°, pitch within ${maxPitch.toFixed(0)}°${tDepart != null ? ', departed after ' + tDepart.toFixed(0) + ' s' : ''}${s.crashed ? ', CRASHED ' + s.crashed.reason : ''}`);
  if (assist) {
    check('with the assist, roll stays shallow for a minute hands-off', maxRoll, 0, 15, '°');
    check('with the assist, pitch stays shallow for a minute hands-off', maxPitch, 0, 15, '°');
    check('with the assist, no crash', s.crashed ? 1 : 0, 0, 0);
  } else {
    check('the bare machine needs a pilot: it departs, but not at once', tDepart == null ? 60 : tDepart, 4, 60, ' s');
  }
}

// ------------------------------------------------------------------ 7. landing
console.log('A landing');
{
  const s = airborne(45 * KT, { agl: 60 });
  s.input.throttle = 0.3;
  let touchdown = null, sink = 0, speed = 0;
  run(s, 60, () => {
    if (s.info.onGround) { if (!touchdown) { touchdown = s.t; sink = s.ground.worstSink; speed = s.info.gsKt; } s.input.brake = 1; s.input.throttle = 0; s.input.lon = 0.6; }
    else {
      // a glide at 40 kt to a flare: aim the sink rate by height
      const wantVs = s.info.agl > 8 ? -2.5 : -0.6;
      pilot(s, { ias: s.info.agl > 8 ? 40 * KT : 28 * KT, vs: wantVs });
    }
  });
  console.log(`   touchdown at ${speed.toFixed(0)} kt groundspeed, sink ${sink.toFixed(2)} m/s, stopped ${s.info.gs.toFixed(2)} m/s${s.crashed ? ' CRASHED ' + s.crashed.reason : ''}`);
  check('touched down', touchdown ? 1 : 0, 1, 1);
  check('touchdown sink rate gentle', sink, 0, 3.2, ' m/s');
  check('stopped on the brakes', s.info.gs, 0, 1, ' m/s');
  check('survived', s.crashed ? 1 : 0, 0, 0);
  check('nothing broke', s.damage.events.length, 0, 0);
}

// ------------------------------------------------------------------ 8. ground effect
console.log('Ground effect');
{
  // the same state, a free fall from rest with the rotor turning, high up and just over the ground
  const drop = (agl) => { const s = airborne(0, { rpm: 380, agl }); s.input.ignition = false; s.input.throttle = 0; run(s, 0.3); return { kG: s.info.groundEffect, vi: s.rotor.vi, T: s.rotor.thrust }; };
  const high = drop(100), low = drop(1.0);
  console.log(`   induced flow ${high.vi.toFixed(2)} m/s at 100 m, ${low.vi.toFixed(2)} m/s at 1 m (factor ${low.kG.toFixed(2)}); rotor thrust ${high.T.toFixed(0)} N → ${low.T.toFixed(0)} N`);
  check('no ground effect high up', high.kG, 0.99, 1);
  check('induced flow cut near the ground', low.kG, 0.6, 0.95);
  check('more rotor thrust near the ground for the same state', low.T / high.T, 1.02, 1.5);
  // and it is gone in forward flight
  const s = airborne(50 * KT, { rpm: 360, agl: 1.0 }); run(s, 0.3);
  check('no cushion at cruise speed', s.info.groundEffect, 0.97, 1);
}

// ------------------------------------------------------------------ 9. what breaks
// The crash is the first thing that breaks; the physics carries on, so a wreck tumbles and comes to rest.
console.log('Crashes: a drop, an over-flare, a rollover, a ditching, a wall');
{
  // dropped onto the mains from 3.5 m with the rotor turning: a leg folds, the frame comes down, the wreck stops where it is
  const s = airborne(3 * KT, { rpm: 340, agl: 3.5 }); s.input.throttle = 0.5;
  const x0 = s.pos[0], z0 = s.pos[2];
  let tRest = null;
  runOn(s, 25, () => { if (s.crashed && s.damage.rest > 1.0 && tRest == null) tRest = s.t - s.crashed.t; });
  console.log(`   dropped: ${s.crashed ? s.crashed.sink.toFixed(1) + ' m/s down — ' + events(s) : 'no crash'}`);
  check('a hard arrival folds a leg', s.crashed && /gear collapsed/.test(s.crashed.reason) ? 1 : 0, 1, 1);
  check('legs folded', s.damage.gear.reduce((a, b) => a + b, 0), 1, 4);
  check('the wreck comes to rest', tRest == null ? 99 : tRest, 0, 15, ' s');
  check('and stays put', Math.hypot(s.pos[0] - x0, s.pos[2] - z0), 0, 40, ' m');
}
{
  // an over-flare: the end of a flare at 22° nose-up, well past the tail wheel's 17° and short of the propeller's 28°,
  // settling from just above the street with no airspeed
  const s = GYRO.createState(); calm(s);
  GYRO.place(s, env, 0, 0, 0, { engineOn: true, rotorRpm: 340, airborne: { agl: 1.4, speed: 0 } });
  s.q = GYRO.qfromEuler(0, 22 * GYRO.D2R, 0); s.input.throttle = 0.3; s.input.lon = 0.3;
  let pitchTouch = null;
  runOn(s, 15, () => { if (s.ground.contacts > 0 && pitchTouch == null) pitchTouch = s.info.pitch; if (s.ground.wheels >= 2) { s.input.brake = 1; s.input.throttle = 0; } });
  console.log(`   over-flared: first touch at ${pitchTouch == null ? '—' : pitchTouch.toFixed(0) + '°'}, ${s.crashed ? 'CRASHED ' + events(s) : 'no crash'}, prop ${s.damage.prop ? 'struck' : 'whole'}`);
  check('the tail wheel touches first, nose-high', pitchTouch == null ? 0 : pitchTouch, 15, 30, '°');
  check('the propeller clears the ground', s.damage.prop, 0, 0);
  check('settles onto the mains', s.info.onGround && Math.abs(s.info.pitch) < 12 ? 1 : 0, 1, 1);
}
{
  // a touchdown banked 55° with the rotor turning: a blade strikes, the ground stops the rotor, the wreck lies on its side
  // (a kick in roll on the ground does not do it: the turning rotor is a gyroscope, and shrugs it off)
  const s = GYRO.createState(); calm(s);
  GYRO.place(s, env, 0, 0, 0, { engineOn: true, rotorRpm: 320, airborne: { agl: 1.3, speed: 0 } });
  s.q = GYRO.qfromEuler(0, 0, 55 * GYRO.D2R);
  runOn(s, 15);
  console.log(`   rolled: ${events(s)}; rotor ${s.info.rotorRpm.toFixed(0)} rpm, roll ${s.info.roll.toFixed(0)}°, rest ${s.damage.rest.toFixed(1)} s`);
  check('a blade strikes', /rotor strike/.test(events(s)) ? 1 : 0, 1, 1);
  check('the ground stops the rotor', s.info.rotorRpm, 0, 40, ' rpm');
  check('the blades are wrecked', s.damage.rotor, 0.5, 1);
  check('and the wrench takes more with it', s.damage.events.length, 2, 99, ' things broken');
  check('at rest', s.damage.rest, 1, 99, ' s');
}
{
  // a ditching: a gyro does not float; the engine quits in the water
  world.kind = 'water';
  const s = airborne(30 * KT, { agl: 6 }); s.input.throttle = 0.2;
  runOn(s, 20, () => { if (!s.crashed) pilot(s, { ias: 30 * KT, vs: -1.5 }); });
  console.log(`   ditched: ${events(s)}; CG ${s.info.agl.toFixed(2)} m over the water, engine ${s.engine.on ? 'running' : 'stopped'}`);
  check('ditched', /ditched/.test(s.crashed ? s.crashed.reason : '') ? 1 : 0, 1, 1);
  check('and sank', s.info.agl, -3, 0.3, ' m');
  check('engine quit in the water', s.engine.on ? 1 : 0, 0, 0);
  world.kind = 'pavement';
}
{
  // a wall: a building 20 m tall across the path (north is −z), 60 m ahead; the near face and the roof are the faces that matter
  env.wall = (x, y, z) => {
    if (z > -60 || z < -90 || Math.abs(x) > 20 || y > world.h + 20) return null;
    const pen = -60 - z, roof = world.h + 20 - y;
    return roof < pen ? { n: [0, 1, 0], pen: roof } : { n: [0, 0, 1], pen };
  };
  const s = airborne(45 * KT, { agl: 5 }); s.input.throttle = 0.6;
  runOn(s, 12, () => { if (!s.crashed) pilot(s, { pitch: 3, throttle: 0.6 }); });
  console.log(`   into a wall: ${events(s)}; stopped ${(-s.pos[2]).toFixed(0)} m along, ${s.info.gs.toFixed(1)} m/s`);
  check('hit the building', /building|wall/.test(s.crashed ? s.crashed.reason : '') ? 1 : 0, 1, 1);
  check('did not pass through it', -s.pos[2], -50, 66, ' m');
  check('stopped by it', s.info.gs, 0, 2, ' m/s');
  delete env.wall;
}

console.log(`\n${checks - failures}/${checks} checks passed${failures ? ` — ${failures} FAILED` : ''}`);
process.exit(failures ? 1 : 0);
