#!/usr/bin/env node
// Builds the WoW Forever Profession Catalogue's data: every recipe of every
// profession, with the skill levels at which it turns yellow, green and
// grey, the level it can be learned at, what it makes and what it takes.
//
// Sources, in the order they are trusted:
//
//   * wago.tools — the datamined client database of one Forever build.
//     SkillLineAbility carries each recipe's yellow and grey levels (green
//     is their midpoint), its trade-skill category and whether it is known
//     from the start; the spell tables carry the product, the reagents, the
//     tools, the forge or anvil and the cooldown; the items that teach a
//     recipe carry the skill needed to learn it; the trait tables carry the
//     Working Overtime talent and what each rank is worth.
//   * wago.tools again, for one Classic Era build's SkillLineAbility: the
//     vanilla yellow level of each recipe, to see how far Forever moved it.
//   * CMaNGOS classic-db (GPLv3) — the vanilla 1.12 trainer tables. What a
//     trainer asks before teaching a recipe is the server's business, so no
//     client carries it; the vanilla value is the nearest thing there is.
//     Where Forever has moved a recipe's yellow level, the trainer level is
//     moved by the same amount and marked as an estimate (the items that
//     teach recipes, where both levels are known, moved together in 97% of
//     cases — the script prints the count on every run).
//
// wago.tools is read the way its robots.txt and llms.txt ask of automated
// clients: only the CSV exports and the API, an exact version, each download
// cached in .wow-forever-cache/ and reused, the product and version recorded
// in the output. No recipe website's database is read: Wowhead's terms bar
// tools other than a browser, so its data is not used. Output:
//
//   public/tools/wow-forever/data/professions/professions.json
//
// Usage: node scripts/fetch-wow-forever-professions.mjs [forever build] [--era=<classic era build>]

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { Wago } from "./lib/wago.mjs";
import { readInsertRows, tableColumns } from "./lib/mysql-dump.mjs";

const BUILD = process.argv.find((a) => /^\d+\.\d+\.\d+\.\d+$/.test(a)) || "1.60.1.70888";
const ERA_BUILD = (process.argv.find((a) => a.startsWith("--era=")) || "--era=1.15.9.70576").slice(6);
const CACHE = ".wow-forever-cache";
const OUT = "public/tools/wow-forever/data/professions";
const CLASSICDB_URL = "https://raw.githubusercontent.com/cmangos/classic-db/master/Full_DB/ClassicDB_1_12_1_z2815.sql.gz";
const WORKING_OVERTIME = "1225451";      // the talent's spell
const SKILL_CAP = 300;                   // Forever's cap: Dedicated Study's own text counts a tradeskill finished at 300

// The catalogue's professions, in the order the page lists them. Names,
// descriptions and classes are read from the client; this list only says
// which skill lines are professions and how to order them.
const PROFESSIONS = [171, 164, 333, 202, 165, 197, 186, 182, 393, 185, 129, 356, 40, 3012];
const IGNORED_SKILL_LINES = new Set(["2933"]); // "Test Profession [DNT]", a jewelcrafting prototype

const log = (...a) => console.log(...a);
const wago = new Wago(BUILD, CACHE, "peligaming-professions-build/1.0 (+https://github.com/peligwen/peligaming)");
const num = (v) => Number(v);
const group = (rows, key) => { const m = new Map(); for (const r of rows) { const k = r[key]; if (!m.has(k)) m.set(k, []); m.get(k).push(r); } return m; };

// ---------------------------------------------------------------------------
// 1. Client tables
// ---------------------------------------------------------------------------
const PRODUCT = await wago.product(BUILD), ERA_PRODUCT = await wago.product(ERA_BUILD);
if (!PRODUCT || !ERA_PRODUCT) throw new Error(`wago.tools does not list build ${PRODUCT ? ERA_BUILD : BUILD}`);
log(`build ${BUILD} (${PRODUCT}); Classic Era baseline ${ERA_BUILD} (${ERA_PRODUCT})`);
const T = {};
for (const name of ["SkillLine", "SkillLineAbility", "SkillRaceClassInfo", "TradeSkillCategory", "ChrClasses",
  "SpellName", "Spell", "SpellEffect", "SpellReagents", "SpellTotems", "TotemCategory", "SpellCastingRequirements", "SpellFocusObject",
  "SpellCooldowns", "SpellMisc", "SpellCastTimes", "SpellItemEnchantment", "ItemSparse", "ItemEffect", "ItemXItemEffect",
  "TraitDefinition", "TraitNodeEntry", "TraitNodeXTraitNodeEntry", "TraitDefinitionEffectPoints", "CurvePoint"]) {
  T[name] = await wago.table(name);
  log(`  ${name}: ${T[name].length} rows`);
}
const eraAbilities = await wago.table("SkillLineAbility", ERA_BUILD);
log(`  SkillLineAbility (${ERA_BUILD}): ${eraAbilities.length} rows`);

const skillLine = new Map(T.SkillLine.map((s) => [s.ID, s]));
const spellName = new Map(T.SpellName.map((s) => [s.ID, s.Name_lang]));
const spellText = new Map(T.Spell.map((s) => [s.ID, s]));
const category = new Map(T.TradeSkillCategory.map((c) => [c.ID, c]));
const effects = group(T.SpellEffect, "SpellID");
const reagents = new Map(T.SpellReagents.map((r) => [r.SpellID, r]));
const totems = new Map(T.SpellTotems.map((r) => [r.SpellID, r]));
const totemCategory = new Map(T.TotemCategory.map((t) => [t.ID, t.Name_lang]));
const castReq = new Map(T.SpellCastingRequirements.map((r) => [r.SpellID, r]));
const focusName = new Map(T.SpellFocusObject.map((f) => [f.ID, f.Name_lang]));
const cooldown = new Map(T.SpellCooldowns.map((r) => [r.SpellID, r]));
const misc = new Map(T.SpellMisc.map((r) => [r.SpellID, r]));
const castTime = new Map(T.SpellCastTimes.map((r) => [r.ID, num(r.Base)]));
const enchantment = new Map(T.SpellItemEnchantment.map((e) => [e.ID, e.Name_lang]));
const itemSparse = new Map(T.ItemSparse.map((i) => [i.ID, i]));
const eraBySpell = new Map(eraAbilities.map((a) => [`${a.SkillLine}:${a.Spell}`, a]));

// items that teach a spell when used: the recipes, plans, patterns, formulas
// and schematics. ItemEffect.TriggerType 6 is "on learn".
const teachers = new Map();
{
  const itemOfEffect = new Map(T.ItemXItemEffect.map((x) => [x.ItemEffectID, x.ItemID]));
  for (const e of T.ItemEffect) {
    if (e.TriggerType !== "6") continue;
    const item = itemOfEffect.get(e.ID);
    if (!item || !itemSparse.has(item)) continue;
    if (!teachers.has(e.SpellID)) teachers.set(e.SpellID, []);
    teachers.get(e.SpellID).push(item);
  }
}

// ---------------------------------------------------------------------------
// 2. Vanilla trainers (CMaNGOS classic-db)
//
// npc_trainer lists the spell a trainer casts on you, which teaches the
// recipe through a LEARN_SPELL effect; spell_template says which recipe.
// ---------------------------------------------------------------------------
const vanillaTrainer = new Map(); // "skillLine:recipe spell" -> lowest skill a vanilla trainer asked
{
  const gz = path.join(CACHE, "classicdb.sql.gz");
  if (!fs.existsSync(gz)) { log("  downloading classic-db"); fs.writeFileSync(gz, await wago.fetchWithRetry(CLASSICDB_URL)); }
  const sql = zlib.gunzipSync(fs.readFileSync(gz)).toString("utf8");
  const sc = tableColumns(sql, "spell_template");
  const iId = sc.indexOf("Id"), iEff = [1, 2, 3].map((n) => sc.indexOf(`Effect${n}`)), iTrig = [1, 2, 3].map((n) => sc.indexOf(`EffectTriggerSpell${n}`));
  const taught = new Map();
  for (const r of readInsertRows(sql, "spell_template")) for (let k = 0; k < 3; k++) if (r[iEff[k]] === 36) taught.set(r[iId], r[iTrig[k]]);
  let rows = 0;
  for (const table of ["npc_trainer", "npc_trainer_template"]) {
    const tc = tableColumns(sql, table);
    const iSpell = tc.indexOf("spell"), iSkill = tc.indexOf("reqskill"), iValue = tc.indexOf("reqskillvalue");
    for (const r of readInsertRows(sql, table)) {
      if (!r[iSkill]) continue;
      const key = `${r[iSkill]}:${taught.get(r[iSpell]) ?? r[iSpell]}`;
      if (!vanillaTrainer.has(key) || vanillaTrainer.get(key) > r[iValue]) vanillaTrainer.set(key, r[iValue]);
      rows++;
    }
  }
  log(`  classic-db: ${rows} trainer rows, ${vanillaTrainer.size} recipes taught by a vanilla trainer`);
}

// ---------------------------------------------------------------------------
// 3. Working Overtime
//
// The spell's own value is a placeholder; a talent's real value per rank
// comes from the curve its trait definition points at.
// ---------------------------------------------------------------------------
const talent = (() => {
  const defs = T.TraitDefinition.filter((d) => d.SpellID === WORKING_OVERTIME);
  const placed = new Set(T.TraitNodeXTraitNodeEntry.map((x) => x.TraitNodeEntryID));
  const candidates = [];
  for (const d of defs) for (const e of T.TraitNodeEntry.filter((e) => e.TraitDefinitionID === d.ID)) {
    const pts = T.TraitDefinitionEffectPoints.find((p) => p.TraitDefinitionID === d.ID && p.EffectIndex === "0");
    if (!pts) continue;
    const curve = T.CurvePoint.filter((p) => p.CurveID === pts.CurveID).sort((a, b) => num(a.OrderIndex) - num(b.OrderIndex));
    const ranks = [];
    for (let r = 1; r <= num(e.MaxRanks); r++) { const p = curve.find((p) => num(p.Pos_0) === r); if (p) ranks.push(num(p.Pos_1)); }
    candidates.push({ ranks, placed: placed.has(e.ID) });
  }
  const pick = candidates.find((c) => c.placed) || candidates[0];
  if (!pick || !pick.ranks.length) throw new Error("Working Overtime: no talent ranks found in the trait tables");
  if (candidates.some((c) => c.ranks.join() !== pick.ranks.join())) log("  ! Working Overtime: the trait definitions disagree on the ranks; using the one placed in a tree");
  return { name: spellName.get(WORKING_OVERTIME), spell: num(WORKING_OVERTIME), ranks: pick.ranks, text: spellText.get(WORKING_OVERTIME)?.Description_lang || "" };
})();
log(`  ${talent.name}: ${talent.ranks.map((r) => `+${r}%`).join(" / ")}`);

// ---------------------------------------------------------------------------
// 4. The recipes
// ---------------------------------------------------------------------------
const items = {};       // id -> [name, quality], every item the recipes mention
const useItem = (id) => {
  const s = itemSparse.get(String(id));
  if (!items[id]) items[id] = s ? [s.Display_lang, num(s.OverallQualityID)] : [null, null];
  return num(id);
};
const classes = new Map(T.ChrClasses.map((c) => [num(c.ID), c.Name_lang]));
const singleClass = (mask) => { const m = num(mask); if (m <= 0 || (m & (m - 1))) return null; return classes.get(Math.log2(m) + 1) || null; };
// race masks: bit 0 is Human, bit 1 Orc — enough to tell the two sides of a faction-split recipe apart
const factionOf = (a) => { const lo = num(a.RaceMasks_0); if (!lo || lo === -1) return null; return lo & 1 ? "A" : lo & 2 ? "H" : null; };
const retired = (name) => /\b(OLD|DEPRECATED|UNUSED|TEST|DNT|NYI)\b/.test(name || "");

const unknownLines = T.TradeSkillCategory.filter((c) => c.ParentTradeSkillCategoryID === "0" && !PROFESSIONS.includes(num(c.SkillLineID)) && !IGNORED_SKILL_LINES.has(c.SkillLineID));
for (const c of unknownLines) log(`  ! the client has a trade skill this script does not list: ${c.Name_lang} (skill line ${c.SkillLineID})`);

const stats = { recipes: 0, leftovers: 0, learn: { auto: 0, item: 0, trainer: 0, estimate: 0, unknown: 0 }, shiftCheck: { match: 0, total: 0 }, unnamedProducts: 0 };
const professions = [];
for (const id of PROFESSIONS) {
  const line = skillLine.get(String(id));
  if (!line) { log(`  ! no skill line ${id} in this build`); continue; }
  const lines = new Set([String(id), ...T.SkillLine.filter((s) => s.ParentSkillLineID === String(id)).map((s) => s.ID)]);
  const info = T.SkillRaceClassInfo.find((r) => r.SkillID === String(id));
  const cls = info ? singleClass(info.ClassMask) : null;
  const kind = cls ? "class" : line.CategoryID === "11" ? "primary" : "secondary";
  const cats = new Map();   // category id -> index in this profession's list
  const catList = [];
  const catIndex = (c) => {
    const key = c ? c.ID : "0";
    if (!cats.has(key)) { cats.set(key, catList.length); catList.push(c ? { name: c.Name_lang, order: num(c.OrderIndex) } : { name: "Other skills", order: 99990 }); }
    return cats.get(key);
  };
  const recipes = [];
  const skipped = { unnamed: 0, retired: 0, rank: 0 };
  const listed = new Set();
  for (const a of T.SkillLineAbility) {
    if (a.SkillLine !== String(id) || listed.has(a.Spell)) continue; // a few abilities are in the table twice
    listed.add(a.Spell);
    const name = spellName.get(a.Spell);
    if (!name) { skipped.unnamed++; continue; }                 // the spell is gone from the client
    if (a.AcquireMethod === "3") { skipped.retired++; continue; } // recipes Forever retired (the old healing potions, the old campfire)
    const cat = category.get(a.TradeSkillCategoryID);
    const effs = effects.get(a.Spell) || [];
    const create = effs.find((e) => e.Effect === "24" && e.EffectItemType !== "0");
    const enchant = effs.find((e) => (e.Effect === "53" || e.Effect === "54") && enchantment.get(e.EffectMiscValue_0));
    const grey = num(a.TrivialSkillLineRankHigh);
    let yellow = Math.min(num(a.TrivialSkillLineRankLow), grey);
    if (cat) {
      // the profession's own rank spells sit in an "uncategorized" bucket
      if (!grey && !create && !enchant && !reagents.has(a.Spell)) { skipped.rank++; continue; }
    } else {
      // outside the trade-skill window only the skills that are known from
      // the start and still colour up are kept: Disenchant, Comprehend Scroll
      if (!(a.AcquireMethod === "1" && grey > 1) || effs.some((e) => e.Effect === "33")) { skipped.rank++; continue; }
    }
    const r = { i: num(a.Spell), n: name, c: catIndex(cat) };
    const ups = num(a.NumSkillUps);
    if (grey && ups) { r.y = yellow; r.g = grey; if (ups !== 1) r.u = ups; }

    // --- when it can be learned
    // MinSkillLineRank is only believed for the recipes the game hands out
    // by itself (AcquireMethod 1, "learned at this skill"). On the others it
    // is a relic that matches neither vanilla's trainers nor Forever's
    // retuned levels (Bronze Mace says 75; its trainer asked for 110).
    const min = num(a.MinSkillLineRank);
    const teach = (teachers.get(a.Spell) || []).map((i) => itemSparse.get(i))
      .filter((s) => !retired(s.Display_lang) && (s.RequiredSkill === "0" || lines.has(s.RequiredSkill)))
      .sort((x, y) => num(x.ID) - num(y.ID));
    const era = eraBySpell.get(`${id}:${a.Spell}`);
    const shift = era && num(era.TrivialSkillLineRankHigh) && grey ? yellow - num(era.TrivialSkillLineRankLow) : 0;
    const vanilla = vanillaTrainer.get(`${id}:${a.Spell}`);
    if (a.AcquireMethod === "1") { r.l = Math.max(1, min); r.s = "a"; }
    else if (teach.length) {
      r.l = Math.max(1, num(teach[0].RequiredSkillRank)); r.s = "i"; r.ri = useItem(teach[0].ID);
      // the check behind the estimate below: did this item's level move with the yellow level?
      const vItem = era && vanillaRecipeItem(teach[0].ID);
      if (vItem != null) { stats.shiftCheck.total++; if (num(teach[0].RequiredSkillRank) - vItem === shift) stats.shiftCheck.match++; }
    }
    else if (vanilla != null && (!grey || vanilla + shift <= grey)) {
      r.l = Math.max(1, vanilla + shift); r.s = shift ? "e" : "t";
      if (shift) { r.v = vanilla; r.dy = shift; } // what vanilla asked, and how far Forever moved the recipe
    }
    else r.s = "u";
    stats.learn[{ a: "auto", i: "item", t: "trainer", e: "estimate", u: "unknown" }[r.s]]++;

    // --- what it makes
    // (a product the client has no item record for keeps its id; the page falls back to the recipe's name)
    if (create) { r.p = [useItem(create.EffectItemType), Math.max(1, Math.round(num(create.EffectBasePointsF)))]; if (!items[r.p[0]][0]) stats.unnamedProducts++; }
    else if (enchant) r.e = enchantment.get(enchant.EffectMiscValue_0);
    else { const d = (spellText.get(a.Spell)?.Description_lang || "").replace(/\s+/g, " ").trim(); if (d && !/[$|]/.test(d)) r.d = d; }

    // --- what it takes
    const rg = reagents.get(a.Spell);
    if (rg) { const list = []; for (let k = 0; k < 8; k++) if (rg[`Reagent_${k}`] !== "0" && num(rg[`ReagentCount_${k}`]) > 0) list.push([useItem(rg[`Reagent_${k}`]), num(rg[`ReagentCount_${k}`])]); if (list.length) r.r = list; }
    const tt = totems.get(a.Spell);
    if (tt) {
      const tools = [];
      for (const k of ["Totem_0", "Totem_1"]) if (tt[k] !== "0") { useItem(tt[k]); tools.push(items[tt[k]][0] || `item ${tt[k]}`); }
      for (const k of ["RequiredTotemCategoryID_0", "RequiredTotemCategoryID_1"]) if (tt[k] !== "0" && totemCategory.get(tt[k])) tools.push(totemCategory.get(tt[k]));
      if (tools.length) r.t = tools;
    }
    const cr = castReq.get(a.Spell);
    if (cr && cr.RequiresSpellFocus !== "0" && focusName.get(cr.RequiresSpellFocus)) r.f = focusName.get(cr.RequiresSpellFocus);
    const cd = cooldown.get(a.Spell);
    if (cd) { const s = Math.max(num(cd.RecoveryTime), num(cd.CategoryRecoveryTime)) / 1000; if (s >= 60) r.cd = Math.round(s); }
    const ct = castTime.get(misc.get(a.Spell)?.CastingTimeIndex);
    if (ct) r.ct = Math.round(ct / 100) / 10;
    const fac = factionOf(a);
    if (fac) r.fa = fac;
    if (cat && cat.Name_lang === "SEASON OF DISCOVERY") { r.x = 1; stats.leftovers++; }
    recipes.push(r);
  }
  // in the game's own order: category, then the level it goes yellow, then name
  const order = catList.map((c, i) => i).sort((x, y) => catList[x].order - catList[y].order || catList[x].name.localeCompare(catList[y].name));
  const rank = new Map(order.map((old, pos) => [old, pos]));
  for (const r of recipes) r.c = rank.get(r.c);
  recipes.sort((x, y) => x.c - y.c || (x.y ?? 9999) - (y.y ?? 9999) || (x.g ?? 9999) - (y.g ?? 9999) || x.n.localeCompare(y.n) || x.i - y.i);
  stats.recipes += recipes.length;
  professions.push({ id, name: line.DisplayName_lang, kind, ...(cls ? { class: cls } : {}), about: line.Description_lang.replace(/\s+/g, " ").trim(),
    categories: order.map((i) => catList[i].name), recipes });
  log(`  ${line.DisplayName_lang}${cls ? ` (${cls})` : ""}: ${recipes.length} recipes in ${catList.length} categories` +
    ` — left out ${skipped.retired} retired, ${skipped.unnamed} unnamed, ${skipped.rank} rank or gathering spells`);
}

// the vanilla skill a recipe item asked for, read lazily from classic-db
function vanillaRecipeItem(itemId) {
  if (!vanillaRecipeItem.map) {
    const sql = zlib.gunzipSync(fs.readFileSync(path.join(CACHE, "classicdb.sql.gz"))).toString("utf8");
    const c = tableColumns(sql, "item_template");
    const iEntry = c.indexOf("entry"), iClass = c.indexOf("class"), iRank = c.indexOf("RequiredSkillRank");
    vanillaRecipeItem.map = new Map();
    for (const r of readInsertRows(sql, "item_template")) if (r[iClass] === 9) vanillaRecipeItem.map.set(String(r[iEntry]), r[iRank]);
  }
  return vanillaRecipeItem.map.get(String(itemId));
}

// ---------------------------------------------------------------------------
// 5. Checks, then write
// ---------------------------------------------------------------------------
const L = stats.learn;
log(`  ${stats.recipes} recipes (${stats.leftovers} of them Season of Discovery leftovers)`);
log(`  learnable at: known from the start ${L.auto}, the recipe item's own requirement ${L.item},` +
  ` a vanilla trainer's level ${L.trainer}, a vanilla trainer's level moved with the recipe ${L.estimate}, not known ${L.unknown}`);
log(`  recipe items moved in step with their recipe's yellow level: ${stats.shiftCheck.match} of ${stats.shiftCheck.total}`);
log(`  ${stats.unnamedProducts} recipes make an item the client has no record of; the page names those by the recipe`);
let problems = 0;
const seen = new Set();
for (const p of professions) for (const r of p.recipes) {
  const bad = (why) => { problems++; log(`  ! ${p.name} / ${r.n} (${r.i}): ${why}`); };
  if (seen.has(`${p.id}:${r.i}`)) bad("listed twice"); seen.add(`${p.id}:${r.i}`);
  if (r.g != null && !(r.y >= 1 && r.y <= r.g)) bad(`yellow ${r.y} is not within 1..grey ${r.g}`);
  // (a recipe item can ask for more skill than its recipe's grey level — the client's own data; noted, not a fault)
  if (r.l != null && r.g != null && r.l > r.g) { if (r.s === "i") log(`  note: ${p.name} / ${r.n} is learned at ${r.l}, after it has gone grey at ${r.g}`); else bad(`learned at ${r.l}, after it has gone grey at ${r.g}`); }
  if (r.l == null !== (r.s === "u")) bad("learn level and its source disagree");
}
if (problems) log(`  ${problems} problem${problems === 1 ? "" : "s"} above`);

fs.mkdirSync(OUT, { recursive: true });
const out = {
  product: PRODUCT,
  build: BUILD,
  eraProduct: ERA_PRODUCT,
  eraBuild: ERA_BUILD,
  skillCap: SKILL_CAP,
  talent,
  stats: { recipes: stats.recipes, leftovers: stats.leftovers, learn: stats.learn, shiftCheck: stats.shiftCheck },
  professions,
  items,
};
const file = path.join(OUT, "professions.json");
fs.writeFileSync(file, JSON.stringify(out));
log(`wrote ${file} (${Math.round(fs.statSync(file).size / 1024)} KB, ${Object.keys(items).length} items)`);
