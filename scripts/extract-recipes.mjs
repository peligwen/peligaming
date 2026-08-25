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
// Outputs whose data can't be trusted on the board (quest-specific one-offs).
const EXCLUDE_OUTPUTS = new Set([
  'Cannon ball (Between a Rock...)', // golden cannonball, quest mould
]);
// Quest and reward unlocks the recipe data doesn't carry but the game enforces.
// Rule-based so whole families (every dart tip, every cannonball) get tagged
// consistently; joins to the character sheet's quest checklist on the board.
function unlockOf(name, skill, facility) {
  const n = name.toLowerCase();
  if (skill === 'Herblore') return 'Druidic Ritual'; // gates the whole skill
  if (n.includes('dart') && !n.includes('atlatl') && !n.includes('prototype')) return 'The Tourist Trap';
  if (n.includes('cannonball') && facility === 'Furnace') return 'Dwarf Cannon';
  if (n.includes('blurite') && skill === 'Smithing') return "The Knight's Sword";
  if (n === 'dragon sq shield') return "Legends' Quest";
  if (n === 'gold helmet') return 'Between a Rock...';
  if (n === 'silvthrill rod') return 'In Aid of the Myreque';
  if (n.includes('broad') && skill === 'Fletching') return 'Broader Fletching'; // Slayer reward, not a quest
  return null;
}
// Hand tools the recipe data doesn't list as materials but the job can't start
// without. Rule-based so whole families get tagged consistently.
const GEMS = new Set(['Opal', 'Jade', 'Red topaz', 'Sapphire', 'Emerald', 'Ruby',
  'Diamond', 'Dragonstone', 'Onyx', 'Zenyte']);
function gearOf(name, skill, facility) {
  const n = name.toLowerCase();
  if (skill === 'Crafting' && GEMS.has(name)) return 'Chisel';
  if (skill === 'Fletching' && n.includes('amethyst')) return 'Chisel';
  if (skill === 'Smithing' && facility === 'Furnace' && n.includes('cannonball')) return 'Ammo mould';
  if (skill === 'Crafting' && facility === 'Furnace') {
    if (/\bring\b/.test(n)) return 'Ring mould';
    if (n.includes('necklace')) return 'Necklace mould';
    if (n.includes('amulet')) return 'Amulet mould';
    if (n.includes('bracelet')) return 'Bracelet mould';
    if (n.includes('tiara')) return 'Tiara mould';
    if (n.includes('symbol')) return 'Holy mould';
  }
  return null;
}

// Semi-precious gems crush on a failed cut — the level requirement is real but
// the yield isn't 100%. success/256 = min(256, b + (level−1)·a/98). Opal's
// constants are the wiki's own; jade and red topaz are fitted to the wiki's
// published rates (jeweller's-chisel guarantee levels, measured crush rates).
const CRUSH = { Opal: [129, 122], Jade: [91, 160], 'Red topaz': [99, 140] };

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
    const rec = {
      o: idx(outNode.n),
      q: +v.q || 1,
      s: v.s,
      l: +v.l || 1,
      f: v.f || '',
      m: mats,
    };
    const g = gearOf(outNode.n, v.s, v.f || '');
    if (g) rec.g = g;
    const u = unlockOf(outNode.n, v.s, v.f || '');
    if (u) rec.u = u;
    if (v.s === 'Crafting' && !(v.f || '') && CRUSH[outNode.n]) rec.x = CRUSH[outNode.n];
    out.push(rec);
  }
}

writeFileSync(OUT, JSON.stringify({ names, recipes: out }));
const kb = (JSON.stringify({ names, recipes: out }).length / 1024).toFixed(0);
console.log(`kept ${out.length} of ${variants} recipe variants (${skippedSkill} non-market skills) · ${names.length} item names · ${kb} KB`);
const facil = {};
for (const r of out) facil[r.f || '(none)'] = (facil[r.f || '(none)'] || 0) + 1;
console.log('facilities:', JSON.stringify(facil));
const unl = {};
for (const r of out) if (r.u) unl[r.u] = (unl[r.u] || 0) + 1;
console.log('unlocks:', JSON.stringify(unl));
const show = (n) => {
  const i = keepName.get(n);
  const rs = out.filter((r) => r.o === i);
  console.log(n, '→', JSON.stringify(rs.map((r) => ({ ...r, m: r.m.map(([a, b]) => [names[a], b]) }))));
};
['Iron bar', 'Iron keel parts', 'Large iron keel parts', 'Lead bar', 'Oak plank'].forEach((n) => keepName.has(n) ? show(n) : console.log(n, '→ (absent)'));
