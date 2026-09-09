// Validates Sand Table encounter files against docs/sand-table/AUTHORING.md.
//   node scripts/validate-sand-table.mjs            # every id in index.js
//   node scripts/validate-sand-table.mjs zulrah cox # just these
// Exits non-zero on any error; warnings are printed but don't fail.

import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { pathToFileURL } from 'node:url';

const DIR = 'public/tools/runescape/data/sand-table';
const GROUPS = new Set(['raid', 'group', 'solo', 'slayer', 'wilderness', 'minigame', 'skilling']);
const STYLES = new Set(['melee', 'ranged', 'magic', 'typeless', 'none']);
const PRAYS = new Set(['melee', 'ranged', 'magic', 'none', null]);
const SHAPES = new Set(['biped', 'giant', 'serpent', 'dragon', 'olm', 'hand', 'quadruped', 'spider', 'rat', 'blob',
  'demon', 'bird', 'golem', 'orb', 'crystal', 'worm', 'skeleton', 'kraken', 'beetle', 'wolf', 'pillar']);
const FLOORS = new Set(['stone', 'sand', 'ice', 'blood', 'cave', 'grass', 'metal', 'swamp', 'dark']);
const FEATURES = new Set(['pillar', 'block', 'pit', 'water', 'lava', 'rock', 'altar', 'portal', 'marker']);
const SLOTS = new Set(['head', 'cape', 'neck', 'ammo', 'weapon', 'body', 'shield', 'legs', 'hands', 'feet', 'ring']);
const SKILLS = new Set(['Attack', 'Defence', 'Strength', 'Hitpoints', 'Ranged', 'Prayer', 'Magic', 'Cooking', 'Woodcutting',
  'Fletching', 'Fishing', 'Firemaking', 'Crafting', 'Smithing', 'Mining', 'Herblore', 'Agility', 'Thieving', 'Slayer',
  'Farming', 'Runecraft', 'Hunter', 'Construction', 'Sailing', 'Combat']);
const EVENTS = new Set(['attack', 'aoe', 'move', 'say', 'msg', 'note', 'phase', 'spawn', 'despawn', 'safe', 'pray', 'hp', 'anim', 'face']);

export function loadIndex() {
  const ctx = { SAND_TABLE: { ids: [] } }; ctx.window = ctx;
  vm.runInNewContext(readFileSync(`${DIR}/index.js`, 'utf8'), ctx);
  return ctx.SAND_TABLE.ids;
}

export function loadEncounter(id) {
  const src = readFileSync(`${DIR}/encounters/${id}.js`, 'utf8');
  let out = null;
  const ctx = { SAND_TABLE: { register(o) { out = o; } } };
  vm.runInNewContext(src, ctx, { filename: `${id}.js` });
  if (!out) throw new Error('file never called SAND_TABLE.register');
  return out;
}

// expands an aoe/safe target into a list of [x,y]
export function areaTiles(ev, w, h) {
  if (ev.tiles) return ev.tiles;
  const a = ev.area || {};
  const out = [];
  const push = (x, y) => { if (x >= 0 && y >= 0 && x < w && y < h) out.push([x, y]); };
  if (a.kind === 'rect') for (let y = a.y; y < a.y + a.h; y++) for (let x = a.x; x < a.x + a.w; x++) push(x, y);
  else if (a.kind === 'square') for (let y = a.y - a.r; y <= a.y + a.r; y++) for (let x = a.x - a.r; x <= a.x + a.r; x++) push(x, y);
  else if (a.kind === 'ring') for (let y = a.y - a.r; y <= a.y + a.r; y++) for (let x = a.x - a.r; x <= a.x + a.r; x++)
    if (Math.max(Math.abs(x - a.x), Math.abs(y - a.y)) === a.r) push(x, y);
  else if (a.kind === 'row') for (let x = 0; x < w; x++) push(x, a.y);
  else if (a.kind === 'col') for (let y = 0; y < h; y++) push(a.x, y);
  else if (a.kind === 'line') {
    const n = Math.max(Math.abs(a.x2 - a.x1), Math.abs(a.y2 - a.y1));
    for (let i = 0; i <= n; i++) push(Math.round(a.x1 + (a.x2 - a.x1) * i / (n || 1)), Math.round(a.y1 + (a.y2 - a.y1) * i / (n || 1)));
  }
  return out;
}

export function validate(e, id) {
  const errors = [], warns = [];
  const err = (m) => errors.push(m), warn = (m) => warns.push(m);
  const str = (v) => typeof v === 'string' && v.trim().length > 0;

  if (e.id !== id) err(`id "${e.id}" ≠ file name "${id}"`);
  if (!str(e.name)) err('name missing');
  if (!GROUPS.has(e.group)) err(`group "${e.group}" not one of ${[...GROUPS].join('|')}`);
  if (!str(e.region)) err('region missing');
  if (!str(e.team)) err('team missing');
  if (!(Number.isInteger(e.difficulty) && e.difficulty >= 1 && e.difficulty <= 5)) err('difficulty must be 1–5');
  if (!str(e.tagline)) err('tagline missing');
  if (e.kc != null && !(str(e.kc) || (Array.isArray(e.kc) && e.kc.every(str)))) err('kc must be a string or array of strings');

  const reqShape = (r, where) => {
    if (r.kind === 'skill') {
      if (!SKILLS.has(r.skill)) err(`${where}: unknown skill "${r.skill}"`);
      if (!(Number.isInteger(r.level) && r.level >= 1 && r.level <= 126)) err(`${where}: bad level`);
    } else if (r.kind === 'quest') { if (!str(r.name)) err(`${where}: quest needs name`); }
    else if (r.kind === 'item') { if (!str(r.item)) err(`${where}: item needs item`); }
    else if (r.kind === 'other') { if (!str(r.text)) err(`${where}: other needs text`); }
    else err(`${where}: kind "${r.kind}"`);
  };
  if (!Array.isArray(e.requirements)) err('requirements must be an array'); else e.requirements.forEach((r, i) => reqShape(r, `requirements[${i}]`));
  if (e.recommended != null) { if (!Array.isArray(e.recommended)) err('recommended must be an array'); else e.recommended.forEach((r, i) => reqShape(r, `recommended[${i}]`)); }

  const sceneIds = new Set((e.scenes || []).map((s) => s.id));
  if (!e.expect) err('expect missing'); else {
    if (!str(e.expect.overview)) err('expect.overview missing');
    if (!Array.isArray(e.expect.mechanics) || e.expect.mechanics.length === 0) err('expect.mechanics must be a non-empty array');
    else e.expect.mechanics.forEach((m, i) => {
      if (!str(m.name)) err(`mechanics[${i}]: name`);
      if (!str(m.cue)) err(`mechanics[${i}] ${m.name}: cue`);
      if (!str(m.response)) err(`mechanics[${i}] ${m.name}: response`);
      if (m.style != null && !STYLES.has(m.style)) err(`mechanics[${i}] ${m.name}: style "${m.style}"`);
      if (m.danger != null && !['low', 'med', 'high'].includes(m.danger)) err(`mechanics[${i}] ${m.name}: danger "${m.danger}"`);
      if (m.scene != null && !sceneIds.has(m.scene)) err(`mechanics[${i}] ${m.name}: scene "${m.scene}" not found`);
    });
    (e.expect.phases || []).forEach((p, i) => { if (!str(p.name) || !str(p.text)) err(`phases[${i}] needs name and text`); });
  }

  if (!e.bring) err('bring missing'); else {
    if (!Array.isArray(e.bring.setups) || e.bring.setups.length === 0) err('bring.setups must be a non-empty array');
    else e.bring.setups.forEach((s, i) => {
      if (!str(s.name)) err(`setups[${i}]: name`);
      if (!['melee', 'ranged', 'magic', 'hybrid'].includes(s.style)) err(`setups[${i}] ${s.name}: style "${s.style}"`);
      for (const k of Object.keys(s.worn || {})) { if (!SLOTS.has(k)) err(`setups[${i}] ${s.name}: worn slot "${k}"`); if (!str(s.worn[k])) err(`setups[${i}] ${s.name}: worn.${k} empty`); }
      if (!Array.isArray(s.inventory)) err(`setups[${i}] ${s.name}: inventory must be an array`);
      else {
        let n = 0;
        s.inventory.forEach((it, j) => { if (!str(it.item)) err(`setups[${i}] ${s.name}: inventory[${j}] item`); n += Math.max(1, it.qty | 0); });
        if (n > 28) err(`setups[${i}] ${s.name}: inventory holds ${n} items (max 28)`);
        if (n === 0) warn(`setups[${i}] ${s.name}: empty inventory`);
      }
    });
    (e.bring.musts || []).forEach((m, i) => { if (!str(m.item)) err(`musts[${i}]: item`); });
  }

  if (!(Array.isArray(e.route) ? e.route.every(str) : str(e.route))) err('route must be a string or array of strings');
  if (!e.loot || !Array.isArray(e.loot.uniques)) err('loot.uniques must be an array');
  if (!e.wiki || !str(e.wiki.page)) err('wiki.page missing');
  if (!e.wiki || !Array.isArray(e.wiki.monsters) || e.wiki.monsters.length === 0) err('wiki.monsters must be a non-empty array');
  else e.wiki.monsters.forEach((m, i) => { if (!str(m.page)) err(`wiki.monsters[${i}]: page`); });

  if (!Array.isArray(e.scenes) || e.scenes.length === 0) warn('no scenes — the app will synthesise a generic rotation from expect.mechanics');
  else e.scenes.forEach((s) => validateScene(s, err, warn));

  return { errors, warns };
}

function validateScene(s, err, warn) {
  const P = `scene "${s.id}"`;
  if (!s.id) return err('scene without id');
  if (!s.name) err(`${P}: name`);
  const a = s.arena || {};
  const w = a.w | 0, h = a.h | 0;
  if (!(w >= 4 && h >= 4 && w <= 64 && h <= 64)) err(`${P}: arena ${w}×${h} must be 4–64 a side`);
  if (a.floor != null && !FLOORS.has(a.floor)) err(`${P}: floor "${a.floor}"`);
  const inside = (x, y) => Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < w && y < h;
  (a.features || []).forEach((f, i) => {
    if (!FEATURES.has(f.kind)) err(`${P}: feature[${i}] kind "${f.kind}"`);
    const fw = f.w || 1, fh = f.h || 1;
    if (!inside(f.x, f.y) || !inside(f.x + fw - 1, f.y + fh - 1)) err(`${P}: feature[${i}] ${f.kind} at ${f.x},${f.y} (${fw}×${fh}) leaves the arena`);
  });
  const actors = new Map();
  const addActor = (ac, where) => {
    if (!ac.id) return err(`${P}: ${where} actor without id`);
    if (actors.has(ac.id)) err(`${P}: duplicate actor id "${ac.id}" (${where})`);
    actors.set(ac.id, ac);
    if (!SHAPES.has(ac.shape)) err(`${P}: actor ${ac.id} shape "${ac.shape}"`);
    if (!['boss', 'add', 'npc', 'team'].includes(ac.kind)) err(`${P}: actor ${ac.id} kind "${ac.kind}"`);
    const n = ac.size || 1;
    if (!inside(ac.x, ac.y) || !inside(ac.x + n - 1, ac.y + n - 1)) err(`${P}: actor ${ac.id} (size ${n}) at ${ac.x},${ac.y} leaves the arena`);
  };
  (s.actors || []).forEach((ac) => addActor(ac, 'initial'));
  if (!s.player || !inside(s.player.x, s.player.y)) err(`${P}: player start tile missing or outside the arena`);
  if (!(Number.isInteger(s.length) && s.length >= 4 && s.length <= 600)) err(`${P}: length must be 4–600 ticks`);
  const script = s.script || [];
  if (!Array.isArray(script) || script.length === 0) return err(`${P}: script empty`);

  // reenactment walk-through: where the guide's player stands each tick, and when dangers land
  let px = s.player?.x, py = s.player?.y;
  const pos = []; // pos[t] = [x,y] at the *end* of tick t
  let lastT = -1, notesEarly = false, walk = null;
  const dangers = []; // {t, tiles, label}
  for (let i = 0; i < script.length; i++) {
    const ev = script[i];
    const Q = `${P} script[${i}] (${ev.type}@${ev.t})`;
    if (!Number.isInteger(ev.t) || ev.t < 0 || ev.t > s.length) err(`${Q}: t out of 0…${s.length}`);
    if (ev.t < lastT) err(`${Q}: script not sorted by t`);
    lastT = Math.max(lastT, ev.t | 0);
    if (!EVENTS.has(ev.type)) { err(`${Q}: unknown type`); continue; }
    switch (ev.type) {
      case 'attack':
        if (!actors.has(ev.from)) err(`${Q}: from "${ev.from}" is not an actor`);
        if (!STYLES.has(ev.style)) err(`${Q}: style "${ev.style}"`);
        if (!(Number.isInteger(ev.max) && ev.max >= 0)) err(`${Q}: max`);
        if (!(Number.isInteger(ev.hit) && ev.hit >= 0 && ev.hit <= 10)) err(`${Q}: hit (ticks until it lands) 0–10`);
        if (!ev.label) err(`${Q}: label`);
        if ('pray' in ev && !PRAYS.has(ev.pray)) err(`${Q}: pray "${ev.pray}"`);
        if (ev.t + (ev.hit | 0) > s.length) warn(`${Q}: lands after the scene ends`);
        break;
      case 'aoe': case 'safe': {
        if (!ev.label) err(`${Q}: label`);
        if (!ev.tiles && !ev.area) err(`${Q}: needs tiles or area`);
        const tiles = areaTiles(ev, w, h);
        if (tiles.length === 0) err(`${Q}: covers no tiles`);
        tiles.forEach(([x, y]) => { if (!inside(x, y)) err(`${Q}: tile ${x},${y} outside the arena`); });
        if (ev.type === 'aoe') {
          if (!(Number.isInteger(ev.warn) && ev.warn >= 1 && ev.warn <= 20)) err(`${Q}: warn 1–20`);
          if (!(Number.isInteger(ev.max) && ev.max >= 0)) err(`${Q}: max`);
          dangers.push({ t: ev.t + (ev.warn | 0), tiles, label: ev.label });
        } else if (!(Number.isInteger(ev.dur) && ev.dur >= 1)) err(`${Q}: dur`);
        break;
      }
      case 'move':
        if (!Array.isArray(ev.to) || !inside(ev.to[0], ev.to[1])) err(`${Q}: to`);
        if (ev.actor !== 'player' && !actors.has(ev.actor)) err(`${Q}: actor "${ev.actor}" unknown`);
        if (ev.actor === 'player' && Array.isArray(ev.to)) {
          const dist = Math.max(Math.abs(ev.to[0] - px), Math.abs(ev.to[1] - py));
          const ticks = ev.ticks || Math.max(1, Math.ceil(dist / 2));
          walk = { from: [px, py], to: ev.to, t0: ev.t, t1: ev.t + ticks };
          [px, py] = ev.to;
          for (let t = ev.t; t < ev.t + ticks && t <= s.length; t++) {
            const k = (t - ev.t + 1) / ticks;
            pos[t] = [Math.round(walk.from[0] + (ev.to[0] - walk.from[0]) * k), Math.round(walk.from[1] + (ev.to[1] - walk.from[1]) * k)];
          }
        }
        break;
      case 'say': if (!actors.has(ev.actor) && ev.actor !== 'player') err(`${Q}: actor`); if (!ev.text) err(`${Q}: text`); break;
      case 'msg': case 'note': if (!ev.text) err(`${Q}: text`); if (ev.type === 'note' && ev.t <= 3) notesEarly = true; break;
      case 'phase': if (!ev.name) err(`${Q}: name`); break;
      case 'spawn': if (!ev.actor || typeof ev.actor !== 'object') err(`${Q}: actor object`); else addActor(ev.actor, `spawn@${ev.t}`); break;
      case 'despawn': if (!actors.has(ev.actor)) err(`${Q}: actor "${ev.actor}" unknown`); break;
      case 'pray': if (!PRAYS.has(ev.pray) || ev.pray === null) err(`${Q}: pray`); break;
      case 'hp': if (!actors.has(ev.actor)) err(`${Q}: actor`); if (!(ev.pct >= 0 && ev.pct <= 100)) err(`${Q}: pct 0–100`); break;
      case 'anim': if (!actors.has(ev.actor)) err(`${Q}: actor`); if (!['slam', 'rise', 'sink', 'spin', 'die', 'shield', 'flash'].includes(ev.kind)) err(`${Q}: kind`); break;
      case 'face': if (!actors.has(ev.actor)) err(`${Q}: actor`); if (!['n', 'e', 's', 'w', 'player'].includes(ev.dir)) err(`${Q}: dir`); break;
    }
  }
  if (!notesEarly) err(`${P}: needs a note in its first 3 ticks saying what the scene shows`);
  // fill the player's position per tick and check every danger
  let cur = [s.player?.x, s.player?.y];
  for (let t = 0; t <= s.length; t++) { if (pos[t]) cur = pos[t]; pos[t] = cur; }
  for (const d of dangers) {
    if (d.t > s.length) continue;
    const [x, y] = pos[d.t];
    if (d.tiles.some(([tx, ty]) => tx === x && ty === y)) err(`${P}: the guide's player stands on "${d.label}" when it lands at t=${d.t} (tile ${x},${y}) — add a move that dodges it`);
  }
  const notes = script.filter((ev) => ev.type === 'note').length;
  if (notes < 3) warn(`${P}: only ${notes} note(s) — narrate more`);
}

// the CLI: only when run directly (fetch-boss-data.mjs imports the helpers above)
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
function main() {
// CLI only when run directly — fetch-boss-data.mjs imports the loaders above
const ids = process.argv.slice(2).length ? process.argv.slice(2) : loadIndex();
let failed = 0;
for (const id of ids) {
  let e;
  try { e = loadEncounter(id); } catch (x) { console.log(`✗ ${id}: ${x.message}`); failed++; continue; }
  const { errors, warns } = validate(e, id);
  const scenes = (e.scenes || []).length;
  console.log(`${errors.length ? '✗' : '✓'} ${id} — ${e.name} (${(e.expect?.mechanics || []).length} mechanics, ${scenes} scene${scenes === 1 ? '' : 's'})`);
  for (const m of errors) console.log(`    error: ${m}`);
  for (const m of warns) console.log(`    warn:  ${m}`);
  if (errors.length) failed++;
}
if (failed) { console.log(`\n${failed} file(s) failed`); process.exit(1); }
}
