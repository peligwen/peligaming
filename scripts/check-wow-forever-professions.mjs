#!/usr/bin/env node
// Checks the WoW Forever Profession Catalogue: the arithmetic in the page's
// <script id="catalogue-model"> block, and the data file the page reads.
//
// The model is checked for what it has to be whatever the recipe:
//   - a recipe below its yellow level is orange and certain, at or past its
//     grey level grey and worthless, and never rises in between,
//   - the colours agree with the chance (yellow is the better half of the
//     slope, green the worse),
//   - the talent never lowers a chance, never lifts it past certain, and
//     never gives a grey recipe a point, in either of its two readings,
//   - the expected crafts match the sums worked by hand, and the crafts
//     that are enough nine times in ten match the odds worked by hand,
//   - money reads and writes the way the game writes it,
//   - the route picks what a hand calculation picks on small made-up recipe
//     books (the cheaper recipe per point, the switch at the right skill, what
//     was made earlier used before anything is bought, what a later step
//     needs made ahead while making it still gives points), and on every real
//     profession it is a route: unbroken, only recipes the player has by
//     then, only while they can give a point, a bill that adds up, and never
//     the worse for what it makes ahead.
// The data is checked for shape: every recipe in a category, levels in
// order, every item it names present, every learn level carrying its source,
// prices and ranks where they should be.
//
//   node scripts/check-wow-forever-professions.mjs      (npm run check:professions)

import { readFileSync } from "node:fs";

const PAGE = "public/tools/wow-forever/profession-catalogue.html";
const DATA = "public/tools/wow-forever/data/professions/professions.json";

const html = readFileSync(PAGE, "utf8");
const block = html.match(/<script id="catalogue-model">([\s\S]*?)<\/script>/);
if (!block) throw new Error(`${PAGE} has no <script id="catalogue-model"> block`);
const M = new Function("module", `${block[1]}\nreturn CATALOGUE;`)({});
const D = JSON.parse(readFileSync(DATA, "utf8"));

let failures = 0, checks = 0;
function check(name, ok, detail = "") {
  checks++;
  if (!ok) failures++;
  console.log(`${ok ? "  ✓" : "  ✗"} ${name}${detail ? ": " + detail : ""}`);
}
const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;

// ------------------------------------------------------------------ the model
console.log("model");
{
  const r = { y: 100, g: 140 };
  check("green is halfway from yellow to grey", M.green(r) === 120 && M.green({ y: 20, g: 25 }) === 22);
  check("colours at the edges", M.colour(r, 99) === "orange" && M.colour(r, 100) === "yellow" && M.colour(r, 119) === "yellow" &&
    M.colour(r, 120) === "green" && M.colour(r, 139) === "green" && M.colour(r, 140) === "grey" && M.colour({}, 50) === "none");
  check("certain below yellow and on the first yellow point", M.baseChance(r, 1) === 1 && M.baseChance(r, 99) === 1 && M.baseChance(r, 100) === 1);
  check("a half as it turns green, nothing as it turns grey", near(M.baseChance(r, 120), 0.5) && M.baseChance(r, 140) === 0 && M.baseChance(r, 300) === 0);
  check("a straight line between", near(M.baseChance(r, 110), 0.75) && near(M.baseChance(r, 130), 0.25) && near(M.baseChance(r, 139), 0.025));
  check("a recipe yellow and grey at the same level goes from certain to nothing", M.baseChance({ y: 300, g: 300 }, 299) === 1 && M.baseChance({ y: 300, g: 300 }, 300) === 0 && M.colour({ y: 300, g: 300 }, 299) === "orange");
  check("a recipe that gives no skill never does", M.baseChance({}, 1) === 0 && M.chance({}, 1, 20, "+") === 0 && M.crafts({}, 1, 2) === Infinity);
  check("the talent, multiplied: 50% → 60%, capped at certain", near(M.chance(r, 120, 20, "x"), 0.6) && M.chance(r, 105, 20, "x") === 1);
  check("the talent, added: 50% → 70%, capped at certain", near(M.chance(r, 120, 20, "+"), 0.7) && M.chance(r, 105, 20, "+") === 1);
  check("the talent does nothing for a grey recipe", M.chance(r, 140, 20, "x") === 0 && M.chance(r, 140, 20, "+") === 0);
  check("no ranks, no change", M.chance(r, 123, 0, "x") === M.baseChance(r, 123) && M.chance(r, 123, 0, "+") === M.baseChance(r, 123));

  // expected crafts, against sums worked by hand: Σ 1/p over the points gained
  const H = (n) => { let s = 0; for (let k = 1; k <= n; k++) s += 1 / k; return s; };
  const t = { y: 10, g: 20 };
  check("orange points cost one craft each", M.crafts(t, 5, 10) === 5);
  check("yellow to grey is (grey − yellow) × H(grey − yellow)", near(M.crafts(t, 10, 20), 10 * H(10), 1e-9), `${M.crafts(t, 10, 20).toFixed(4)} vs ${(10 * H(10)).toFixed(4)}`);
  check("crafts add up across a split", near(M.crafts(t, 5, 20), M.crafts(t, 5, 13) + M.crafts(t, 13, 20)));
  check("past grey there is no number of crafts", M.crafts(t, 15, 21) === Infinity);
  check("the talent saves crafts", M.crafts(t, 10, 20, 20, "x") < M.crafts(t, 10, 20) && M.crafts(t, 10, 20, 20, "+") < M.crafts(t, 10, 20, 20, "x"));
  // multiplied by 1.2: certain while (20 − s)/10 ≥ 1/1.2, i.e. s ≤ 11, then 10 / (1.2 × (20 − s))
  let byHand = 2; for (let s = 12; s < 20; s++) byHand += 10 / (1.2 * (20 - s));
  check("the multiplied talent, by hand", near(M.crafts(t, 10, 20, 20, "x"), byHand), `${M.crafts(t, 10, 20, 20, "x").toFixed(4)} vs ${byHand.toFixed(4)}`);
  check("a recipe that gives two points a success takes half the crafts", near(M.crafts({ y: 50, g: 60, u: 2 }, 40, 50), 5));

  // the crafts that are enough nine times in ten
  check("certain points need no margin", M.craftsQuantile(t, 3, 10) === 7 && M.craftsQuantile(t, 5, 5) === 0);
  // one point at a half: enough in n crafts with odds 1 − ½ⁿ, so four; at one in five, eleven
  check("one point at 50% is safe in four crafts, at 20% in eleven", M.craftsQuantile(t, 15, 16) === 4 && M.craftsQuantile(t, 18, 19) === 11);
  // two certain points then one at a half: two crafts more than the single point at a half
  check("two certain points and a 50% one are safe in six", M.craftsQuantile({ y: 15, g: 17 }, 14, 16) === 2 && M.craftsQuantile({ y: 15, g: 17 }, 14, 17) === 6);
  check("more caution never means fewer crafts, and never fewer than the points", M.craftsQuantile(t, 10, 20, 0, "x", 0.5) <= M.craftsQuantile(t, 10, 20) && M.craftsQuantile(t, 10, 20) <= M.craftsQuantile(t, 10, 20, 0, "x", 0.99) && M.craftsQuantile(t, 10, 20, 0, "x", 0.5) >= 10,
    `half the time ${M.craftsQuantile(t, 10, 20, 0, "x", 0.5)}, nine in ten ${M.craftsQuantile(t, 10, 20)}, ninety-nine in a hundred ${M.craftsQuantile(t, 10, 20, 0, "x", 0.99)}, on average ${M.crafts(t, 10, 20).toFixed(1)}`);
  check("past grey there is no safe number either", M.craftsQuantile(t, 15, 21) === Infinity);
}

// ---------------------------------------------------------------------- money
console.log("money");
{
  check("written as the game writes it", M.money(0) === "0c" && M.money(5) === "5c" && M.money(120) === "1s 20c" && M.money(2000) === "20s" && M.money(12345) === "1g 23s" && M.money(2000000) === "200g" && M.money(12345678) === "1,234g" && M.money(null) === "?" && M.money(Infinity) === "?");
  check("read back", M.parseMoney("1g 20s 5c") === 12005 && M.parseMoney("2g50s") === 25000 && M.parseMoney("35s") === 3500 && M.parseMoney("80c") === 80 && M.parseMoney("1.5g") === 15000 && M.parseMoney(" 0 ") === 0);
  check("a bare number is silver", M.parseMoney("12") === 1200 && M.parseMoney("2.5") === 250);
  check("what is not a price is not one", M.parseMoney("") === null && M.parseMoney("cheap") === null && M.parseMoney("1g x") === null && M.parseMoney("s") === null);
  let round = true;
  for (const c of [0, 1, 99, 100, 101, 2550, 9999]) if (M.parseMoney(M.money(c)) !== c) round = false;
  check("under a gold, what is written reads back to the copper", round);
}

// ------------------------------------------------------------------ the route
console.log("route, on made-up recipe books");
{
  const prices = { 1: 10, 2: 30, 3: 3 };
  const price = (id) => (id in prices ? prices[id] : null);
  const names = (R) => R.steps.map((st) => `${st.r ? st.r.n : "gap"} ${st.from}-${st.to}`).join(", ");
  // A is cheap and goes grey at 20, B is three times the price and lasts to 30.
  // A point from A costs 100 ÷ (20 − s) past 10; from B 30 until 15, then 450 ÷ (30 − s).
  // A stays the cheaper through 17 (33.3 against 34.6) and loses at 18 (50 against 37.5).
  const A = { n: "A", y: 10, g: 20, r: [[1, 1]], from: 1 }, B = { n: "B", y: 15, g: 30, r: [[2, 1]], from: 1 };
  let R = M.route({ pool: [A, B], a: 1, b: 30, price, stick: 0 });
  check("the cheaper point wins, and the switch comes where the sums say", names(R) === "A 1-18, B 18-30", names(R));
  check("its crafts are the recipes' own", near(R.crafts, M.crafts(A, 1, 18) + M.crafts(B, 18, 30)) && R.points === 29 && R.craftsSafe === R.steps[0].craftsSafe + R.steps[1].craftsSafe);
  check("its bill is its crafts at their prices", near(R.typical.total.cost, 10 * M.crafts(A, 1, 18) + 30 * M.crafts(B, 18, 30)) && near(R.typical.total.buys.get(1), M.crafts(A, 1, 18)), M.money(R.typical.total.cost));
  check("buying to be safe costs more, by each step's margin", R.cautious.total.cost > R.typical.total.cost && near(R.cautious.total.cost, 10 * R.steps[0].craftsSafe + 30 * R.steps[1].craftsSafe));
  // B is learned at 22: A is ridden to its last point, and 20 and 21 are a gap
  R = M.route({ pool: [A, Object.assign({}, B, { from: 22 })], a: 1, b: 30, price });
  check("where nothing gives a point there is a gap, and the route goes on after it", names(R) === "A 1-20, gap 20-22, B 22-30" && R.points === 27 && R.gaps.length === 1, names(R));
  // leave a recipe under one in two: A is at 50% on 15 and 40% on 16, where B is still above nine in ten
  R = M.route({ pool: [A, B], a: 1, b: 30, price, stick: 0, least: 0.5 });
  check("a recipe is left once it drops under the mark, if something better is to hand", names(R) === "A 1-16, B 16-30", names(R));
  R = M.route({ pool: [A], a: 1, b: 20, price, least: 0.5 });
  check("and ridden to the end if nothing is", names(R) === "A 1-20");
  // staying put: within a twentieth of the best is not worth a change
  const C = { n: "C", y: 50, g: 60, r: [[1, 1]], from: 1 }, Cx = { n: "C′", y: 50, g: 60, r: [[1, 1]], from: 5 };
  R = M.route({ pool: [C, Cx], a: 1, b: 20, price });
  check("no change of recipe for nothing", names(R) === "C 1-20", names(R));
  // quickest: the three-second craft over the minute-long one, whatever it costs
  const slow = { n: "slow", y: 50, g: 60, r: [[1, 1]], ct: 60, from: 1 }, fast = { n: "fast", y: 50, g: 60, r: [[2, 5]], ct: 3, from: 1 };
  check("cheapest and quickest are different routes", names(M.route({ pool: [slow, fast], a: 1, b: 10, price })) === "slow 1-10" && names(M.route({ pool: [slow, fast], a: 1, b: 10, price, goal: "time" })) === "fast 1-10");
  check("and the time is the crafts at their cast times", near(M.route({ pool: [slow], a: 1, b: 10, price }).typical.seconds, 540) && near(M.route({ pool: [fast], a: 1, b: 10, price }).typical.seconds, 27));
  // what has to be made on the side takes time too: a three-second craft that needs a minute's
  // smelting first is 63 seconds a point, and the ten-second one beats it
  const smelt = { n: "smelt", y: 1, g: 1, r: [[1, 1]], p: [8, 1], ct: 60, from: 1 }, quick = { n: "quick", y: 50, g: 60, r: [[8, 1]], ct: 3, from: 1 }, steady = { n: "steady", y: 50, g: 60, r: [[2, 1]], ct: 10, from: 1 };
  check("quickest counts the time of what is made on the side", names(M.route({ pool: [smelt, quick, steady], a: 1, b: 10, price, goal: "time" })) === "steady 1-10" && near(M.route({ pool: [smelt, quick], a: 1, b: 10, price, goal: "time" }).typical.seconds, 9 * 63));
  // What you made earlier is yours. S makes an X from two of item 1 (20 a craft, yellow at 5, grey at 10);
  // T takes an X and one of item 1 — 30 a point if the X has to be made for it.
  // S is the cheaper point through 6 (20, 20, 20, 20, 20, 25) and dearer at 7 (33.3): six points, 6.25 X.
  // T then spends them, 10 a point, from 7 to 11, and 1.25 X are left.
  const S = { n: "S", y: 5, g: 10, r: [[1, 2]], p: [9, 1], from: 1 }, T = { n: "T", y: 20, g: 30, r: [[9, 1], [1, 1]], from: 1 };
  R = M.route({ pool: [S, T], a: 1, b: 12, price });
  check("a batch is finished before it is spent: no taking turns a point at a time", names(R) === "S 1-7, T 7-12", names(R));
  check("what was made on the way is used before anything is bought", near(R.typical.total.cost, 175) && near(R.typical.total.buys.get(1), 17.5) && near(R.typical.per[1].cost, 50) && !R.typical.total.side.size && near(R.typical.left.get(9), 1.25), M.money(R.typical.total.cost));
  // on to 16, in one plain pass: the last X goes at 12, a quarter of one is left for 13, and 2.75 are made on the side
  R = M.route({ pool: [S, T], a: 1, b: 16, price, ahead: false });
  check("and what runs out is made, not bought, by a recipe the player has", names(R) === "S 1-7, T 7-16" && near(R.typical.total.side.get(S), 2.75) && !R.typical.total.buys.has(9) && near(R.typical.total.cost, 270) && near(R.typical.left.get(9) || 0, 0), `${names(R)}: ${M.money(R.typical.total.cost)}`);
  // The route proper makes those ahead. They were going to be made at 13 and after, when S is long grey;
  // made at 7, where S still gives a point six times in ten, 1.67 of them are a point T need not give.
  // S then runs 1 to 8 and makes 5 + 1.25 + 1.67 = 7.92 X, T takes 8 from 8 to 16, and a twelfth of an X
  // is still made on the side: 24 of item 1 in all, 240 against 270.
  R = M.route({ pool: [S, T], a: 1, b: 16, price });
  check("what would be made on the side is made ahead, while making it still gives points", names(R) === "S 1-8, T 8-16" && R.steps[0].pre === 8 && near(R.typical.total.cost, 240) && near(R.typical.total.buys.get(1), 24) && near(R.typical.total.side.get(S), 1 / 12) && near(R.plain.cost, 270), `${names(R)}: ${M.money(R.typical.total.cost)} against ${M.money(R.plain.cost)}`);
  // P makes an X from one of item 1 (yellow at 10, grey at 20). F is the cheap filler, 3 a craft, grey at 20.
  // C is all there is from 20, and takes two X and one of item 3 a craft.
  // Plain: F from 1 to 20 (25.42 crafts, 76.25), then C to 30 with twenty X made on the side at grey: 306.25.
  // Ahead: the twenty X are due from skill 1. P gives a point for 1 X through 10, then for 1.11, 1.25, 1.43,
  // 1.67, 2 and 2.5 — 19.96 X by 17 — and the point at 17 would take 3.33 with 0.04 wanted, so it is left to F.
  // F does 17 to 20 (9.17 crafts, 27.5) and C uses the X: 200 + 27.5 + 30 = 257.5.
  const P = { n: "P", y: 10, g: 20, r: [[1, 1]], p: [9, 1], from: 1 }, F = { n: "F", y: 15, g: 20, r: [[3, 1]], from: 1 }, Cn = { n: "C", y: 40, g: 60, r: [[9, 2], [3, 1]], from: 20 };
  R = M.route({ pool: [P, F, Cn], a: 1, b: 30, price, ahead: false });
  check("a reagent wanted later is, in a plain pass, made when it is wanted", names(R) === "F 1-20, C 20-30" && near(R.typical.total.side.get(P), 20) && near(R.typical.total.cost, 306.25), `${names(R)}: ${M.money(R.typical.total.cost)}`);
  R = M.route({ pool: [P, F, Cn], a: 1, b: 30, price });
  check("and in the route as soon as it can be made, for as long as it gives points", names(R) === "P 1-17, F 17-20, C 20-30" && R.steps[0].pre === 17 && near(R.typical.total.cost, 257.5) && near(R.plain.cost, 306.25) && R.ahead.get(P) > 19.9, `${names(R)}: ${M.money(R.typical.total.cost)} against ${M.money(R.plain.cost)}`);
  check("what is made ahead is a number of crafts, the same to be safe as on average", R.steps[0].craftsSafe === 20 && near(R.steps[0].crafts, 19.956, 0.001) && R.cautious.total.cost >= R.typical.total.cost);
  // G would give a point from 17 for five X and nothing else: 50 if the X are paid for, nothing if they are
  // lying about. They are not lying about: they are C's.
  const G = { n: "G", y: 40, g: 60, r: [[9, 5]], from: 17 };
  R = M.route({ pool: [P, F, Cn, G], a: 1, b: 30, price });
  check("and it is kept for the step that needs it, not there for the taking", names(R) === "P 1-17, F 17-20, C 20-30" && near(R.typical.total.cost, 257.5), names(R));
  // nothing later wants an X: nothing is made ahead, and the route is the plain one
  R = M.route({ pool: [P, F], a: 1, b: 20, price });
  check("nothing is made ahead that nothing uses", names(R) === "F 1-20" && !R.ahead && !R.plain);
  check("a recipe not yet learned makes nothing", (() => { const late = Object.assign({}, S, { from: 99 }); const r2 = M.route({ pool: [late, T], a: 1, b: 4, price: (id) => (id === 9 ? 500 : price(id)) }); return near(r2.typical.total.buys.get(9), 3) && near(r2.typical.total.cost, 1530); })());
  // no price: left alone while something priced will do, used and flagged when nothing else will
  const U = { n: "U", y: 50, g: 60, r: [[7, 1]], from: 1 };
  check("a recipe with an unpriced material waits for a price", names(M.route({ pool: [U, B], a: 1, b: 10, price })) === "B 1-10");
  R = M.route({ pool: [U], a: 1, b: 10, price });
  check("unless it is all there is, and then the bill says what has no price", names(R) === "U 1-10" && R.typical.total.unpriced.has(7) && R.typical.total.cost === 0);
  check("a cooldown recipe is nobody's way of making stock", M.makersOf([Object.assign({}, S, { cd: 3600 })]).size === 0 && M.makersOf([S]).get(9) === S);
  check("the talent shortens the route's crafts", M.route({ pool: [A, B], a: 1, b: 30, price, bonus: 20 }).crafts < M.route({ pool: [A, B], a: 1, b: 30, price }).crafts);
}

// --------------------------------------------- the model over every real recipe
console.log("model, over every recipe in the data");
{
  const cap = D.skillCap, top = D.talent.ranks[D.talent.ranks.length - 1];
  let recipes = 0, points = 0;
  const bad = { edge: [], order: [], colour: [], talent: [] };
  for (const p of D.professions) for (const r of p.recipes) {
    recipes++;
    let prev = 1;
    for (let s = 1; s <= cap; s++) {
      points++;
      const c = M.colour(r, s), b = M.baseChance(r, s), x = M.chance(r, s, top, "x"), a = M.chance(r, s, top, "+");
      const who = `${p.name} / ${r.n} at ${s}`;
      if ((c === "orange" && b !== 1) || ((c === "grey" || c === "none") && (b !== 0 || x !== 0 || a !== 0))) bad.edge.push(who);
      if (b > prev + 1e-12 || b < 0 || b > 1) bad.order.push(who);
      if ((c === "yellow" && !(b > 0.5)) || (c === "green" && !(b > 0 && b <= 0.5 + 0.5 / (r.g - r.y) + 1e-12))) bad.colour.push(who);
      if (x < b - 1e-12 || a < x - 1e-12 || a > 1 || x > 1) bad.talent.push(who);
      prev = b;
    }
  }
  const first = (list) => (list.length ? `${list.length}, first ${list[0]}` : `${recipes} recipes × ${cap} skill levels`);
  check("orange is certain, grey and no-skill recipes give nothing, talent or not", !bad.edge.length, first(bad.edge));
  check("the chance never rises with skill and stays within 0–100%", !bad.order.length, first(bad.order));
  check("yellow is above a half, green at or below it", !bad.colour.length, first(bad.colour));
  check("the talent never lowers a chance, and adding gives at least as much as multiplying", !bad.talent.length, first(bad.talent));
  void points;
}

// ------------------------------------------------- the route, on the real data
console.log("route, over every profession: what a trainer teaches, then every recipe");
{
  const price = (id) => (D.items[id] && D.items[id][2] > 0 ? D.items[id][2] : null);
  const cap = D.skillCap, faults = [], lines = [], saved = [];
  let routes = 0, ahead = 0;
  for (const p of D.professions) for (const all of [false, true]) for (const goal of ["cost", "time"]) {
    for (const r of p.recipes) r.from = r.l != null ? r.l : 1;
    const pool = p.recipes.filter((r) => !r.x && !r.cd && r.g != null && ("ate".includes(r.s) || (all && r.s === "i")));
    const opts = { pool, a: 1, b: cap, price, goal, least: 0.25 };
    const R = M.route(opts), who = `${p.name} (${all ? "every recipe" : "trainer"}, ${goal})`;
    routes++;
    // making ahead: never fewer points, never dearer (or slower), and only of things the player makes
    const plain = M.route(Object.assign({}, opts, { ahead: false })), measure = (X) => (goal === "time" ? X.typical.seconds : X.typical.total.cost);
    if (R.points < plain.points || (R.points === plain.points && R.typical.total.unpriced.size === plain.typical.total.unpriced.size && measure(R) > measure(plain) * (1 + 1e-9))) faults.push(`${who}: the worse for making ahead`);
    if (R.ahead) {
      ahead++;
      if (!near(R.plain.cost, plain.typical.total.cost, 1e-6 * Math.max(1, plain.typical.total.cost))) faults.push(`${who}: the plain route it reports is not the plain route`);
      for (const [m, n] of R.ahead) if (!(n > 0) || !m.p || !pool.includes(m)) faults.push(`${who}: makes ${m.n} ahead`);
      if (!R.steps.some((st) => st.pre)) faults.push(`${who}: something to make ahead and no step that does`);
      if (goal === "cost") saved.push(1 - R.typical.total.cost / plain.typical.total.cost);
    }
    for (const st of R.steps) if (st.pre && !(R.ahead && R.ahead.has(st.r) && st.pre > st.from && st.pre <= st.to)) faults.push(`${who}: ${st.r.n} marked as made ahead at ${st.from}`);
    let at = 1, last = null, paid = 0;
    for (const st of R.steps) {
      if (st.from !== at || st.to <= st.from) faults.push(`${who}: broken at ${st.from}`);
      at = st.to;
      if (st.r && st.r === last) faults.push(`${who}: ${st.r.n} twice running at ${st.from}`);
      last = st.r;
      for (let s = st.from; s < st.to; s++) {
        if (st.r) { if (st.r.from > s || M.chance(st.r, s) <= 0 || !pool.includes(st.r)) faults.push(`${who}: ${st.r.n} cannot give a point at ${s}`); }
        else if (pool.some((r) => r.from <= s && M.chance(r, s) > 0)) faults.push(`${who}: a gap at ${s} with a recipe to hand`);
      }
      if (st.r && !(st.crafts >= st.to - st.from - 1e-9 && st.craftsSafe >= Math.floor(st.crafts) && st.craftsSafe >= st.to - st.from)) faults.push(`${who}: crafts out of order at ${st.from}`);
    }
    if (at !== cap) faults.push(`${who}: ends at ${at}`);
    for (const [id, n] of R.typical.total.buys) { if (!(n > 0)) faults.push(`${who}: buys ${n} of ${id}`); paid += n * (price(id) || 0); }
    if (!near(paid, R.typical.total.cost, 1e-6 * Math.max(1, paid))) faults.push(`${who}: the bill is ${R.typical.total.cost}, its lines come to ${paid}`);
    if (!near(R.typical.per.reduce((n, led) => n + led.cost, 0), R.typical.total.cost, 1e-6 * Math.max(1, paid))) faults.push(`${who}: the steps do not add up to the bill`);
    if (R.cautious.total.cost < R.typical.total.cost - 1e-6) faults.push(`${who}: buying to be safe is cheaper`);
    if (JSON.stringify(M.route(opts).steps.map((st) => [st.from, st.to, st.r && st.r.i])) !== JSON.stringify(R.steps.map((st) => [st.from, st.to, st.r && st.r.i]))) faults.push(`${who}: not the same route twice`);
    if (goal === "cost") lines.push(`${p.name}, ${all ? "every recipe" : "trainer's"}: ${R.points} of ${cap - 1} points, ${R.steps.filter((st) => st.r).length} steps, ${Math.round(R.crafts)} crafts, ${M.money(R.typical.total.cost)}`);
  }
  check("every route is unbroken, uses only what the player has by then and only while it gives a point", !faults.length, faults.length ? `${faults.length}, first: ${faults[0]}` : `${routes} routes`);
  check("and none is the worse for what it makes ahead", !faults.length && ahead > 0, `${ahead} of ${routes} make something ahead; of the cheapest routes, by up to ${(Math.max(0, ...saved) * 100).toFixed(1)}% cheaper for it`);
  for (const l of lines) console.log(`      ${l}`);
}

// ------------------------------------------------------------------- the data
console.log("data");
{
  check("product, build, baseline and cap are stated", !!D.product && !!D.eraProduct && /^\d+\.\d+\.\d+\.\d+$/.test(D.build) && /^\d+\.\d+\.\d+\.\d+$/.test(D.eraBuild) && Number.isInteger(D.skillCap) && D.skillCap > 0, `${D.product} ${D.build}, baseline ${D.eraProduct} ${D.eraBuild}, cap ${D.skillCap}`);
  const ranks = D.talent.ranks;
  check("the talent has ranks, each worth more than the last", D.talent.name && ranks.length > 0 && ranks.every((v, i) => v > 0 && (i === 0 || v > ranks[i - 1])) && D.talent.text.includes("$s1"), `${D.talent.name}: ${ranks.join(", ")}`);

  const faults = { cat: [], levels: [], learn: [], items: [], dup: [], leftover: [], estimate: [] };
  const counts = { recipes: 0, leftovers: 0, a: 0, i: 0, t: 0, e: 0, u: 0 };
  const item = (id) => D.items[id];
  for (const p of D.professions) {
    const seen = new Set();
    for (const r of p.recipes) {
      const who = `${p.name} / ${r.n} (${r.i})`;
      counts.recipes++; counts[r.s]++; if (r.x) counts.leftovers++;
      if (seen.has(r.i)) faults.dup.push(who); seen.add(r.i);
      if (!Number.isInteger(r.c) || !p.categories[r.c] || !r.n) faults.cat.push(who);
      if (r.g != null ? !(Number.isInteger(r.y) && Number.isInteger(r.g) && r.y >= 1 && r.y <= r.g) : r.y != null) faults.levels.push(who);
      if (!"aiteu".includes(r.s) || (r.s === "u") !== (r.l == null) || (r.l != null && !(Number.isInteger(r.l) && r.l >= 1)) || (r.s === "i") !== (r.ri != null)) faults.learn.push(who);
      if ((r.s === "e") !== (r.v != null) || (r.s === "e" && (!r.dy || r.l !== Math.max(1, r.v + r.dy)))) faults.estimate.push(who);
      if ((r.s === "t" || r.s === "e") && r.g != null && r.l > r.g) faults.estimate.push(who);
      if ((r.p && !(item(r.p[0]) && r.p[1] >= 1)) || (r.ri != null && !(item(r.ri) && item(r.ri)[0])) || (r.r || []).some(([id, n]) => !item(id) || !(n >= 1))) faults.items.push(who);
      if (!!r.x !== (p.categories[r.c] === "SEASON OF DISCOVERY")) faults.leftover.push(who);
    }
  }
  const first = (list, fine) => (list.length ? `${list.length}, first ${list[0]}` : fine);
  check("every recipe is named, in a category of its profession", !faults.cat.length, first(faults.cat, `${counts.recipes} recipes, ${D.professions.length} professions`));
  check("no recipe is listed twice in a profession", !faults.dup.length, first(faults.dup, ""));
  check("yellow is at or below grey wherever a recipe gives skill", !faults.levels.length, first(faults.levels, ""));
  check("every learn level carries its source, and only unknown ones are missing", !faults.learn.length, first(faults.learn, `start ${counts.a}, item ${counts.i}, vanilla trainer ${counts.t}, estimate ${counts.e}, unknown ${counts.u}`));
  check("every estimate is vanilla's level plus the recipe's move, and none lands past grey", !faults.estimate.length, first(faults.estimate, ""));
  check("every product, reagent and recipe item is in the item list", !faults.items.length, first(faults.items, `${Object.keys(D.items).length} items`));
  check("the leftovers are exactly the client's Season of Discovery category", !faults.leftover.length, first(faults.leftover, `${counts.leftovers} leftovers`));
  const L = D.stats.learn;
  check("the stated totals are the counted ones", D.stats.recipes === counts.recipes && D.stats.leftovers === counts.leftovers && L.auto === counts.a && L.item === counts.i && L.trainer === counts.t && L.estimate === counts.e && L.unknown === counts.u);
  const sc = D.stats.shiftCheck;
  check("recipe items moved with their recipes often enough to lean on", sc.total >= 100 && sc.match / sc.total >= 0.9, `${sc.match} of ${sc.total} (${((100 * sc.match) / sc.total).toFixed(1)}%)`);
  // prices and ranks, for the route
  const reagents = new Set(), products = new Set();
  for (const p of D.professions) for (const r of p.recipes) { for (const [id] of r.r || []) reagents.add(id); if (r.p) products.add(r.p[0]); }
  let priced = 0, badPrice = 0;
  for (const [id, it] of Object.entries(D.items)) {
    if (it[2] != null && !(Number.isInteger(it[2]) && it[2] >= 0)) badPrice++;
    if (it[3] != null && !(Number.isInteger(it[3]) && it[3] > 0 && products.has(Number(id)))) badPrice++;
    if (it[2] > 0 && !reagents.has(Number(id))) badPrice++;
    if (it[2] > 0) priced++;
  }
  check("vendor prices are whole copper, on reagents and products only", !badPrice && priced > 0, `${priced} of ${reagents.size} reagents priced; ${Object.values(D.items).filter((it) => it[3] > 0).length} products with a vendor value`);
  const badRanks = D.professions.filter((p) => !Array.isArray(p.ranks) || p.ranks.some((k, i) => !k.n || k.cap !== 75 * (i + 1) || (k.l != null && !(k.l > 0 && k.l < k.cap))) || (p.ranks.length && p.ranks[p.ranks.length - 1].cap !== D.skillCap));
  check("ranks rise by 75 to the cap, each trainable before the one below runs out", !badRanks.length, badRanks.length ? badRanks.map((p) => p.name).join(", ") : `${D.professions.filter((p) => p.ranks.length).length} professions with ranks; raised by gathering: ${D.professions.filter((p) => p.gather).map((p) => p.name).join(", ")}`);
  const unnamed = D.professions.flatMap((p) => p.recipes).filter((r) => !r.x && r.p && !item(r.p[0])[0]).length;
  console.log(`    (${unnamed} live recipes make an item the client has no record of; the page names those by the recipe)`);
}

console.log(`\n${checks - failures} of ${checks} checks passed`);
process.exit(failures ? 1 : 0);
