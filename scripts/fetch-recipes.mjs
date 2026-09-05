// Builds the canonical OSRS recipe dataset from the OSRS Wiki's Bucket API
// (the wiki's structured-data store; https://oldschool.runescape.wiki/w/RuneScape:Bucket)
// and feeds BOTH RuneScape economy tools from it:
//
//   tools-src/runescape/recipes.json          the Job Board's recipe
//                                             graph — now with real tick counts
//                                             and xp per action from the wiki
//   public/tools/runescape/osrs-crafting-web-3d.html
//                                             the Crafting Web's embedded gdata
//                                             recipes gain an `x` field
//                                             ([[skill, xp], ...]) joined by
//                                             output name + skill + level
//
// Run manually to refresh: `node scripts/fetch-recipes.mjs`. Bucket pages are
// cached under .recipes-cache/ so re-runs are cheap; pass --fresh to refetch.
// Then `npm run build:tools` and commit recipes.json, the built job-board.html
// and the crafting web HTML together.
//
// Every recipe row is one wiki {{Infobox Recipe}}: output, materials with
// quantities, facility, tools, ticks per action, and each skill's level and
// experience. Item names are canonical OSRS names and join to GE ids via the
// price API's /mapping at runtime, exactly as before.

import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const API = 'https://oldschool.runescape.wiki/api.php';
const UA = 'peligaming recipe data build (github.com/peligwen/peligaming)';
const OUT = 'tools-src/runescape/recipes.json';
const WEB = 'public/tools/runescape/osrs-crafting-web-3d.html';
const CACHE = '.recipes-cache';
const FRESH = process.argv.includes('--fresh');

mkdirSync(CACHE, { recursive: true });
if (FRESH) rmSync(join(CACHE, 'bucket.json'), { force: true });

// ---------------------------------------------------------------------------
// pull every recipe row from the Bucket API (paged, disk-cached)
// ---------------------------------------------------------------------------

async function fetchBucket() {
  try {
    const j = JSON.parse(readFileSync(join(CACHE, 'bucket.json'), 'utf8'));
    if (Array.isArray(j) && j.length > 5000) {
      console.log(`bucket: ${j.length} rows from cache (pass --fresh to refetch)`);
      return j;
    }
  } catch (e) { /* no cache — fetch */ }
  const rows = [];
  for (let offset = 0; ; offset += 5000) {
    const q = `bucket('recipe').select('page_name','production_json').limit(5000).offset(${offset}).run()`;
    const url = `${API}?action=bucket&format=json&query=${encodeURIComponent(q)}`;
    let page;
    for (let attempt = 0; ; attempt++) {
      try {
        const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        page = (await res.json()).bucket || [];
        break;
      } catch (e) {
        if (attempt >= 3) throw new Error(`${url}: ${e.message}`);
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      }
    }
    rows.push(...page);
    console.log(`bucket: fetched ${rows.length} rows…`);
    if (page.length < 5000) break;
  }
  writeFileSync(join(CACHE, 'bucket.json'), JSON.stringify(rows));
  return rows;
}

const raw = await fetchBucket();

// ---------------------------------------------------------------------------
// parse and normalise
// ---------------------------------------------------------------------------

const num = (v) => {
  const n = parseFloat(String(v ?? '').replace(/,/g, ''));
  return isFinite(n) && n > 0 ? n : null;
};
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

const rows = [];
for (const r of raw) {
  let p;
  try { p = JSON.parse(r.production_json); } catch (e) { continue; }
  const out = p.output?.name || r.page_name;
  const qty = num(p.output?.quantity) ?? 1;
  if (!out) continue;
  const mats = [];
  let ok = true;
  for (const m of p.materials || []) {
    const q = num(m.quantity);
    if (!m.name || q == null) { ok = false; break; }
    mats.push([m.name, q]);
  }
  if (!ok || !mats.length) continue;
  // skill names arrive with occasional case typos ("cooking"); levels/xp are strings
  const skills = (p.skills || [])
    .map((s) => ({ name: cap(s.name), lvl: Math.round(num(s.lvl ?? s.level) ?? 1), xp: num(s.experience) ?? 0 }))
    .filter((s) => s.name);
  rows.push({
    out, qty, mats, skills,
    fac: String(p.facilities || '').trim(),
    tools: String(p.tools || '').trim(),
    ticks: num(p.ticks),
  });
}
console.log(`parsed ${rows.length} recipe rows`);

// ---------------------------------------------------------------------------
// curation — the same rules the old extractor enforced, now data-assisted
// ---------------------------------------------------------------------------

// Only processing verbs the Job Board can price honestly.
const SKILLS = new Set(['Smithing', 'Crafting', 'Fletching', 'Cooking', 'Herblore', 'Magic']);
// Everyday facilities only — minigame, quest-gated and POH-buildable stations
// would put jobs on the board most players can't walk up to. Tannery is new:
// the wiki prices the tanning fee as a Coins material, which the board handles.
const FACILITIES = new Set([
  '', 'Furnace', 'Anvil', 'Cooking range', 'Fire', 'Spinning wheel', 'Loom',
  'Pottery Oven', "Potter's Wheel", 'Dairy churn', 'Tannery',
]);
// Outputs whose data can't be trusted on the board (quest-specific one-offs).
const EXCLUDE_OUTPUTS = new Set([
  'Cannon ball (Between a Rock...)', // golden cannonball, quest mould
]);

// Quest and reward unlocks the recipe data doesn't carry but the game enforces.
// Rule-based so whole families (every dart tip, every cannonball) get tagged
// consistently; joins to the character sheet's quest checklist on the board.
function unlockOf(name, skill, facility, magicLvl, matNames) {
  const n = name.toLowerCase();
  if (skill === 'Herblore') return 'Druidic Ritual'; // gates the whole skill
  // spellbook-gated Magic: astral runes mean Lunar spells (Spin Flax, Tan
  // Leather, Superglass Make, Humidify...); String Jewellery and Plank Make
  // sit behind Dream Mentor on top. Degrime (herb cleaning) is Arceuus.
  if (matNames.includes('Astral rune')) return magicLvl >= 80 ? 'Dream Mentor' : 'Lunar Diplomacy';
  if (skill === 'Magic' && matNames.some((m) => m.startsWith('Grimy '))) return 'Arceuus spellbook';
  if (n.includes('dart') && !n.includes('atlatl') && !n.includes('prototype')) return 'The Tourist Trap';
  if (n.includes('cannonball') && facility === 'Furnace') return 'Dwarf Cannon';
  if (n.includes('blurite') && skill === 'Smithing') return "The Knight's Sword";
  if (n === 'dragon sq shield') return "Legends' Quest";
  if (n === 'gold helmet') return 'Between a Rock...';
  if (n === 'silvthrill rod') return 'In Aid of the Myreque';
  if (n.includes('broad') && skill === 'Fletching') return 'Broader Fletching'; // Slayer reward, not a quest
  return null;
}

// Hand tools worth a chip on the job card. The wiki's own `tools` field feeds
// this now; hammers, knives and the like stay silent (everyone carries them).
function gearOf(name, facility, tools) {
  const t = tools.toLowerCase();
  const m = t.match(/[\w' ]*(?:mould|chisel|glassblowing pipe)/);
  if (m) return cap(m[0].trim());
  // the wiki notes iron smelts fail 50% of the time without a ring of forging;
  // the board assumes you wear one (a few gp per bar amortised over 140 smelts)
  if (name === 'Iron bar' && facility === 'Furnace') return 'Ring of forging';
  return null;
}

// Semi-precious gems crush on a failed cut — the level requirement is real but
// the yield isn't 100%. success/256 = min(256, b + (level−1)·a/98). Opal's
// constants are the wiki's own; jade and red topaz are fitted to the wiki's
// published rates (jeweller's-chisel guarantee levels, measured crush rates).
const CRUSH = { Opal: [129, 122], Jade: [91, 160], 'Red topaz': [99, 140] };

// ---------------------------------------------------------------------------
// the Job Board dataset: filter, dedup, index
// ---------------------------------------------------------------------------

const kept = [];
let skippedSkill = 0;
for (const r of rows) {
  if (EXCLUDE_OUTPUTS.has(r.out)) continue;
  const primary = r.skills[0];
  if (!FACILITIES.has(r.fac) || (primary && !SKILLS.has(primary.name))) { skippedSkill++; continue; }
  kept.push(r);
}

// Some wiki variants assume free rune sources (a staff) and list a strict
// subset of another variant's materials. Pricing the subset would hide a real
// cost, so keep only the fully-priced variant — same honesty rule as the
// alch jobs pricing every fire rune and noting the staff saving.
const sig = (r) => [r.out, r.qty, r.fac, r.skills.map((s) => `${s.name}:${s.lvl}`).join('+')].join('|');
const groups = new Map();
for (const r of kept) {
  const k = sig(r);
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(r);
}
const isSubset = (a, b) => {
  if (a.mats.length >= b.mats.length) return false;
  const bm = new Map(b.mats);
  return a.mats.every(([n, q]) => bm.has(n) && q <= bm.get(n));
};
let droppedSubset = 0, droppedDup = 0;
const deduped = [];
for (const g of groups.values()) {
  const survivors = [];
  for (const r of g) {
    if (g.some((o) => o !== r && isSubset(r, o))) { droppedSubset++; continue; }
    // exact-duplicate materials (e.g. the same recipe filed twice): keep the
    // faster action
    const twin = survivors.find((o) =>
      o.mats.length === r.mats.length && r.mats.every(([n, q]) => o.mats.some(([n2, q2]) => n2 === n && q2 === q)));
    if (twin) {
      droppedDup++;
      if ((r.ticks ?? 99) < (twin.ticks ?? 99)) survivors[survivors.indexOf(twin)] = r;
      continue;
    }
    survivors.push(r);
  }
  deduped.push(...survivors);
}

const keepName = new Map(); // name -> new index
const names = [];
const idx = (name) => {
  if (!keepName.has(name)) { keepName.set(name, names.length); names.push(name); }
  return keepName.get(name);
};

const out = [];
for (const r of deduped) {
  const primary = r.skills[0];
  const matNames = r.mats.map(([n]) => n);
  const magicLvl = r.skills.find((s) => s.name === 'Magic')?.lvl ?? primary?.lvl ?? 1;
  const rec = {
    o: idx(r.out),
    q: r.qty,
    s: primary?.name ?? '',
    l: primary?.lvl ?? 1,
    f: r.fac,
    m: r.mats.map(([n, q]) => [idx(n), q]),
  };
  if (primary?.xp) rec.e = primary.xp;
  if (r.skills.length > 1) rec.k = r.skills.slice(1).map((s) => [s.name, s.lvl, s.xp]);
  if (r.ticks) rec.t = r.ticks;
  const g = gearOf(r.out, r.fac, r.tools);
  if (g) rec.g = g;
  const u = unlockOf(r.out, rec.s, r.fac, magicLvl, matNames);
  if (u) rec.u = u;
  if (rec.s === 'Crafting' && !r.fac && CRUSH[r.out]) rec.x = CRUSH[r.out];
  out.push(rec);
}

const payload = { version: 2, names, recipes: out };
writeFileSync(OUT, JSON.stringify(payload));
console.log(`recipes.json: kept ${out.length} of ${rows.length} rows ` +
  `(${skippedSkill} off-board skills/facilities, ${droppedSubset} staff-assuming subsets, ` +
  `${droppedDup} duplicates) · ${names.length} item names · ` +
  `${(JSON.stringify(payload).length / 1024).toFixed(0)} KB`);
const withT = out.filter((r) => r.t).length, withE = out.filter((r) => r.e).length;
console.log(`ticks on ${withT}/${out.length} recipes, xp on ${withE}/${out.length}`);

// ---------------------------------------------------------------------------
// the Crafting Web: join xp onto the embedded gdata recipes
// ---------------------------------------------------------------------------

// every wiki row indexed by output name; the gdata join tries name+skill+level
// first, then name+skill, then a lone candidate — and stays silent otherwise
const byOut = new Map();
for (const r of rows) {
  if (!byOut.has(r.out)) byOut.set(r.out, []);
  byOut.get(r.out).push(r);
}
const SKILL_ALIAS = { Smelting: 'Smithing' }; // the visualizer's furnace label

const html = readFileSync(WEB, 'utf8');
const m = html.match(/(<script type="application\/json" id="gdata">)(.*?)(<\/script>)/s);
if (!m) throw new Error('gdata blob not found in ' + WEB);
const gdata = JSON.parse(m[2]);
let joined = 0, total = 0;
for (const [nodeIdx, variants] of Object.entries(gdata.recipes)) {
  const outName = gdata.nodes[+nodeIdx]?.n;
  const cands = byOut.get(outName) || [];
  for (const v of variants) {
    total++;
    delete v.x; delete v.t;
    const skill = SKILL_ALIAS[v.s] || v.s;
    const hit =
      cands.find((c) => c.skills.some((s) => s.name === skill && String(s.lvl) === String(+v.l || 1))) ||
      cands.find((c) => c.skills.some((s) => s.name === skill)) ||
      (cands.length === 1 ? cands[0] : null);
    if (!hit || !hit.skills.length) continue;
    v.x = hit.skills.filter((s) => s.xp > 0).map((s) => [s.name, s.xp]);
    if (!v.x.length) { delete v.x; continue; }
    if (hit.ticks) v.t = hit.ticks;
    joined++;
  }
}
writeFileSync(WEB, html.slice(0, m.index) + m[1] + JSON.stringify(gdata) + m[3] + html.slice(m.index + m[0].length));
console.log(`crafting web: xp joined onto ${joined}/${total} gdata recipe variants`);
console.log('now run: npm run build:tools — then commit recipes.json, job-board.html and the crafting web');
