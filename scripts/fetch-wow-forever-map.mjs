#!/usr/bin/env node
// Builds the WoW Forever World Map's data from the game's own client files
// and the community's spawn data:
//
//   * wago.tools — the datamined client database of one Forever build (the
//     UiMap / UiMapAssignment tables that place every map in the world, the
//     map art tiles and the explored-area overlays, the flight nodes and
//     paths, transport paths, points of interest, area groups and spells)
//   * CMaNGOS classic-db (GPLv3) — the vanilla 1.12 spawn table: where each
//     banker, auctioneer and flight master that already existed stands
//   * scripts/data/wow-forever/npcs-observed.json — the NPCs Forever adds
//     or moves, noted in the game itself (README: "Adding an NPC")
//
// No website's database is read: Wowhead's terms bar tools other than a
// browser, so its data is not used. Everything downloaded is cached in
// .wow-forever-cache/ so a rebuild only refetches what is missing. Output:
//
//   public/tools/wow-forever/data/world-map/world-map.json
//   public/tools/wow-forever/data/world-map/maps/<uiMapId>.jpg
//
// Usage: node scripts/fetch-wow-forever-map.mjs [build] [--force-images]

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import jpeg from "jpeg-js";
import { Wago } from "./lib/wago.mjs";
import { decodeBLP } from "./lib/blp.mjs";
import { traceMask, simplifyRing, ringArea, closeMask } from "./lib/contour.mjs";
import { readInsertRows, tableColumns } from "./lib/mysql-dump.mjs";
import { bundleEdges, bundleGroups } from "./lib/bundle.mjs";

const BUILD = process.argv.find((a) => /^\d+\.\d+\.\d+\.\d+$/.test(a)) || "1.60.1.69913";
const FORCE_IMAGES = process.argv.includes("--force-images");
const CACHE = ".wow-forever-cache";
const OUT = "public/tools/wow-forever/data/world-map";
const OBSERVED = "scripts/data/wow-forever/npcs-observed.json";
const MAPS_OUT = path.join(OUT, "maps");
fs.mkdirSync(MAPS_OUT, { recursive: true });

const FRAME_W = 1002, FRAME_H = 668;     // the Azeroth map's own pixel size
const FLIGHT_SPEED = 30;                 // yards/second, calibrated against recorded Classic flights
const TRANSPORT_SPEED = 30, TRANSPORT_ACCEL = 1; // the vanilla boats' and zeppelins' gameobject data
const CLASSICDB_URL = "https://raw.githubusercontent.com/cmangos/classic-db/master/Full_DB/ClassicDB_1_12_1_z2815.sql.gz";

const log = (...a) => console.log(...a);
const wago = new Wago(BUILD, CACHE);
const num = (v) => Number(v);
const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;

// ---------------------------------------------------------------------------
// 1. Client tables
// ---------------------------------------------------------------------------
log(`build ${BUILD}`);
const T = {};
for (const name of ["UiMap", "UiMapAssignment", "UiMapArt", "UiMapXMapArt", "UiMapArtTile", "UiMapArtStyleLayer",
  "TaxiNodes", "TaxiPath", "TaxiPathNode", "AreaTable", "Map", "AreaPOI", "WorldMapOverlay", "WorldMapOverlayTile", "FactionTemplate",
  "SpellCastingRequirements", "AreaGroupMember", "SpellName", "Spell", "ItemEffect", "ItemXItemEffect", "ItemSparse"]) {
  T[name] = await wago.table(name);
  log(`  ${name}: ${T[name].length} rows`);
}
const areaById = new Map(T.AreaTable.map((a) => [a.ID, a]));
const areaName = (id) => areaById.get(String(id))?.AreaName_lang || null;

// ---------------------------------------------------------------------------
// 2. The maps and the frame they share
//
// The world map (UiMap 947, "Azeroth") places each continent's world
// coordinates in its own image; every zone and city map places its region
// of the same world coordinates in *its* image. So the Azeroth image is a
// frame everything can be expressed in: 1002x668 pixels at zoom 1, with
// x = east and y = south. World coordinates have +x north and +y west.
// ---------------------------------------------------------------------------
const uiMaps = new Map(T.UiMap.map((u) => [u.ID, u]));
const assignments = T.UiMapAssignment;
const continents = {}; // mapId -> { ox, oy, s, minX, maxX, minY, maxY }
for (const a of assignments.filter((a) => a.UiMapID === "947")) {
  const minX = num(a.Region_0), minY = num(a.Region_1), maxX = num(a.Region_3), maxY = num(a.Region_4);
  const u0 = num(a.UiMin_0) * FRAME_W, v0 = num(a.UiMin_1) * FRAME_H;
  const sx = (num(a.UiMax_0) - num(a.UiMin_0)) * FRAME_W / (maxY - minY);
  const sy = (num(a.UiMax_1) - num(a.UiMin_1)) * FRAME_H / (maxX - minX);
  continents[a.MapID] = { ox: u0, oy: v0, s: (sx + sy) / 2, minX, maxX, minY, maxY, sx, sy };
  log(`  continent map ${a.MapID}: ${r2(1 / sx)} / ${r2(1 / sy)} yards per frame pixel`);
}
// Zephras Isle floats in Skywall (its own map), so the world map cannot
// place it; it is shown as an inset in the empty sea north of the Maelstrom.
const INSETS = { 2991: { x0: 486, y0: 14, note: "Zephras Isle floats in Skywall, the Elemental Plane of Air — it is not on Azeroth's map. Shown here as an inset at world scale." } };
function frameOf(mapId, x, y) {
  const c = continents[mapId];
  if (!c) return null;
  return [c.ox + (c.maxY - y) * c.s, c.oy + (c.maxX - x) * c.s];
}

const artById = new Map(T.UiMapArt.map((a) => [a.ID, a]));
const styleByArtStyle = new Map(T.UiMapArtStyleLayer.map((s) => [s.UiMapArtStyleID, s]));
const artOf = (uiMapId) => T.UiMapXMapArt.find((x) => x.UiMapID === uiMapId)?.UiMapArtID;

const maps = [];
for (const u of T.UiMap) {
  if (u.System !== "0") continue;               // the flight map's own backgrounds
  const type = num(u.Type);                     // 1 world, 2 continent, 3 zone
  const own = assignments.filter((a) => a.UiMapID === u.ID);
  const asg = type === 1 ? own[0] : own.find((a) => Math.abs(num(a.UiMin_0)) < 1e-6 && Math.abs(num(a.UiMin_1)) < 1e-6) || own[0];
  if (!asg) continue;
  const mapId = num(asg.MapID);
  const isCity = ["1453", "1454", "1455", "1456", "1457", "1458"].includes(u.ID);
  const kind = type === 1 ? "world" : type === 2 ? "continent" : isCity ? "city" : "zone";
  if (type === 3 && !(continents[mapId] || INSETS[mapId])) { log(`  skipping ${u.Name_lang} (${u.ID}): map ${mapId} is not on the world map`); continue; }
  const minX = num(asg.Region_0), minY = num(asg.Region_1), maxX = num(asg.Region_3), maxY = num(asg.Region_4);
  let rect;
  if (type === 1) rect = [0, 0, FRAME_W, FRAME_H];
  else if (continents[mapId]) {
    const [x0, y0] = frameOf(mapId, maxX, maxY), [x1, y1] = frameOf(mapId, minX, minY);
    rect = [x0, y0, x1, y1];
  } else {
    const c = Object.values(continents)[0];
    const inset = INSETS[mapId];
    rect = [inset.x0, inset.y0, inset.x0 + (maxY - minY) * c.s, inset.y0 + (maxX - minX) * c.s];
    if (!continents[mapId]) continents[mapId] = { ox: inset.x0, oy: inset.y0, s: c.s, minX, maxX, minY, maxY, inset: true };
  }
  const style = styleByArtStyle.get(artById.get(artOf(u.ID))?.UiMapArtStyleID);
  maps.push({ id: num(u.ID), name: u.Name_lang, kind, parent: num(u.ParentUiMapID), mapId, area: num(asg.AreaID),
    region: { minX, maxX, minY, maxY }, rect: rect.map(r2), art: artOf(u.ID), imgW: num(style?.LayerWidth || 1002), imgH: num(style?.LayerHeight || 668),
    note: INSETS[mapId]?.note });
}
log(`  ${maps.length} maps kept`);

// world -> frame for a point on any map we know
function toFrame(mapId, x, y) {
  return frameOf(mapId, x, y);
}
// the game's own map coordinates (percent across and down a zone map, as
// C_Map.GetPlayerMapPosition reports them) -> world -> frame
function mapPercentToFrame(uiMapId, u, v) {
  const m = maps.find((m) => m.id === num(uiMapId));
  if (!m) return null;
  const r = m.region;
  const x = r.maxX - (v / 100) * (r.maxX - r.minX), y = r.maxY - (u / 100) * (r.maxY - r.minY);
  return toFrame(m.mapId, x, y);
}

// ---------------------------------------------------------------------------
// 3. Map art: decode the BLP tiles, stitch, write JPEG
//
// A zone map's tiles are the *unexplored* art — the washed-out version the
// game shows before you have been somewhere. Each explored subzone is a
// separate overlay texture drawn on top at an offset, so the fully explored
// map is the tiles with every overlay composited over them. A map also
// shows its neighbours' land around its edges, and only its own overlays
// exist in its image, so the neighbours' explored areas are borrowed from
// their maps by world position; otherwise a zone's land would turn dim the
// moment it crosses out of its own map's frame.
// ---------------------------------------------------------------------------
const tilesByArt = new Map();
for (const t of T.UiMapArtTile) {
  if (!tilesByArt.has(t.UiMapArtID)) tilesByArt.set(t.UiMapArtID, []);
  tilesByArt.get(t.UiMapArtID).push(t);
}
const overlayTiles = new Map();
for (const t of T.WorldMapOverlayTile) {
  if (!overlayTiles.has(t.WorldMapOverlayID)) overlayTiles.set(t.WorldMapOverlayID, []);
  overlayTiles.get(t.WorldMapOverlayID).push(t);
}
async function stitch(artId, W, H) {
  const out = Buffer.alloc(W * H * 4);
  for (const t of tilesByArt.get(artId) || []) {
    const img = decodeBLP(await wago.file(t.FileDataID));
    const ox = num(t.ColIndex) * 256, oy = num(t.RowIndex) * 256;
    for (let y = 0; y < img.height; y++) {
      const yy = oy + y; if (yy >= H) break;
      for (let x = 0; x < img.width; x++) {
        const xx = ox + x; if (xx >= W) break;
        const si = (y * img.width + x) * 4, di = (yy * W + xx) * 4;
        out[di] = img.data[si]; out[di + 1] = img.data[si + 1]; out[di + 2] = img.data[si + 2]; out[di + 3] = 255;
      }
    }
  }
  // explored areas over the top; the mask remembers how explored each pixel is
  const mask = new Uint8Array(W * H);
  let explored = 0;
  for (const o of T.WorldMapOverlay.filter((o) => o.UiMapArtID === artId)) {
    const tw = num(o.TextureWidth), th = num(o.TextureHeight);
    for (const t of overlayTiles.get(o.ID) || []) {
      const img = decodeBLP(await wago.file(t.FileDataID));
      const cx = num(t.ColIndex) * 256, cy = num(t.RowIndex) * 256;
      const ox = num(o.OffsetX) + cx, oy = num(o.OffsetY) + cy;
      for (let y = 0; y < img.height && cy + y < th; y++) {
        const yy = oy + y; if (yy < 0 || yy >= H) continue;
        for (let x = 0; x < img.width && cx + x < tw; x++) {
          const xx = ox + x; if (xx < 0 || xx >= W) continue;
          const si = (y * img.width + x) * 4, di = (yy * W + xx) * 4, a = img.data[si + 3] / 255;
          if (!a) continue;
          out[di] = img.data[si] * a + out[di] * (1 - a);
          out[di + 1] = img.data[si + 1] * a + out[di + 1] * (1 - a);
          out[di + 2] = img.data[si + 2] * a + out[di + 2] * (1 - a);
          mask[yy * W + xx] = Math.max(mask[yy * W + xx], img.data[si + 3]);
        }
      }
    }
    explored++;
  }
  return { rgba: out, mask, explored };
}
// B's explored pixels painted into A's image wherever A's own overlays leave it unexplored
function borrow(A, B) {
  const [ax0, ay0, ax1, ay1] = A.m.rect, [bx0, by0, bx1, by1] = B.m.rect;
  const AW = A.m.imgW, AH = A.m.imgH, BW = B.m.imgW, BH = B.m.imgH;
  const fx = (i) => ax0 + ((i + 0.5) * (ax1 - ax0)) / AW, fy = (j) => ay0 + ((j + 0.5) * (ay1 - ay0)) / AH;
  const i0 = Math.max(0, Math.floor(((bx0 - ax0) / (ax1 - ax0)) * AW)), i1 = Math.min(AW, Math.ceil(((bx1 - ax0) / (ax1 - ax0)) * AW));
  const j0 = Math.max(0, Math.floor(((by0 - ay0) / (ay1 - ay0)) * AH)), j1 = Math.min(AH, Math.ceil(((by1 - ay0) / (ay1 - ay0)) * AH));
  let painted = 0;
  for (let j = j0; j < j1; j++) {
    const bj = Math.floor(((fy(j) - by0) / (by1 - by0)) * BH); if (bj < 0 || bj >= BH) continue;
    for (let i = i0; i < i1; i++) {
      const own = A.mask[j * AW + i]; if (own === 255) continue;
      const bi = Math.floor(((fx(i) - bx0) / (bx1 - bx0)) * BW); if (bi < 0 || bi >= BW) continue;
      const a = (B.mask[bj * BW + bi] / 255) * (1 - own / 255); if (!a) continue;
      const si = (bj * BW + bi) * 4, di = (j * AW + i) * 4;
      A.rgba[di] = B.rgba[si] * a + A.rgba[di] * (1 - a);
      A.rgba[di + 1] = B.rgba[si + 1] * a + A.rgba[di + 1] * (1 - a);
      A.rgba[di + 2] = B.rgba[si + 2] * a + A.rgba[di + 2] * (1 - a);
      painted++;
    }
  }
  return painted;
}
{
  const todo = maps.filter((m) => { m.img = `maps/${m.id}.jpg`; return FORCE_IMAGES || !fs.existsSync(path.join(MAPS_OUT, `${m.id}.jpg`)); });
  for (const m of todo) if (!tilesByArt.has(m.art)) { log(`  no art for ${m.name}`); m.img = null; }
  // zones lend each other their explored areas, so every zone map is stitched before any is written
  const zones = new Map();
  for (const m of maps) if (m.kind === "zone" && tilesByArt.has(m.art) && (todo.includes(m) || todo.some((o) => o.kind === "zone" && rectsOverlap(o.rect, m.rect)))) zones.set(m.id, { m, ...(await stitch(m.art, m.imgW, m.imgH)) });
  for (const m of todo) {
    if (!m.img) continue;
    let art, note = "";
    if (m.kind === "zone") {
      const A = zones.get(m.id);
      let borrowed = 0;
      for (const B of zones.values()) if (B !== A && rectsOverlap(A.m.rect, B.m.rect) && borrow(A, B)) borrowed++;
      art = A.rgba; note = `, ${A.explored} explored areas, ${borrowed} neighbours borrowed`;
    } else art = (await stitch(m.art, m.imgW, m.imgH)).rgba;
    const j = jpeg.encode({ data: art, width: m.imgW, height: m.imgH }, 80);
    fs.writeFileSync(path.join(MAPS_OUT, `${m.id}.jpg`), j.data);
    log(`  wrote maps/${m.id}.jpg ${m.name} (${Math.round(j.data.length / 1024)} KB${note})`);
  }
}
function rectsOverlap(a, b) { return a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1]; }

// ---------------------------------------------------------------------------
// 4. Subzone overlays -> shapes
//
// Each WorldMapOverlay is one explored-subzone texture drawn at an offset
// on its map's art; its alpha channel is the subzone's shape. The union of
// a map's overlays is the map's land.
// ---------------------------------------------------------------------------
function ringsToFrame(rings, m, tolerancePx) {
  const [x0, y0, x1, y1] = m.rect;
  const sx = (x1 - x0) / m.imgW, sy = (y1 - y0) / m.imgH;
  return rings.map((r) => simplifyRing(r, tolerancePx).map(([x, y]) => [r2(x0 + x * sx), r2(y0 + y * sy)]));
}
for (const m of maps) {
  if (m.kind === "world" || m.kind === "continent") continue;
  const overlays = T.WorldMapOverlay.filter((o) => o.UiMapArtID === m.art);
  const W = m.imgW, H = m.imgH;
  const union = new Uint8Array(W * H);
  m.subzones = [];
  for (const o of overlays) {
    const tiles = overlayTiles.get(o.ID) || [];
    const tw = num(o.TextureWidth), th = num(o.TextureHeight);
    const mask = new Uint8Array(W * H);
    let any = false;
    // tiles are laid out row-major in 256px squares inside the texture
    const cols = Math.ceil(tw / 256);
    for (const t of tiles) {
      const img = decodeBLP(await wago.file(t.FileDataID));
      const ox = num(o.OffsetX) + num(t.ColIndex) * 256, oy = num(o.OffsetY) + num(t.RowIndex) * 256;
      for (let y = 0; y < img.height; y++) {
        const yy = oy + y; if (yy < 0 || yy >= H || y >= th - num(t.RowIndex) * 256) continue;
        for (let x = 0; x < img.width; x++) {
          const xx = ox + x; if (xx < 0 || xx >= W || x >= tw - num(t.ColIndex) * 256) continue;
          if (img.data[(y * img.width + x) * 4 + 3] > 96) { mask[yy * W + xx] = 1; union[yy * W + xx] = 1; any = true; }
        }
      }
    }
    void cols;
    const name = areaName(o.AreaID_0) || null;
    if (!name) continue;
    let center, poly = null;
    if (any) {
      const rings = traceMask(closeMask(mask, W, H, 1), W, H).filter((r) => ringArea(r) < -400 || ringArea(r) > 400);
      rings.sort((a, b) => Math.abs(ringArea(b)) - Math.abs(ringArea(a)));
      const outer = rings.filter((r) => ringArea(r) > 0).slice(0, 3); // in screen space (y down) the tracer's outer rings have positive area, holes negative
      poly = ringsToFrame(outer.length ? outer : rings.slice(0, 1), m, 1.5);
      let sx = 0, sy = 0, n = 0;
      for (let i = 0; i < W * H; i++) if (mask[i]) { sx += i % W; sy += (i / W) | 0; n++; }
      center = [sx / n, sy / n];
    } else {
      center = [(num(o.HitRectLeft) + num(o.HitRectRight)) / 2, (num(o.HitRectTop) + num(o.HitRectBottom)) / 2];
    }
    const [x0, y0, x1, y1] = m.rect;
    m.subzones.push({ name, area: num(o.AreaID_0), at: [r2(x0 + center[0] * (x1 - x0) / W), r2(y0 + center[1] * (y1 - y0) / H)], poly });
  }
  // the map's own land: union of its overlays
  const rings = traceMask(closeMask(union, W, H, 2), W, H).filter((r) => ringArea(r) > 900);
  rings.sort((a, b) => ringArea(b) - ringArea(a));
  m.outline = ringsToFrame(rings.slice(0, 4), m, 2);
  log(`  ${m.name}: ${m.subzones.length} subzones, outline ${m.outline.map((r) => r.length).join("+")} pts`);
}

// ---------------------------------------------------------------------------
// 5. Biomes: the area groups the biome-keyed item effects require
// ---------------------------------------------------------------------------
const BIOMES = [
  { key: "forest", name: "Forest & Grassland", group: "9161", color: "#5fae4a" },
  { key: "swamp", name: "Swamp", group: "9162", color: "#4c8c73" },
  { key: "wasteland", name: "Wasteland", group: "9163", color: "#b8843a" },
  { key: "snowy", name: "Snowy", group: "9164", color: "#9fd3ea" },
  { key: "mountain", name: "Mountainous", group: "9165", color: "#a08aa8" },
  { key: "haunted", name: "Haunted", group: "9202", color: "#7f6fd6" },
  { key: "cavern", name: "Cavernous & Underground", group: "9324", color: "#8c7a5b" },
  { key: "desert", name: "Desert", group: "9097", color: "#e0b95a" },
];
const spellName = new Map(T.SpellName.map((s) => [s.ID, s.Name_lang]));
const spellById = new Map(T.Spell.map((s) => [s.ID, s]));
const itemsBySpell = new Map();
{
  const effItems = new Map();
  for (const x of T.ItemXItemEffect) { if (!effItems.has(x.ItemEffectID)) effItems.set(x.ItemEffectID, []); effItems.get(x.ItemEffectID).push(x.ItemID); }
  for (const e of T.ItemEffect) for (const it of effItems.get(e.ID) || []) { if (!itemsBySpell.has(e.SpellID)) itemsBySpell.set(e.SpellID, new Set()); itemsBySpell.get(e.SpellID).add(it); }
}
const itemById = new Map(T.ItemSparse.map((i) => [i.ID, i]));
const SLOT = { 12: "trinket", 11: "ring", 2: "neck", 1: "head", 3: "shoulder", 5: "chest", 6: "waist", 7: "legs", 8: "feet", 9: "wrist", 10: "hands", 16: "back", 13: "one-hand", 17: "two-hand", 14: "shield", 15: "ranged", 21: "main hand", 22: "off hand", 23: "held", 26: "ranged", 25: "thrown", 20: "chest", 4: "shirt", 19: "tabard" };
const cleanText = (t) => (t || "").replace(/\$@spelldesc\d+/g, "").replace(/\$\{?\$?(\d+)?[smwdto]\d\}?(\/\d+)?/g, "X").replace(/\$[a-z]\d/g, "X").replace(/\s+/g, " ").trim();
function itemsForSpell(id) {
  const direct = [...(itemsBySpell.get(id) || [])];
  const parents = T.Spell.filter((s) => (s.Description_lang || "").includes("$" + id + "s")).map((s) => s.ID);
  const viaParent = parents.flatMap((p) => [...(itemsBySpell.get(p) || [])]);
  return [...new Set([...direct, ...viaParent])];
}
for (const b of BIOMES) {
  const areaIds = T.AreaGroupMember.filter((m) => m.AreaGroupID === b.group).map((m) => m.AreaID);
  b.zones = []; b.subzones = []; b.instances = []; b.unknown = [];
  for (const id of areaIds) {
    const a = areaById.get(id);
    if (!a) { b.unknown.push(num(id)); continue; }
    const isInstance = !["0", "1", "2991"].includes(a.ContinentID);
    if (isInstance) b.instances.push({ area: num(id), name: a.AreaName_lang, map: num(a.ContinentID) });
    else if (a.ParentAreaID === "0") { if (!b.zones.includes(num(id))) b.zones.push(num(id)); }
    else b.subzones.push({ area: num(id), name: a.AreaName_lang, zone: num(a.ParentAreaID), zoneName: areaName(a.ParentAreaID) });
  }
  b.effects = [];
  for (const r of T.SpellCastingRequirements.filter((r) => r.RequiredAreasID === b.group)) {
    const s = spellById.get(r.SpellID);
    const text = cleanText(s?.AuraDescription_lang) || cleanText(s?.Description_lang);
    const items = itemsForSpell(r.SpellID).map((iid) => { const it = itemById.get(iid); return { id: num(iid), name: it?.Display_lang || null, slot: it ? (SLOT[it.InventoryType] || null) : null, level: it ? num(it.ItemLevel) : null, requires: it ? num(it.RequiredLevel) : null }; });
    b.effects.push({ spell: num(r.SpellID), name: spellName.get(r.SpellID) || null, text, items });
  }
  log(`  biome ${b.name}: ${b.zones.length} zones, ${b.subzones.length} subzones, ${b.instances.length} instances, ${b.unknown.length} unknown areas, ${b.effects.length} effects`);
}

// ---------------------------------------------------------------------------
// 6. Flight masters and flight paths
// ---------------------------------------------------------------------------
const pathNodes = new Map();
for (const n of T.TaxiPathNode) { if (!pathNodes.has(n.PathID)) pathNodes.set(n.PathID, []); pathNodes.get(n.PathID).push(n); }
for (const arr of pathNodes.values()) arr.sort((a, b) => num(a.NodeIndex) - num(b.NodeIndex));
const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const referenced = new Set(T.TaxiPath.flatMap((p) => [p.FromTaxiNode, p.ToTaxiNode]));
const junkNode = (n) => /^(Transport|Generic|Quest Path|zzOLD|Programmer|Naxxramas$)/.test(n.Name_lang) || /Ferry$/.test(n.Name_lang) && !referenced.has(n.ID);
const taxiNodes = [];
for (const n of T.TaxiNodes) {
  if (junkNode(n) || !referenced.has(n.ID)) continue;
  const flags = num(n.Flags);
  const faction = (flags & 1) && (flags & 2) ? "N" : flags & 1 ? "A" : flags & 2 ? "H" : "N";
  const at = toFrame(num(n.ContinentID), num(n.Pos_0), num(n.Pos_1));
  if (!at) continue;
  const [place, zone] = n.Name_lang.split(",").map((s) => s.trim());
  taxiNodes.push({ id: num(n.ID), name: place, zone: zone || null, faction, at: at.map(r2), map: num(n.ContinentID), world: [r1(num(n.Pos_0)), r1(num(n.Pos_1))] });
}
const nodeIds = new Set(taxiNodes.map((n) => n.id));
const taxiRoutes = [];
for (const p of T.TaxiPath) {
  const from = num(p.FromTaxiNode), to = num(p.ToTaxiNode);
  if (!nodeIds.has(from) || !nodeIds.has(to) || num(p.Cost) === 0) continue;
  const nodes = pathNodes.get(p.ID) || [];
  if (nodes.length < 2) continue;
  let len = 0;
  const line = [];
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    const pt = toFrame(num(n.ContinentID), num(n.Loc_0), num(n.Loc_1));
    if (pt) line.push(pt.map(r2));
    if (i > 0 && nodes[i - 1].ContinentID === n.ContinentID) len += dist3([num(nodes[i - 1].Loc_0), num(nodes[i - 1].Loc_1), num(nodes[i - 1].Loc_2)], [num(n.Loc_0), num(n.Loc_1), num(n.Loc_2)]);
  }
  taxiRoutes.push({ id: num(p.ID), from, to, cost: num(p.Cost), yards: Math.round(len), seconds: Math.round(len / FLIGHT_SPEED), line: thin(line, 0.6) });
}
{
  const used = new Set(taxiRoutes.flatMap((r) => [r.from, r.to]));
  for (let i = taxiNodes.length - 1; i >= 0; i--) if (!used.has(taxiNodes[i].id)) { log(`  dropping flight node ${taxiNodes[i].name} (no priced routes)`); taxiNodes.splice(i, 1); }
}
log(`  ${taxiNodes.length} flight nodes, ${taxiRoutes.length} routes`);

// drop polyline points that add nothing at map scale
function thin(line, tol) {
  if (line.length <= 2) return line;
  const ring = line.slice();
  const out = simplifyRing(ring, tol);
  // simplifyRing keeps the first and the farthest point; make sure the last point survives
  if (out[out.length - 1] !== ring[ring.length - 1]) out.push(ring[ring.length - 1]);
  return out;
}

// ---------------------------------------------------------------------------
// 7. Boats, zeppelins and other transports
//
// A transport's path is a TaxiPath too, but one with dock stops (nodes that
// carry a delay). The vehicle sails the spline between stops at the
// gameobject's speed, accelerating and braking at each dock; a change of
// continent, a teleport flag, or the end of the loop is a jump.
//
// Each leg is written as pieces: the stretches the vessel really sails, and
// the jumps, where the game moves it between continents in an instant. The
// jumps are what cross the open sea on the world map, so after every route
// is known they are bundled — jumps that run the same way are drawn along
// one shared cable that fans out to its own docks at either end.
// ---------------------------------------------------------------------------
const TRANSPORTS = {
  241: { name: "The Maiden's Fancy", kind: "boat", faction: "N", stops: ["Ratchet", "Booty Bay"] },
  285: { name: "The Iron Eagle", kind: "zeppelin", faction: "H", stops: ["Grom'gol Base Camp", "Orgrimmar"] },
  292: { name: "The Lady Mehley", kind: "boat", faction: "A", stops: ["Menethil Harbor", "Theramore Isle"] },
  293: { name: "The Moonspray", kind: "boat", faction: "A", stops: ["Rut'theran Village", "Auberdine"] },
  295: { name: "The Bravery (vanilla route)", kind: "boat", faction: "A", stops: ["Menethil Harbor", "Auberdine"] },
  301: { name: "The Purple Princess", kind: "zeppelin", faction: "H", stops: ["Grom'gol Base Camp", "Undercity"] },
  302: { name: "The Thundercaller", kind: "zeppelin", faction: "H", stops: ["Orgrimmar", "Undercity"] },
  303: { name: "Feathermoon Ferry", kind: "boat", faction: "A", stops: ["The Forgotten Coast", "Feathermoon Stronghold", "The Forgotten Coast"] },
  11167: { name: "The Bravery", kind: "boat", faction: "A", stops: ["Menethil Harbor", "Southshore", "Auberdine"], note: "New in Forever: the Menethil boat now calls at Southshore on its way to Auberdine." },
  11391: { name: "Riverglades–Tanaris ship", kind: "boat", faction: "N", stops: ["Steamwheedle Port", "Powderfuse Port"], note: "New in Forever: a goblin ship between Tanaris and the Riverglades." },
  11398: { name: "Zephras skyship (Eastern Kingdoms)", kind: "airship", faction: "A", stops: ["Silverpine coast", "Zephras Isle"], note: "New in Forever, from the beta's path data: the vehicle and its faction are not confirmed." },
  11457: { name: "Zephras skyship (Kalimdor)", kind: "airship", faction: "H", stops: ["Mulgore, outside Thunder Bluff", "Zephras Isle"], note: "New in Forever, from the beta's path data: the vehicle and its faction are not confirmed." },
  11616: { name: "Stormwind–Auberdine ship", kind: "boat", faction: "A", stops: ["Auberdine", "Stormwind Harbor"], note: "New in Forever: a ship from Stormwind Harbor to Darkshore." },
};
function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return [0, 1, 2].map((i) => 0.5 * ((2 * p1[i]) + (-p0[i] + p2[i]) * t + (2 * p0[i] - 5 * p1[i] + 4 * p2[i] - p3[i]) * t2 + (-p0[i] + 3 * p1[i] - 3 * p2[i] + p3[i]) * t3));
}
const transports = [];
for (const [pathId, nodes] of pathNodes) {
  if (!nodes.some((n) => num(n.Delay) > 0)) continue;
  const tp = T.TaxiPath.find((p) => p.ID === pathId);
  if (tp && num(tp.Cost) > 0) continue;
  const meta = TRANSPORTS[pathId];
  if (!meta) { log(`  transport path ${pathId} has no entry in TRANSPORTS (stops: ${nodes.filter((n) => num(n.Delay) > 0).map((n) => `map${n.ContinentID} ${r1(num(n.Loc_0))},${r1(num(n.Loc_1))}`).join(" | ")})`); }
  const ns = nodes.map((n) => ({ p: [num(n.Loc_0), num(n.Loc_1), num(n.Loc_2)], map: num(n.ContinentID), delay: num(n.Delay), flags: num(n.Flags) }));
  const N = ns.length;
  const jump = (i) => i === N - 1 || (ns[i].flags & 1) !== 0 || ns[i].map !== ns[(i + 1) % N].map;
  const segLen = [];
  for (let i = 0; i < N; i++) {
    if (jump(i)) { segLen.push(0); continue; }
    const a = ns[i], b = ns[i + 1];
    const P0 = i > 0 && !jump(i - 1) ? ns[i - 1].p : a.p;
    const P3 = !jump(i + 1) ? ns[(i + 2) % N].p : b.p;
    let sl = 0, prev = a.p;
    for (let k = 1; k <= 16; k++) { const q = catmull(P0, a.p, b.p, P3, k / 16); sl += dist3(prev, q); prev = q; }
    segLen.push(sl);
  }
  const stopIdx = ns.map((n, i) => (n.delay > 0 ? i : -1)).filter((i) => i >= 0);
  if (stopIdx.length < 2) { log(`  transport path ${pathId} has a single stop; skipped`); continue; }
  const legs = [];
  let period = ns.reduce((s, n) => s + n.delay, 0);
  const framePt = (i) => { const pt = toFrame(ns[i].map, ns[i].p[0], ns[i].p[1]); return pt ? pt.map(r2) : null; };
  for (let s = 0; s < stopIdx.length; s++) {
    const a = stopIdx[s], b = stopIdx[(s + 1) % stopIdx.length];
    let d = 0;
    const pieces = [];
    let cur = [];
    const flush = () => { if (cur.length > 1) pieces.push({ line: thin(cur, 0.4) }); cur = []; };
    for (let i = a; ; i = (i + 1) % N) {
      const pt = framePt(i);
      if (pt) cur.push(pt);
      if (i === b) break;
      d += segLen[i];
      if (jump(i)) {
        const to = framePt((i + 1) % N);
        flush();
        if (pt && to && Math.hypot(to[0] - pt[0], to[1] - pt[1]) > 2) pieces.push({ jump: true, line: [pt, to] });
      }
    }
    flush();
    const v = TRANSPORT_SPEED, acc = TRANSPORT_ACCEL;
    const t = d >= v * v / acc ? 2 * v / acc + (d - v * v / acc) / v : 2 * Math.sqrt(d / acc);
    legs.push({ from: s, to: (s + 1) % stopIdx.length, yards: Math.round(d), seconds: Math.round(t), pieces });
    period += t;
  }
  const stops = stopIdx.map((i, k) => {
    const n = ns[i];
    const at = toFrame(n.map, n.p[0], n.p[1]);
    return { name: meta?.stops?.[k] || `Stop ${k + 1}`, at: at ? at.map(r2) : null, zone: at ? zoneOf(at.map(r2)) : null, map: n.map, world: [r1(n.p[0]), r1(n.p[1])], wait: n.delay };
  });
  transports.push({ id: num(pathId), name: meta?.name || `Transport path ${pathId}`, kind: meta?.kind || "transport", faction: meta?.faction || "N", note: meta?.note || null, stops, legs, period: Math.round(period) });
}
// cable management: bundle the sea crossings
{
  const jumps = [];
  for (const t of transports) for (const leg of t.legs) for (const p of leg.pieces) {
    if (!p.jump) continue;
    const [a, b] = p.line;
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 25) continue;
    const reversed = b[0] < a[0] || (b[0] === a[0] && b[1] < a[1]); // bundle west -> east, whichever way the vessel goes
    jumps.push({ p, t, edge: reversed ? [b[0], b[1], a[0], a[1]] : [a[0], a[1], b[0], b[1]], reversed });
  }
  const lines = bundleEdges(jumps.map((j) => j.edge), { threshold: 0.55 });
  const groups = bundleGroups(lines, 7);
  for (const g of groups) {
    g.sort((i, k) => jumps[i].t.id - jumps[k].t.id || jumps[i].reversed - jumps[k].reversed);
    g.forEach((idx, k) => {
      const j = jumps[idx];
      const line = thin(lines[idx].map((q) => q.map(r2)), 0.3);
      j.p.line = j.reversed ? line.reverse() : line;
      // lanes are spaced from the west->east view of the cable; a vessel drawn the other way sees the mirror image
      const lane = k - (g.length - 1) / 2;
      if (lane) j.p.lane = j.reversed ? -lane : lane;
    });
  }
  log(`  ${jumps.length} sea crossings bundled into ${groups.length} cables (${groups.map((g) => g.length).join(", ")} lanes)`);
}
// a route whose docks a newer route shares is the old version of that route
for (const t of transports) {
  const newer = transports.find((o) => o.id > t.id && t.stops.filter((s) => o.stops.some((os) => os.map === s.map && Math.hypot(os.world[0] - s.world[0], os.world[1] - s.world[1]) < 80)).length >= 2);
  if (newer) { t.supersededBy = newer.id; log(`  ${t.name} (${t.id}) shares docks with ${newer.name} (${newer.id}); kept as legacy`); }
}
transports.sort((a, b) => a.id - b.id);
log(`  ${transports.length} transports`);

// ---------------------------------------------------------------------------
// 8. NPCs: bankers, auctioneers, flight masters
//
// Two sources, neither of them a website: the vanilla 1.12 spawn table
// (CMaNGOS classic-db) for every service NPC that already existed, with its
// faction template read against the client's FactionTemplate table for who
// it is hostile to; and npcs-observed.json for what Forever adds or moves,
// noted in the game itself. An observed NPC with a vanilla namesake replaces
// its vanilla position.
// ---------------------------------------------------------------------------
const factionTemplates = new Map(T.FactionTemplate.map((f) => [f.ID, f]));
function reactionOf(templateId) {
  const f = factionTemplates.get(String(templateId));
  if (!f) return null;
  const friend = num(f.FriendGroup) | num(f.FactionGroup), enemy = num(f.EnemyGroup);
  const to = (mask) => (enemy & mask ? -1 : friend & mask ? 1 : 0);
  return [to(2), to(4)]; // [Alliance, Horde]: -1 hostile, 1 friendly, 0 neutral
}
const npcs = [];
{
  const gz = path.join(CACHE, "classicdb.sql.gz");
  if (!fs.existsSync(gz)) { log("  downloading classic-db"); fs.writeFileSync(gz, await wago.fetchWithRetry(CLASSICDB_URL)); }
  const sql = zlib.gunzipSync(fs.readFileSync(gz)).toString("latin1");
  const ct = tableColumns(sql, "creature_template"), cr = tableColumns(sql, "creature");
  const FLAG = { flightmaster: 8, banker: 256, auctioneer: 4096 };
  const wanted = new Map();
  for (const r of readInsertRows(sql, "creature_template")) {
    const f = r[ct.indexOf("NpcFlags")];
    const roles = Object.entries(FLAG).filter(([, bit]) => f & bit).map(([k]) => k);
    if (roles.length) wanted.set(String(r[ct.indexOf("Entry")]), { name: r[ct.indexOf("Name")], tag: r[ct.indexOf("SubName")] || null, roles, faction: r[ct.indexOf("Faction")] });
  }
  const spawns = new Map();
  for (const r of readInsertRows(sql, "creature")) {
    const id = String(r[cr.indexOf("id")]);
    if (!wanted.has(id)) continue;
    const at = toFrame(r[cr.indexOf("map")], r[cr.indexOf("position_x")], r[cr.indexOf("position_y")]);
    if (!at) continue;
    if (!spawns.has(id)) spawns.set(id, []);
    spawns.get(id).push(at.map(r2));
  }
  for (const [id, info] of wanted) {
    const vanilla = spawns.get(id);
    if (!vanilla) continue;
    npcs.push({ id: num(id), name: info.name, tag: info.tag, roles: info.roles, react: reactionOf(info.faction), spots: vanilla.map((at) => ({ at })), source: "classic-db" });
  }
  log(`  classic-db: ${npcs.length} service NPCs placed from vanilla spawns`);
}
{
  const observed = JSON.parse(fs.readFileSync(OBSERVED, "utf8")).npcs || [];
  let added = 0, moved = 0;
  for (const o of observed) {
    const at = mapPercentToFrame(o.uiMap, o.x, o.y);
    if (!at) { log(`  observed NPC ${o.name}: map ${o.uiMap} is not on the world map; skipped`); continue; }
    const spot = { at: at.map(r2) };
    const existing = npcs.find((n) => n.name === o.name && (!o.tag || n.tag === o.tag));
    if (existing) { existing.spots = [spot]; existing.source = "observed"; if (o.roles) existing.roles = o.roles; if (o.react) existing.react = o.react; moved++; }
    else { npcs.push({ id: null, name: o.name, tag: o.tag || null, roles: o.roles || [], react: o.react || null, spots: [spot], source: "observed" }); added++; }
  }
  log(`  observed in game: ${added} NPCs added, ${moved} vanilla positions replaced`);
}
for (const n of npcs) {
  for (const s of n.spots) s.zone = zoneOf(s.at);
}
const placed = npcs.filter((n) => n.spots.length);
log(`  ${placed.length} NPCs placed (${npcs.length - placed.length} without a known position: ${npcs.filter((n) => !n.spots.length).map((n) => n.name).join(", ")})`);
function inRect([x0, y0, x1, y1], [x, y]) { return x >= x0 && x <= x1 && y >= y0 && y <= y1; }
function rectArea([x0, y0, x1, y1]) { return (x1 - x0) * (y1 - y0); }
// the zone or city map a frame point lies in: inside an outline if possible, else the smallest map whose bounds hold it
function zoneOf(at) {
  const z = maps.filter((m) => m.kind === "zone" || m.kind === "city").filter((m) => inRect(m.rect, at)).sort((a, b) => rectArea(a.rect) - rectArea(b.rect));
  const inside = z.find((m) => m.outline?.some((ring) => pointInRing(ring, at)));
  return (inside || z[0])?.id || null;
}
function pointInRing(ring, [x, y]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// ---------------------------------------------------------------------------
// 9. Points of interest and instance entrances
// ---------------------------------------------------------------------------
const POI_KIND = { 29: "capital", 5: "town", 4: "landmark", 1: "town", 3: "town", 0: "landmark" };
const pois = [];
for (const p of T.AreaPOI) {
  const kind = POI_KIND[p.Flags];
  if (!kind || !p.Name_lang || /Under Attack|Sandworm/.test(p.Name_lang)) continue;
  const at = toFrame(num(p.ContinentID), num(p.Pos_0), num(p.Pos_1));
  if (!at) continue;
  pois.push({ name: p.Name_lang, kind, at: at.map(r2), map: num(p.ContinentID) });
}
const instances = [];
for (const m of T.Map) {
  if (!["1", "2"].includes(m.InstanceType)) continue;
  if (m.CorpseMapID === "-1" || (m.Corpse_0 === "0" && m.Corpse_1 === "0")) continue;
  const at = toFrame(num(m.CorpseMapID), num(m.Corpse_0), num(m.Corpse_1));
  if (!at) continue;
  instances.push({ id: num(m.ID), name: m.MapName_lang, kind: m.InstanceType === "2" ? "raid" : "dungeon", players: num(m.MaxPlayers) || null, at: at.map(r2) });
}
log(`  ${pois.length} points of interest, ${instances.length} instance entrances`);

// ---------------------------------------------------------------------------
// 10. Zone facts: level bands and territory
// ---------------------------------------------------------------------------
// The level bands the original game printed on its map, plus Forever's new zones.
const LEVELS = {
  14: [1, 10], 215: [1, 10], 141: [1, 10], 12: [1, 10], 1: [1, 10], 85: [1, 10],
  17: [10, 25], 148: [10, 20], 40: [10, 20], 38: [10, 20], 130: [10, 20],
  331: [18, 30], 406: [15, 27], 44: [15, 25], 10: [18, 30], 11: [20, 30], 267: [20, 30],
  400: [25, 35], 405: [30, 40], 15: [35, 45], 36: [30, 40], 45: [30, 40], 33: [30, 45],
  357: [40, 50], 440: [40, 50], 47: [40, 50], 3: [35, 45], 8: [35, 45],
  16: [45, 55], 361: [48, 55], 490: [48, 55], 51: [45, 50], 4: [45, 55], 46: [50, 58],
  1377: [55, 60], 618: [55, 60], 28: [51, 58], 139: [53, 60], 41: [55, 60], 493: [1, 60],
  16591: [36, 44], 16593: [1, 12], 616: [55, 60], 16651: [55, 60],
  1519: [1, 60], 1637: [1, 60], 1537: [1, 60], 1638: [1, 60], 1657: [1, 60], 1497: [1, 60],
};
// whose land it is: the area's faction group in the client (2 Alliance, 4 Horde, neither = contested)
const TERRITORY = { 2: "Alliance", 4: "Horde" };
for (const m of maps) {
  if (m.kind !== "zone" && m.kind !== "city") continue;
  m.levels = LEVELS[m.area] || null;
  if (!m.levels) log(`  no level band for ${m.name} (area ${m.area}); add it to LEVELS`);
  m.territory = TERRITORY[num(areaById.get(String(m.area))?.FactionGroupMask)] || "Contested";
  m.biomes = BIOMES.filter((b) => b.zones.includes(m.area)).map((b) => b.key);
  m.biomeSubzones = BIOMES.flatMap((b) => b.subzones.filter((s) => s.zone === m.area).map((s) => ({ biome: b.key, area: s.area, name: s.name })));
}

// ---------------------------------------------------------------------------
// 11. Write
// ---------------------------------------------------------------------------
const out = {
  build: BUILD,
  generated: new Date().toISOString().slice(0, 10),
  frame: { width: FRAME_W, height: FRAME_H, yardsPerPixel: r2(1 / Object.values(continents)[0].s) },
  continents: Object.fromEntries(Object.entries(continents).map(([k, c]) => [k, { ox: r2(c.ox), oy: r2(c.oy), s: c.s, maxX: c.maxX, maxY: c.maxY, minX: c.minX, minY: c.minY, inset: !!c.inset }])),
  maps: maps.map((m) => ({ id: m.id, name: m.name, kind: m.kind, parent: m.parent, mapId: m.mapId, area: m.area || null, rect: m.rect, img: m.img,
    levels: m.levels || null, territory: m.territory || null, biomes: m.biomes || [], biomeSubzones: m.biomeSubzones || [], note: m.note || null,
    outline: m.outline || null, subzones: m.subzones || null })),
  biomes: BIOMES,
  flightSpeed: FLIGHT_SPEED,
  taxi: { nodes: taxiNodes, routes: taxiRoutes },
  transports,
  npcs: placed.map((n) => ({ id: n.id, name: n.name, tag: n.tag, roles: n.roles, react: n.react, spots: n.spots, source: n.source })),
  pois,
  instances,
};
fs.writeFileSync(path.join(OUT, "world-map.json"), JSON.stringify(out));
log(`wrote ${OUT}/world-map.json (${Math.round(fs.statSync(path.join(OUT, "world-map.json")).size / 1024)} KB)`);
