#!/usr/bin/env node
// Checks the Cat Sweater Pattern's drafting engine — the <script
// id="sweater-engine"> block of the tool page — for the properties a sewing
// pattern has to have, across every preset cat and every garment, closure
// and fabric:
//   - the pieces are simple polygons (stitch line and cutting line alike),
//   - the side seam is the same length on the back and belly pieces, since
//     they are sewn together,
//   - the leg-hole notches on the two pieces meet, and together go round the
//     leg with its ease,
//   - the neck opening and the hem come out to the girths they were drafted
//     from, i.e. the flattening preserved the widths,
//   - the back piece's fold is exactly the back length,
//   - the development is near-isometric: the flattened grid's edges keep
//     their 3D lengths,
//   - the pull-over fit check catches a neck that cannot pass the head.
// Pass `--engine path.js` to check a copy of the engine somewhere else.
//
//   node scripts/check-cat-sweater.mjs [--engine file]      (npm run check:cat-sweater)

import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const enginePath = args.includes('--engine') ? args[args.indexOf('--engine') + 1] : null;
const PAGE = 'public/tools/irl/cat-sweater.html';

let src;
if (enginePath) src = readFileSync(enginePath, 'utf8');
else {
  const html = readFileSync(PAGE, 'utf8');
  const m = html.match(/<script id="sweater-engine">([\s\S]*?)<\/script>/);
  if (!m) throw new Error(`${PAGE} has no <script id="sweater-engine"> block`);
  src = m[1];
}
const SWEATER = new Function('module', `${src}\nreturn SWEATER;`)({});

let failures = 0, checks = 0;
function check(name, ok, detail = '') {
  checks++;
  if (!ok) failures++;
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${detail ? ': ' + detail : ''}`);
}
function near(name, actual, expected, tolFrac, unit = 'mm') {
  const err = Math.abs(actual - expected);
  const tol = Math.abs(expected) * tolFrac;
  check(name, err <= tol, `${actual.toFixed(1)} vs ${expected.toFixed(1)} ${unit} (Δ ${err.toFixed(1)}, tol ${tol.toFixed(1)})`);
}
const finite = (pts) => pts.every((p) => isFinite(p[0]) && isFinite(p[1]));

// ------------------------------------------------------------- the sweep
const cases = [];
for (const preset of SWEATER.PRESETS) {
  for (const garment of ['sweater', 'harness']) {
    for (const closure of ['pullover', 'velcro']) {
      if (garment === 'harness' && closure === 'pullover') continue;
      for (const fabric of Object.keys(SWEATER.FABRICS)) {
        cases.push({ name: `${preset.name} · ${garment} · ${closure} · ${fabric}`, settings: { garment, closure, fabric, m: preset.m, opt: { cuffs: true, hemBand: true } } });
      }
    }
  }
}
// a few odd cats: long and thin, short and fat, every optional measurement given
cases.push({ name: 'long thin cat', settings: { garment: 'sweater', closure: 'pullover', fabric: 'fleece', m: { neck: 200, chest: 330, back: 400 } } });
cases.push({ name: 'short fat cat', settings: { garment: 'sweater', closure: 'pullover', fabric: 'rib', m: { neck: 260, chest: 520, back: 300 } } });
cases.push({ name: 'fully measured cat', settings: { garment: 'harness', closure: 'velcro', fabric: 'woven', m: { neck: 230, chest: 410, back: 340, legCirc: 150, neckToLeg: 80, chestWidth: 60, waist: 350, head: 290, bellyLength: 230 } } });
cases.push({ name: 'custom ease and allowance', settings: { garment: 'sweater', closure: 'velcro', fabric: 'woven', ease: 12, sa: 15, m: { neck: 220, chest: 400, back: 330 }, opt: { collar: 'binding' } } });

for (const c of cases) {
  console.log(c.name);
  const g = SWEATER.build(c.settings);
  const back = g.pieces.find((p) => p.id === 'back'), belly = g.pieces.find((p) => p.id === 'belly');
  const m = g.measurements, body = g.body;

  // shapes
  for (const p of g.pieces) {
    check(`${p.name}: finite outline and cut line`, finite(p.outline) && finite(p.cutLine));
    check(`${p.name}: stitch line is a simple polygon`, SWEATER.selfIntersects(p.outline) == null, `${p.outline.length} points`);
    check(`${p.name}: cutting line is a simple polygon`, SWEATER.selfIntersects(p.cutLine) == null, `${p.cutLine.length} points`);
    check(`${p.name}: cutting line encloses the stitch line`, p.outline.every((q) => p.fold && Math.abs(q[0]) < 1e-6 ? true : SWEATER.pointInPolygon(q[0], q[1], p.cutLine) || p.cutLine.some((r) => Math.hypot(r[0] - q[0], r[1] - q[1]) < 1e-6)));
    if (p.kind === 'piece') {
      const area = Math.abs(SWEATER.signedArea(p.outline)), areaCut = Math.abs(SWEATER.signedArea(p.cutLine));
      check(`${p.name}: seam allowance adds area`, areaCut > area, `${(areaCut - area).toFixed(0)} mm²`);
    }
  }
  // the fold is the back length
  const fold = back.segs.find((s) => s.tag === 'fold').pts;
  near('back fold length = back length', Math.abs(fold[0][1] - fold[fold.length - 1][1]), body.Lback, 0.001);
  check('back fold lies on x = 0', fold.every((p) => Math.abs(p[0]) < 1e-6));

  // the side seams match
  const [b1, b2] = g.edges.seamBack, [y1, y2] = g.edges.seamBelly;
  near('side seam, neck to leg hole: back = belly', b1, y1, 0.005);
  check('side seam below the leg hole: back ≥ belly (the belly turns into its hem)', b2 >= y2 - 0.5, `${b2.toFixed(1)} vs ${y2.toFixed(1)} mm`);

  // the leg hole: the notches meet at the same seam distance from the neck, and the two halves go round the leg
  const holeB = back.segs.find((s) => s.tag === 'hole').pts, holeY = belly.segs.find((s) => s.tag === 'hole').pts;
  const chordB = Math.hypot(holeB[0][0] - holeB[holeB.length - 1][0], holeB[0][1] - holeB[holeB.length - 1][1]);
  const chordY = Math.hypot(holeY[0][0] - holeY[holeY.length - 1][0], holeY[0][1] - holeY[holeY.length - 1][1]);
  near('leg-hole notch chord: back = belly', chordB, chordY, 0.02);
  const hf = body.surface(body.sHole - body.legR, body.fSeam), hb = body.surface(body.sHole + body.legR, body.fSeam);
  near('leg-hole notch chord = the hole\'s length along the seam on the body', chordB, Math.hypot(hf[0] - hb[0], hf[1] - hb[1], hf[2] - hb[2]), 0.03);
  const fab = SWEATER.FABRICS[c.settings.fabric];
  near('leg hole goes round the leg with its ease', g.edges.holeOpening, m.legCirc * (1 + fab.holeEase), 0.04);

  // widths were preserved: the neck opening and the belly hem are the girths they came from
  const Gg = body.Gg;
  // the neck ring, tilted, is longer than the girth at the collar by the slant; its true length is the 3D curve
  let neck3d = 0, prev = null;
  for (let k = 0; k <= 400; k++) {
    const f = k / 400, p = body.surface(body.sFront(f), f);
    if (prev) neck3d += Math.hypot(p[0] - prev[0], p[1] - prev[1], p[2] - prev[2]);
    prev = p;
  }
  near('neck opening = the 3D length of the collar line', g.edges.neckOpening, neck3d, 0.015);
  near('belly piece width between the leg holes = chest width with ease', 2 * holeY[12][0], m.chestWidth * (1 + g.settings.ease), 0.06);
  check('seam fraction between a half and four fifths of the ring', body.fTop >= 0.5 && body.fTop <= 0.8, body.fTop.toFixed(3));

  // the development kept its lengths: each run of the (s, f) outline is as
  // long flat as it is on the body (the chest front is doubly curved, so the
  // belly piece's leg notch and hem carry a little of that, within a few %)
  for (const [name, piece, region] of [['back', back, g.regions.back], ['belly', belly, g.regions.belly]]) {
    for (const sg of region) {
      if (sg.tag === 'fold') continue;
      const seg = piece.segs.find((s) => s.tag === sg.tag && s.param.length === sg.pts.length);
      let d3 = 0;
      for (let k = 1; k < sg.pts.length; k++) {
        const pa = body.surface(sg.pts[k - 1][0], sg.pts[k - 1][1]), pb = body.surface(sg.pts[k][0], sg.pts[k][1]);
        d3 += Math.hypot(pa[0] - pb[0], pa[1] - pb[1], pa[2] - pb[2]);
      }
      const d2 = SWEATER.polyLength(seg.raw);
      if (d3 < 5) continue;
      near(`${name} ${sg.tag}: flat length = length on the body`, d2, d3, sg.tag === 'seam' || sg.tag === 'neck' ? 0.03 : 0.06);
    }
  }

  // what a sewer is told
  check('a sewing title and at least two pieces', g.title.length > 0 && g.pieces.length >= 2, `${g.pieces.length} pieces`);
  check('fabric estimate is a sensible length', g.yardage.length >= 200 && g.yardage.length <= 1500, `${g.yardage.length} mm of ${g.yardage.width} mm wide`);
  if (c.settings.closure === 'velcro' || c.settings.garment === 'harness') {
    check('split back carries an overlap strip', back.extension > 0 && back.bbox[0] < -back.extension + 1e-6, `x from ${back.bbox[0].toFixed(1)}`);
    check('velcro is on the shopping list', g.notions.some((n) => /hook-and-loop/.test(n.item)));
  }
  if (c.settings.garment === 'harness') {
    check('harness back ends just behind the leg holes', body.Lback > body.sHole + body.legR && body.Lback < body.sHole + body.legR + 60, `${body.Lback.toFixed(0)} mm`);
    check('harness has a D-ring mark on the back', back.marks.some((k) => k.kind === 'dring'));
  }
}

// ------------------------------------------------------ the fit check
console.log('fit check');
{
  const tight = SWEATER.build({ garment: 'sweater', closure: 'pullover', fabric: 'woven', opt: { collar: 'hem' }, m: { neck: 220, chest: 400, back: 330 } });
  check('a woven pull-over with a plain neck warns that the head will not pass', tight.fit.warnings.some((w) => /head/.test(w)));
  const fine = SWEATER.build({ garment: 'sweater', closure: 'pullover', fabric: 'rib', m: { neck: 220, chest: 400, back: 330 } });
  check('a rib-knit pull-over passes the head', !fine.fit.warnings.some((w) => /head/.test(w)));
  const swapped = SWEATER.build({ garment: 'sweater', m: { neck: 400, chest: 220, back: 330 } });
  check('swapped neck and chest are flagged', swapped.warnings.some((w) => /swapped/.test(w)));
  const d = SWEATER.derive({ neck: 220, chest: 400, back: 330, legCirc: 150 });
  check('a given measurement is kept, the rest derived', d.legCirc === 150 && !d.derived.legCirc && d.derived.neckToLeg);
  check('units: 25.4 mm is an inch', Math.abs(SWEATER.toUnit(25.4, 'in') - 1) < 1e-9 && Math.abs(SWEATER.fromUnit(1, 'in') - 25.4) < 1e-9);
}

console.log(`\n${checks - failures}/${checks} checks passed`);
process.exit(failures ? 1 : 0);
