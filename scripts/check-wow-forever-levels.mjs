#!/usr/bin/env node
// Checks the World Map's levelling overlay: the colour rule in the page's
// <script id="levelling-model"> block, and the levels.json it reads.
//
// The rule is checked against the game's own: the grey level by bracket at
// the levels where it steps, the colours at their edges, every colour's band
// agreeing with the colour of every level in it, and a level histogram
// split by colour adding up. The data is checked for shape (every zone and
// subzone on the map has a level or is a sanctuary, spreads in order, a
// known source for each, histograms well formed) and against places whose
// levels anyone who played knows: Northshire and the Valley of Trials are
// the first levels, the Crossroads are the low teens, Camp Taurajo twenty,
// Duskwood's Raven Hill is not level 50 (its "Unseen" are invisible and left
// out), the capitals and Moonglade are sanctuaries, Elwynn's quests are the
// Alliance's and Durotar's the Horde's, and Forever's Riverglades carries
// its own levels from the client.
//
//   node scripts/check-wow-forever-levels.mjs      (npm run check:levels)

import { readFileSync } from "node:fs";

const PAGE = "public/tools/wow-forever/world-map.html";
const MAP = "public/tools/wow-forever/data/world-map/world-map.json";
const LEVELS = "public/tools/wow-forever/data/world-map/levels.json";

const html = readFileSync(PAGE, "utf8");
const block = html.match(/<script id="levelling-model">([\s\S]*?)<\/script>/);
if (!block) throw new Error(`${PAGE} has no <script id="levelling-model"> block`);
const M = new Function(`${block[1]}\nreturn LEVELLING;`)();
const D = JSON.parse(readFileSync(MAP, "utf8"));
const L = JSON.parse(readFileSync(LEVELS, "utf8"));

let failures = 0, checks = 0;
function check(name, ok, detail = "") {
  checks++;
  if (!ok) failures++;
  console.log(`${ok ? "  ✓" : "  ✗"} ${name}${detail ? ": " + detail : ""}`);
}

// ------------------------------------------------------------------ the rule
console.log("the colour rule");
{
  const grey = [[1, 0], [5, 0], [6, 1], [9, 4], [10, 4], [20, 13], [30, 22], [39, 31], [40, 31], [45, 35], [50, 39], [59, 47], [60, 51]];
  const wrong = grey.filter(([lvl, g]) => M.greyLevel(lvl) !== g);
  check("grey level by bracket", !wrong.length, wrong.map(([lvl, g]) => `${lvl}: ${M.greyLevel(lvl)} not ${g}`).join(", "));
  const at20 = [[30, "red"], [25, "red"], [24, "orange"], [23, "orange"], [22, "yellow"], [20, "yellow"], [18, "yellow"], [17, "green"], [14, "green"], [13, "grey"], [1, "grey"]];
  const off = at20.filter(([lvl, c]) => M.colour(lvl, 20) !== c);
  check("colours at their edges for a level 20", !off.length, off.map(([lvl, c]) => `${lvl} is ${M.colour(lvl, 20)} not ${c}`).join(", "));
  check("nothing is grey to a level 5, and a level 60's grey starts at 51", M.colour(1, 5) === "green" && M.colour(51, 60) === "grey" && M.colour(52, 60) === "green");
  check("a level 1 has no green", M.bands(1).green === null && M.bands(1).grey === null && M.colour(1, 1) === "yellow");
  let mismatch = null;
  for (let pl = 1; pl <= M.MAX && !mismatch; pl++) {
    const b = M.bands(pl);
    for (let lvl = 1; lvl <= 70; lvl++) {
      const c = M.colour(lvl, pl);
      const band = b[c];
      if (!band || lvl < band[0] || (band[1] != null && lvl > band[1])) { mismatch = `level ${lvl} at ${pl} is ${c} but outside that band`; break; }
      const inOthers = M.COLOURS.filter((k) => k !== c && b[k] && lvl >= b[k][0] && (b[k][1] == null || lvl <= b[k][1]));
      if (inOthers.length) { mismatch = `level ${lvl} at ${pl} is in ${c} and ${inOthers.join(", ")}`; break; }
    }
  }
  check("the bands are the colours, one each, at every player level", !mismatch, mismatch || "");
  const s = M.split([18, 1, 2, 0, 4, 5, 1, 1, 3], 20);
  check("a histogram splits by colour and adds up", s.total === 17 && s.green === 0 && s.yellow === 12 && s.orange === 2 && s.red === 3 && M.split(null, 20).total === 0, JSON.stringify(s));
  check("yellow quests count for more than green or orange", M.worth({ yellow: 1, green: 0, orange: 0 }) > M.worth({ yellow: 0, green: 3, orange: 0 }) && M.worth({ yellow: 0, green: 0, orange: 1 }) > M.worth({ yellow: 0, green: 1, orange: 0 }));
}

// ------------------------------------------------------------------ the data
console.log("levels.json");
const zones = D.maps.filter((m) => m.kind === "zone" || m.kind === "city");
const byName = (n) => zones.find((m) => m.name === n);
const sub = (zoneName, subName) => { const m = byName(zoneName); const s = m.subzones.find((s) => s.name === subName); return L.zones[m.id].subzones[s.area]; };
const histOk = (h) => h == null || (Array.isArray(h) && h.length >= 2 && Number.isInteger(h[0]) && h[0] >= 1 && h.slice(1).every((n) => Number.isInteger(n) && n >= 0) && h[1] > 0 && h[h.length - 1] > 0);
{
  check("the build matches the map's", L.build === D.build, `${L.build} / ${D.build}`);
  const missing = zones.filter((m) => !L.zones[m.id]).map((m) => m.name);
  check("every zone and capital has an entry", !missing.length, missing.join(", "));
  const bad = [], unlevelled = [], badHist = [];
  const SOURCES = new Set(["mobs", "client", "near", "band"]);
  const ordered = (e) => e.lv && e.lv[0] <= e.med && e.med <= e.lv[1] && e.lv[0] >= 1 && e.lv[1] <= 63;
  for (const m of zones) {
    const z = L.zones[m.id];
    if (!z || z.sanctuary) continue;
    if (!ordered(z)) bad.push(`${m.name} ${JSON.stringify([z.lv, z.med])}`);
    if (!histOk(z.mobs) || (z.quests && (!histOk(z.quests.A) || !histOk(z.quests.H)))) badHist.push(m.name);
    for (const s of m.subzones || []) {
      const e = z.subzones[s.area];
      if (!e) { unlevelled.push(`${m.name}: ${s.name}`); continue; }
      if (e.sanctuary) continue;
      if (!ordered(e) || !SOURCES.has(e.src)) bad.push(`${m.name}: ${s.name} ${JSON.stringify(e)}`);
    }
  }
  check("every subzone of a zone has a level or is a capital", !unlevelled.length, unlevelled.slice(0, 6).join(", "));
  check("spreads in order, the typical level inside, a known source", !bad.length, bad.slice(0, 6).join("; "));
  check("histograms well formed", !badHist.length, badHist.join(", "));
  const ids = new Set(D.instances.map((i) => i.id));
  const strays = Object.keys(L.instances).filter((k) => !ids.has(Number(k)));
  check("every dungeon entry is a dungeon on the map", !strays.length && Object.keys(L.instances).length >= 20, strays.join(", "));
}
console.log("places everyone knows");
{
  const e = (z, s) => sub(z, s);
  check("Northshire Valley is the first levels", e("Elwynn Forest", "Northshire Valley").med <= 5, JSON.stringify(e("Elwynn Forest", "Northshire Valley")));
  check("the Valley of Trials is the first levels", e("Durotar", "Valley of Trials").med <= 5);
  const xr = e("The Barrens", "The Crossroads");
  check("the Crossroads are the low teens", xr.med >= 11 && xr.med <= 16, JSON.stringify(xr));
  const ct = e("The Barrens", "Camp Taurajo");
  check("Camp Taurajo is around twenty", ct.med >= 18 && ct.med <= 23, JSON.stringify(ct));
  const rh = e("Duskwood", "Raven Hill");
  check("Raven Hill's invisible level-50s are left out", rh.med < 35, JSON.stringify(rh));
  check("Stormwind inside Elwynn is a capital", e("Elwynn Forest", "Stormwind City").sanctuary === true);
  check("the capitals and Moonglade are sanctuaries", D.maps.filter((m) => m.kind === "city").every((m) => L.zones[m.id].sanctuary) && L.zones[byName("Moonglade").id].sanctuary === true);
  const elwynn = L.zones[byName("Elwynn Forest").id].quests, durotar = L.zones[byName("Durotar").id].quests;
  check("Elwynn's quests are the Alliance's, Durotar's the Horde's", elwynn.A && !elwynn.H && durotar.H && !durotar.A);
  const rg = e("Riverglades", "Twilight's Shroud");
  check("Forever's Riverglades has its own levels from the client", rg.src === "client" && rg.med === 44, JSON.stringify(rg));
  const sc = L.zones[byName("Silithus").id];
  check("Silithus is endgame", sc.med >= 55, JSON.stringify([sc.lv, sc.med]));
  const dm = L.instances[D.instances.find((i) => i.name === "Deadmines").id];
  check("the Deadmines are high teens inside", dm.med >= 16 && dm.med <= 22, JSON.stringify(dm.lv));
  check("at 23, Redridge's quests are mostly yellow or better", (() => { const s = M.split(L.zones[byName("Redridge Mountains").id].quests.A, 23); return s.yellow >= s.red; })());
}

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures) process.exit(1);
