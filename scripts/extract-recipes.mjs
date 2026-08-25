// Lifts the recipe graph out of the OSRS industry visualizer's embedded gdata
// blob into tools-src/runescape/recipes.json for the Flip Desk's Job Board.
// Run manually when the visualizer is updated: `node scripts/extract-recipes.mjs`.
//
// Output shape (indices into `names`):
//   { names: [...], recipes: [{ o, q, s, l, f, m: [[nameIdx, qty], ...] }] }
// Item names are canonical OSRS names and join to GE ids via /mapping at runtime.

import { readFileSync, writeFileSync } from 'node:fs';

const SRC = 'public/tools/runescape/osrs-crafting-web-3d.html';
const OUT = 'tools-src/runescape/recipes.json';

const html = readFileSync(SRC, 'utf8');
const m = html.match(/<script type="application\/json" id="gdata">(.*?)<\/script>/s);
if (!m) throw new Error('gdata blob not found in ' + SRC);
const gdata = JSON.parse(m[1]);

const nodes = gdata.nodes; // [{n: name, c: categoryIdx, g: ?}]
const recipes = gdata.recipes; // { nodeIdx: [{s, l, q, f, m: [[nodeIdx, qty]]}] }

// Only processing verbs the Job Board can price honestly. Construction and
// "General" cover POH furniture, quest one-offs and other non-market output.
const SKILLS = new Set(['Smithing', 'Crafting', 'Fletching', 'Cooking', 'Herblore', 'Smelting']);
// Everyday facilities only — minigame, quest-gated and POH-buildable stations
// would put jobs on the board most players can't walk up to.
const FACILITIES = new Set([
  '', 'Furnace', 'Anvil', 'Cooking range', 'Fire', 'Spinning wheel', 'Loom',
  'Pottery Oven', "Potter's Wheel", 'Dairy churn',
]);
// Outputs whose visualizer data is wrong or disputed. Reported in testing:
// cannonball smelting is NOT a walk-up furnace job (mould required at minimum;
// the facility itself is disputed) — off the board until the data is verified.
// The anvil chainshot/incendiary variants stay: they consume bought cannonballs.
const EXCLUDE_OUTPUTS = new Set([
  'Bronze cannonball', 'Iron cannonball', 'Steel cannonball',
  'Mithril cannonball', 'Adamant cannonball', 'Rune cannonball',
  'Cannon ball (Between a Rock...)', 'Granite cannonball',
]);

const keepName = new Map(); // name -> new index
const names = [];
const idx = (name) => {
  if (!keepName.has(name)) { keepName.set(name, names.length); names.push(name); }
  return keepName.get(name);
};

const out = [];
let variants = 0, skippedSkill = 0;
for (const [nodeIdx, variantList] of Object.entries(recipes)) {
  const outNode = nodes[+nodeIdx];
  if (!outNode || EXCLUDE_OUTPUTS.has(outNode.n)) continue;
  for (const v of variantList) {
    variants++;
    if (!SKILLS.has(v.s) || !FACILITIES.has(v.f || '')) { skippedSkill++; continue; }
    const mats = (v.m || []).map(([i, q]) => {
      const n = nodes[+i];
      return n ? [idx(n.n), +q || 1] : null;
    });
    if (!mats.length || mats.some((x) => !x)) continue;
    out.push({
      o: idx(outNode.n),
      q: +v.q || 1,
      s: v.s,
      l: +v.l || 1,
      f: v.f || '',
      m: mats,
    });
  }
}

writeFileSync(OUT, JSON.stringify({ names, recipes: out }));
const kb = (JSON.stringify({ names, recipes: out }).length / 1024).toFixed(0);
console.log(`kept ${out.length} of ${variants} recipe variants (${skippedSkill} non-market skills) · ${names.length} item names · ${kb} KB`);
const facil = {};
for (const r of out) facil[r.f || '(none)'] = (facil[r.f || '(none)'] || 0) + 1;
console.log('facilities:', JSON.stringify(facil));
const show = (n) => {
  const i = keepName.get(n);
  const rs = out.filter((r) => r.o === i);
  console.log(n, '→', JSON.stringify(rs.map((r) => ({ ...r, m: r.m.map(([a, b]) => [names[a], b]) }))));
};
['Iron bar', 'Iron keel parts', 'Large iron keel parts', 'Lead bar', 'Oak plank'].forEach((n) => keepName.has(n) ? show(n) : console.log(n, '→ (absent)'));
