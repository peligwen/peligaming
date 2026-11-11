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
//   - the expected crafts match the sums worked by hand.
// The data is checked for shape: every recipe in a category, levels in
// order, every item it names present, every learn level carrying its source.
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
  const unnamed = D.professions.flatMap((p) => p.recipes).filter((r) => !r.x && r.p && !item(r.p[0])[0]).length;
  console.log(`    (${unnamed} live recipes make an item the client has no record of; the page names those by the recipe)`);
}

console.log(`\n${checks - failures} of ${checks} checks passed`);
process.exit(failures ? 1 : 0);
