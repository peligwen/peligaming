#!/usr/bin/env node
// Builds the levels behind the WoW Forever World Map's levelling overlay:
// how high the mobs are in every subzone, how high the quests are in every
// zone (for each faction), and how high the mobs are inside each dungeon.
//
//   * CMaNGOS classic-db (GPLv3) — the vanilla 1.12 world: every creature
//     spawn with its level, and every quest with its level, its zone and
//     the races that can take it
//   * wago.tools — the Forever client's own AreaTable (the level the game
//     gives each subzone, which is all there is for the zones Forever adds),
//     FactionTemplate (who a creature is friendly to) and SpellEffect (which
//     of the auras a creature wears make it invisible)
//
// It reads the map's own world-map.json for the zones, their subzone shapes
// and the frame they are drawn in, so run it after `npm run data:wow-forever`
// (it takes the build number from there). Downloads share the map build's
// cache in .wow-forever-cache/. Output:
//
//   public/tools/wow-forever/data/world-map/levels.json
//
// Usage: node scripts/fetch-wow-forever-levels.mjs   (npm run data:wow-forever-levels)

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { Wago } from "./lib/wago.mjs";
import { readInsertRows, tableColumns } from "./lib/mysql-dump.mjs";

const CACHE = ".wow-forever-cache";
const OUT = "public/tools/wow-forever/data/world-map";
const CLASSICDB_URL = "https://raw.githubusercontent.com/cmangos/classic-db/master/Full_DB/ClassicDB_1_12_1_z2815.sql.gz";
const MIN_SPAWNS = 8;            // fewer mobs than this in a subzone and the client's own level for it is the better guide
const MIN_ZONE_SPAWNS = 40;      // and in a whole zone, its subzones' levels are
const log = (...a) => console.log(...a);

const D = JSON.parse(fs.readFileSync(path.join(OUT, "world-map.json"), "utf8"));
const BUILD = D.build;
const wago = new Wago(BUILD, CACHE);
log(`build ${BUILD} (from world-map.json)`);

// ---------------------------------------------------------------------------
// 1. Client tables
// ---------------------------------------------------------------------------
const areaTable = await wago.table("AreaTable");
const areaById = new Map(areaTable.map((a) => [Number(a.ID), a]));
const factionTemplates = new Map((await wago.table("FactionTemplate")).map((f) => [Number(f.ID), f]));
// spells whose aura is invisibility (aura 18): a creature that wears one is not there for a player to fight
const INVISIBILITY = 18;
const invisibility = new Set((await wago.table("SpellEffect")).filter((e) => Number(e.EffectAura) === INVISIBILITY).map((e) => Number(e.SpellID)));
log(`  AreaTable: ${areaTable.length} rows, FactionTemplate: ${factionTemplates.size} rows, ${invisibility.size} invisibility spells`);
// friendly to the Alliance (group 2) or the Horde (group 4): a town's people, not something to level on
function friendlyToAPlayer(templateId) {
  const f = factionTemplates.get(templateId);
  if (!f) return false;
  const friend = Number(f.FriendGroup) | Number(f.FactionGroup);
  return (friend & 6) !== 0;
}

// ---------------------------------------------------------------------------
// 2. The map's zones and subzones, and the frame
// ---------------------------------------------------------------------------
const zones = D.maps.filter((m) => m.kind === "zone" || m.kind === "city");
const cityAreas = new Set(D.maps.filter((m) => m.kind === "city").map((m) => m.area));
// a capital, or a zone the game marks for every level (Moonglade): nothing to level on there
const sanctuary = (m) => m.kind === "city" || (m.levels && m.levels[0] <= 1 && m.levels[1] >= 60);
function frameOf(mapId, x, y) {
  const c = D.continents[mapId];
  if (!c || c.inset) return null;
  return [c.ox + (c.maxY - y) * c.s, c.oy + (c.maxX - x) * c.s];
}
function pointInRing(ring, x, y) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function ringArea(ring) {
  let a = 0;
  for (let i = 0, n = ring.length; i < n; i++) { const [x1, y1] = ring[i], [x2, y2] = ring[(i + 1) % n]; a += x1 * y2 - x2 * y1; }
  return Math.abs(a / 2);
}
const inShape = (rings, x, y) => rings && rings.some((r) => pointInRing(r, x, y));
for (const m of zones) for (const s of m.subzones || []) s.size = s.poly ? s.poly.reduce((t, r) => t + ringArea(r), 0) : Infinity;
// Neighbouring zones' outlines overlap a little along their borders, so a
// spawn there can be inside two. It goes to the one whose level band it
// fits (a Duskwood wolf on the Elwynn border is Duskwood's), and inside a
// zone to the smallest subzone that holds it, the most particular one.
function placeOf(x, y, level) {
  const holders = zones.filter((m) => x >= m.rect[0] && x <= m.rect[2] && y >= m.rect[1] && y <= m.rect[3] && inShape(m.outline, x, y));
  if (!holders.length) return null;
  const fit = (m) => (!m.levels ? 99 : level < m.levels[0] ? m.levels[0] - level : level > m.levels[1] ? level - m.levels[1] : 0);
  const zone = holders.sort((a, b) => (a.kind === "city") - (b.kind === "city") || fit(a) - fit(b))[0];
  const subs = (zone.subzones || []).filter((s) => s.poly && inShape(s.poly, x, y)).sort((a, b) => a.size - b.size);
  return { zone, sub: subs[0] || null };
}

// ---------------------------------------------------------------------------
// 3. Mobs: every creature spawn a player could level on
//
// Left out: anything friendly to either faction (townsfolk and guards, a
// Horde guard is not levelling content for the Alliance), anything with a
// service to offer, critters, totems and pets, what cannot be targeted or
// is never seen (by flag, or wearing an invisibility aura: the "Unseen" of
// Raven Hill), guards by flag, what gives no experience, raid and world
// bosses, and spawns that only appear during a world event. A creature with
// a level range counts at the middle of it.
// ---------------------------------------------------------------------------
const gz = path.join(CACHE, "classicdb.sql.gz");
if (!fs.existsSync(gz)) { log("  downloading classic-db"); fs.writeFileSync(gz, await wago.fetchWithRetry(CLASSICDB_URL)); }
const sql = zlib.gunzipSync(fs.readFileSync(gz)).toString("latin1");
const col = (table) => { const c = tableColumns(sql, table); return (r, k) => r[c.indexOf(k)]; };

const EXTRA = { NO_AGGRO: 0x2, NO_XP: 0x40, INVISIBLE: 0x80, GUARD: 0x400 };
const UNIT = { NON_ATTACKABLE: 0x2, NOT_SELECTABLE: 0x2000000 };
const CRITTER = 8, TOTEM = 11, PET = 12, BOSS = 3;
const invisibleAuras = (auras) => String(auras || "").split(/\s+/).some((a) => invisibility.has(Number(a)));
const unseenEntries = new Set(), unseenSpawns = new Set();
for (const r of readInsertRows(sql, "creature_template_addon")) if (invisibleAuras(r[r.length - 1])) unseenEntries.add(r[0]);
for (const r of readInsertRows(sql, "creature_addon")) if (invisibleAuras(r[r.length - 1])) unseenSpawns.add(r[0]);
const mobLevel = new Map(); // creature entry -> level, for those that count
{
  const C = col("creature_template");
  const why = {};
  const skip = (k) => { why[k] = (why[k] || 0) + 1; };
  for (const r of readInsertRows(sql, "creature_template")) {
    const type = C(r, "CreatureType"), extra = C(r, "ExtraFlags"), unit = C(r, "UnitFlags");
    if (C(r, "NpcFlags")) { skip("offers a service"); continue; }
    if (friendlyToAPlayer(C(r, "Faction"))) { skip("friendly to a faction"); continue; }
    if (type === CRITTER || type === TOTEM || type === PET) { skip("critter, totem or pet"); continue; }
    if (unit & (UNIT.NON_ATTACKABLE | UNIT.NOT_SELECTABLE)) { skip("cannot be attacked"); continue; }
    if (extra & (EXTRA.NO_AGGRO | EXTRA.NO_XP | EXTRA.INVISIBLE | EXTRA.GUARD) || unseenEntries.has(C(r, "Entry"))) { skip("guard, unseen or no experience"); continue; }
    if (C(r, "Rank") === BOSS) { skip("boss"); continue; }
    if (/trigger|dummy|\(/i.test(C(r, "Name"))) { skip("trigger"); continue; }
    mobLevel.set(C(r, "Entry"), Math.round((C(r, "MinLevel") + C(r, "MaxLevel")) / 2));
  }
  log(`  creature templates: ${mobLevel.size} count as mobs; left out ${Object.entries(why).map(([k, n]) => `${n} ${k}`).join(", ")}`);
}
const eventOnly = new Set();
for (const r of readInsertRows(sql, "game_event_creature")) if (r[1] > 0) eventOnly.add(r[0]);
const spawnEntry = new Map(); // spawns that pick their creature from a list: the first stands for them
for (const r of readInsertRows(sql, "creature_spawn_entry")) if (!spawnEntry.has(r[0])) spawnEntry.set(r[0], r[1]);

const zoneMobs = new Map(), subMobs = new Map(), instMobs = new Map();
const add = (map, key, level) => { if (!map.has(key)) map.set(key, []); map.get(key).push(level); };
const instanceIds = new Set(D.instances.map((i) => i.id));
{
  const C = col("creature");
  let counted = 0, outside = 0, events = 0;
  for (const r of readInsertRows(sql, "creature")) {
    const guid = C(r, "guid");
    const level = mobLevel.get(C(r, "id") || spawnEntry.get(guid));
    if (level == null) continue;
    if (eventOnly.has(guid)) { events++; continue; }
    if (unseenSpawns.has(guid)) continue;
    const map = C(r, "map");
    if (instanceIds.has(map)) { add(instMobs, map, level); counted++; continue; }
    const at = frameOf(map, C(r, "position_x"), C(r, "position_y"));
    if (!at) continue;
    const place = placeOf(at[0], at[1], level);
    if (!place) { outside++; continue; }
    add(zoneMobs, place.zone.id, level);
    if (place.sub) add(subMobs, `${place.zone.id}:${place.sub.area}`, level);
    counted++;
  }
  log(`  creature spawns: ${counted} mobs counted, ${outside} outside every zone shape, ${events} only during world events`);
}

// ---------------------------------------------------------------------------
// 4. Quests: the level of every quest the game files under a zone
//
// A quest's zone is the header the quest log puts it under (a subzone's
// quests, Northshire's say, belong to its zone; a dungeon's to the dungeon).
// Left out: class, profession and holiday quests (filed under a sort, not a
// zone), raid and PvP quests, world-event quests, repeatable turn-ins,
// quests no one hands out, and the database's unused ones.
// ---------------------------------------------------------------------------
const ALLIANCE_RACES = 1 | 4 | 8 | 64, HORDE_RACES = 2 | 16 | 32 | 128;
const QTYPE = { RAID: 62, PVP: 41, EVENT: 82 };
const REPEATABLE = 1;
const zoneByArea = new Map(zones.map((m) => [m.area, m]));
const instByMap = new Map(D.instances.map((i) => [i.id, i]));
function questHome(areaId) {
  // walk up the area tree to a zone on the map, or a dungeon
  for (let a = areaById.get(areaId), guard = 0; a && guard < 6; a = areaById.get(Number(a.ParentAreaID)), guard++) {
    const id = Number(a.ID);
    if (zoneByArea.has(id)) return { zone: zoneByArea.get(id) };
    if (instByMap.has(Number(a.ContinentID))) return { inst: instByMap.get(Number(a.ContinentID)) };
    if (Number(a.ParentAreaID) === 0) break;
  }
  return null;
}
const zoneQuests = new Map(), instQuests = new Map();
{
  const starters = new Set();
  for (const r of readInsertRows(sql, "creature_questrelation")) starters.add(r[1]);
  for (const r of readInsertRows(sql, "gameobject_questrelation")) starters.add(r[1]);
  const I = col("item_template");
  for (const r of readInsertRows(sql, "item_template")) if (I(r, "startquest")) starters.add(I(r, "startquest"));
  const Q = col("quest_template");
  let kept = 0, homeless = 0;
  for (const r of readInsertRows(sql, "quest_template")) {
    const zone = Q(r, "ZoneOrSort"), level = Q(r, "QuestLevel"), type = Q(r, "Type");
    if (zone <= 0 || level <= 0) continue;
    if (type === QTYPE.RAID || type === QTYPE.PVP || type === QTYPE.EVENT) continue;
    if (Q(r, "SpecialFlags") & REPEATABLE) continue;
    if (!starters.has(Q(r, "entry"))) continue;
    if (/<|\[|UNUSED|NYI|\bTEST\b|ZZOLD|DEPRECATED/i.test(Q(r, "Title") || "")) continue;
    const home = questHome(zone);
    if (!home) { homeless++; continue; }
    const races = Q(r, "RequiredRaces");
    const forA = !races || (races & ALLIANCE_RACES) !== 0, forH = !races || (races & HORDE_RACES) !== 0;
    const key = home.zone ? home.zone.id : home.inst.id, into = home.zone ? zoneQuests : instQuests;
    if (!into.has(key)) into.set(key, { A: [], H: [] });
    if (forA) into.get(key).A.push(level);
    if (forH) into.get(key).H.push(level);
    kept++;
  }
  log(`  quests: ${kept} filed under a zone or dungeon on the map (${homeless} under places the map does not show)`);
}

// ---------------------------------------------------------------------------
// 5. Summaries
// ---------------------------------------------------------------------------
const sorted = (a) => [...a].sort((x, y) => x - y);
const quantile = (s, p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
// a level histogram, compact: [first level, count, count, ...]
function histogram(levels) {
  if (!levels.length) return null;
  const s = sorted(levels), lo = s[0], hi = s[s.length - 1];
  const h = new Array(hi - lo + 1).fill(0);
  for (const l of s) h[l - lo]++;
  return [lo, ...h];
}
// the spread a player meets: the middle 80%, so a lone rare or a stray from next door does not stretch it
const spread = (levels) => { const s = sorted(levels); return { lv: [quantile(s, 0.1), quantile(s, 0.9)], med: quantile(s, 0.5), n: s.length }; };

const out = { build: BUILD, generated: new Date().toISOString().slice(0, 10), zones: {}, instances: {} };
let fromMobs = 0, fromClient = 0, fromNeighbour = 0, fromBand = 0;
for (const m of zones) {
  const z = { };
  if (sanctuary(m)) z.sanctuary = true;
  const mobs = zoneMobs.get(m.id) || [];
  // a zone's own spread from its mobs, where it has enough to go on (Forever's zones have a stray or none)
  if (mobs.length >= MIN_ZONE_SPAWNS && !z.sanctuary) { Object.assign(z, spread(mobs)); z.mobs = histogram(mobs); }
  const q = zoneQuests.get(m.id);
  if (q && !z.sanctuary) z.quests = { A: histogram(q.A), H: histogram(q.H) };
  if (!z.sanctuary) {
    z.subzones = {};
    const known = [];
    for (const s of m.subzones || []) {
      if (z.subzones[s.area]) continue; // one subzone can be drawn by several overlays
      if (cityAreas.has(s.area)) { z.subzones[s.area] = { sanctuary: true }; continue; }
      const l = subMobs.get(`${m.id}:${s.area}`) || [];
      const expl = Number(areaById.get(s.area)?.ExplorationLevel) || 0;
      let e;
      if (l.length >= MIN_SPAWNS || (l.length && !expl)) { e = { ...spread(l), src: "mobs" }; fromMobs++; }
      else if (expl > 0) { e = { lv: [expl, expl], med: expl, n: l.length, src: "client" }; fromClient++; }
      if (e) { known.push({ s, e }); z.subzones[s.area] = e; }
    }
    // a subzone with neither: the level of the nearest one that has one, else the zone's band
    for (const s of m.subzones || []) {
      if (z.subzones[s.area]) continue;
      let best = null, bd = Infinity;
      for (const k of known) { const d = Math.hypot(k.s.at[0] - s.at[0], k.s.at[1] - s.at[1]); if (d < bd) { bd = d; best = k; } }
      if (best) { z.subzones[s.area] = { lv: [...best.e.lv], med: best.e.med, n: 0, src: "near", near: best.s.name }; fromNeighbour++; }
      else if (m.levels) { z.subzones[s.area] = { lv: [...m.levels], med: Math.round((m.levels[0] + m.levels[1]) / 2), n: 0, src: "band" }; fromBand++; }
    }
    if (!z.lv && m.levels) {
      // no spawns at all (a zone Forever adds): the zone's own spread is its subzones'
      const meds = Object.values(z.subzones).filter((e) => e.med).map((e) => e.med);
      const s = meds.length ? sorted(meds) : [...m.levels];
      z.lv = [s[0], s[s.length - 1]]; z.med = quantile(s, 0.5); z.n = 0;
    }
  }
  out.zones[m.id] = z;
}
for (const d of D.instances) {
  const mobs = instMobs.get(d.id) || [];
  const q = instQuests.get(d.id);
  if (!mobs.length && !q) continue;
  const e = mobs.length ? spread(mobs) : {};
  if (q) e.quests = { A: histogram(q.A), H: histogram(q.H) };
  out.instances[d.id] = e;
}
log(`  subzone levels: ${fromMobs} from their mobs, ${fromClient} from the client's area table, ${fromNeighbour} from the nearest subzone, ${fromBand} from the zone's band`);
log(`  ${Object.keys(out.instances).length} dungeons and raids with levels`);

fs.writeFileSync(path.join(OUT, "levels.json"), JSON.stringify(out));
log(`wrote ${OUT}/levels.json (${Math.round(fs.statSync(path.join(OUT, "levels.json")).size / 1024)} KB)`);
