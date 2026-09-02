// Ship parts and boat combat — what the planner needs to draw a captain's
// ship and judge what the sea can do to it. Scraped from the OSRS Wiki:
//
//   boats   raft / skiff / sloop: Sailing level, facility hotspots, crew
//   parts   the tier tables of the four core boat parts and the cargo hold,
//           per boat type where the wiki lists them apart:
//             hull  Sailing, Construction, speed (tiles/tick), hitpoints, defence
//             keel  Sailing, Construction, hitpoints, armour (rafts have none)
//             helm  Sailing, Construction, rapids tier, kelp resistance
//             mast  Sailing, Construction, storm resistance, boost, acceleration
//             hold  Sailing, Construction, crate capacity per boat type
//   combat  per sea monster: max hit against a boat, attack speed (ticks),
//           attack style and the level it rolls with, hitpoints
//
// Boat combat rules the app leans on (Boat combat, Keel, Flat armour pages):
// a boat's armour grants one flat armour per 100 points, subtracted from
// every successful hit, so a monster whose max hit is at or below that can
// never dent the boat; the hull sets the defence level rolled against the
// monster's attack; the boat's health is hull hitpoints plus keel hitpoints.
//
// Shared by fetch-naval-data.mjs (full rebuild) and fetch-ship-data.mjs
// (quick refresh of just these blocks).

const stripWiki = s => (s || '')
  .replace(/\{\{(?:Yes|No|Maybe)\|([^}]*)\}\}/gi, '$1')
  .replace(/\{\{[^{}]*\}\}/g, '')
  .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1')
  .replace(/<[^>]+>/g, ' ')
  .replace(/'{2,}/g, '')
  .replace(/\s+/g, ' ').trim();

const num = s => {
  const m = String(s ?? '').replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  return m ? +m[0] : null;
};

// ---- wikitext helpers ------------------------------------------------------

// the body of the first heading matching `title` (any level), up to the next
// heading of the same or a higher level
function section(wt, title) {
  const re = new RegExp(`^(=+)\\s*${title}\\s*\\1\\s*$`, 'im');
  const m = re.exec(wt);
  if (!m) return null;
  const level = m[1].length;
  const rest = wt.slice(m.index + m[0].length);
  const end = rest.search(new RegExp(`^={1,${level}}[^=\\n][^\\n]*?={1,${level}}\\s*$`, 'm'));
  return end < 0 ? rest : rest.slice(0, end);
}

// the first wikitable in `src` as rows of raw cell strings, header rows
// dropped. Handles '|-' row breaks, '|' and '||' cells, '!' header cells,
// cell attributes ('| colspan=2 | x') and cells that spill onto following
// lines — the wiki wraps long materials lists that way.
function parseTable(src) {
  const start = src.indexOf('{|');
  if (start < 0) return [];
  const rows = [];
  let row = null, header = false;
  const flush = () => { if (row && row.length && !header) rows.push(row); row = []; header = false; };
  for (const raw of src.slice(start).split('\n').slice(1)) {
    const l = raw.trim();
    if (l.startsWith('|}')) break;
    if (l.startsWith('|-')) { flush(); continue; }
    if (l.startsWith('!')) { header = true; continue; }
    if (l.startsWith('|')) {
      if (!row) row = [];
      for (let c of l.slice(1).split('||')) {
        c = c.trim();
        // strip a leading attribute segment: colspan=2 | value
        const a = c.match(/^[a-z]+\s*=\s*"?[^"|{[]*"?\s*\|(.*)$/i);
        row.push(a ? a[1].trim() : c);
      }
      continue;
    }
    if (row && row.length && l) row[row.length - 1] += ' ' + l;
  }
  flush();
  return rows;
}

// every wikitable in a section, in order
function tables(src) {
  const out = [];
  let rest = src || '';
  for (;;) {
    const i = rest.indexOf('{|');
    if (i < 0) break;
    const j = rest.indexOf('\n|}', i);
    const chunk = j < 0 ? rest.slice(i) : rest.slice(i, j + 3);
    out.push(parseTable(chunk));
    if (j < 0) break;
    rest = rest.slice(j + 3);
  }
  return out;
}

// the wiki page an item-link cell points at, and its display text
function linkCell(cell) {
  const t = cell.match(/\{\{(?:p|i)linkt?\|([^|#}]+)(?:#[^|}]*)?(?:\|[^}]*?txt=([^|}]+))?/i);
  if (t) return { page: t[1].trim(), text: (t[2] || t[1]).trim() };
  const l = cell.match(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/);
  if (l) return { page: l[1].trim(), text: (l[2] || l[1]).trim() };
  return { page: stripWiki(cell), text: stripWiki(cell) };
}
const tierOf = page => page.split(/\s+/)[0];

// {{Infobox Custom}} value whose key label matches
function infoboxValue(wt, label) {
  const k = new RegExp(`\\|\\s*key(\\d+)\\s*=\\s*[^\\n]*${label}[^\\n]*`, 'i').exec(wt || '');
  if (!k) return null;
  const v = new RegExp(`\\|\\s*value${k[1]}\\s*=\\s*([^\\n]*)`, 'i').exec(wt);
  return v ? v[1] : null;
}

// ---- boats -----------------------------------------------------------------

const BOATS = [
  { key: 'raft', name: 'Raft', sailing: 1, hotspots: 1, crew: 0, keel: false, cost: 1000 },
  { key: 'skiff', name: 'Skiff', sailing: 15, hotspots: 7, crew: 2, keel: true, cost: 15000 },
  { key: 'sloop', name: 'Sloop', sailing: 50, hotspots: 11, crew: 5, keel: true, cost: 200000 },
];
const HULL_SECTIONS = { raft: 'Raft bases', skiff: 'Skiff hulls', sloop: 'Sloop hulls' };
const KEEL_SECTIONS = { skiff: 'Skiff keels', sloop: 'Sloop keels' };
const HELM_SECTIONS = { raft: 'Raft helms', skiff: 'Skiff helms', sloop: 'Sloop helms' };
const MAST_SECTIONS = { raft: 'Raft masts and sails', skiff: 'Skiff masts and sails', sloop: 'Sloop masts and sails' };

/**
 * @param {(title: string) => Promise<string|null>} pageWikitext
 * @param {(msg: string) => void} [log]
 */
export async function scrapeShipParts(pageWikitext, log = console.log) {
  const warn = m => log(`  [warn] ${m}`);

  // boats: the infobox on each boat's page, with the known values as a net
  const boats = [];
  for (const b of BOATS) {
    const wt = await pageWikitext(b.name);
    const pick = (label, dflt) => { const v = num(infoboxValue(wt, label)); return v ?? dflt; };
    boats.push({
      key: b.key, name: b.name, keel: b.keel,
      sailing: pick('\\[\\[Sailing\\]\\] level', b.sailing),
      hotspots: pick('hotspot', b.hotspots),
      crew: pick('Crew slots', b.crew),
      cost: pick('Cost', b.cost),
    });
  }

  const parts = { hull: {}, keel: {}, helm: {}, mast: {}, hold: [] };

  // hulls: Sailing | Construction | hull | materials | Construction xp | speed | hitpoints | defence | cost | fee
  {
    const wt = await pageWikitext('Hull');
    if (!wt) throw new Error('Hull page missing');
    for (const [boat, title] of Object.entries(HULL_SECTIONS)) {
      const rows = parseTable(section(wt, title) || '');
      parts.hull[boat] = rows.filter(r => r.length >= 8).map(r => {
        const { page, text } = linkCell(r[2]);
        return { tier: tierOf(page), name: text, sailing: num(r[0]), construction: num(r[1]),
          speed: num(r[5]), hp: num(r[6]), defence: num(r[7]) };
      });
      if (parts.hull[boat].length !== 7) warn(`${boat} hulls: parsed ${parts.hull[boat].length} tiers, expected 7`);
    }
  }

  // keels: Sailing | Construction | keel | materials | max hp | armour | Construction xp | cost | fee
  {
    const wt = await pageWikitext('Keel');
    if (!wt) throw new Error('Keel page missing');
    for (const [boat, title] of Object.entries(KEEL_SECTIONS)) {
      const rows = parseTable(section(wt, title) || '');
      parts.keel[boat] = rows.filter(r => r.length >= 6).map(r => {
        const { page, text } = linkCell(r[2]);
        return { tier: tierOf(page), name: text, sailing: num(r[0]), construction: num(r[1]),
          hp: num(r[4]), armour: num(r[5]) };
      });
      if (parts.keel[boat].length !== 7) warn(`${boat} keels: parsed ${parts.keel[boat].length} tiers, expected 7`);
    }
  }

  // helms: per boat Sailing | Construction | helm | materials | Construction xp | cost | rapids | fee;
  // rapids tier and kelp resistance are the same for every boat (stats template)
  {
    const wt = await pageWikitext('Helm');
    if (!wt) throw new Error('Helm page missing');
    const stats = new Map();
    const tpl = await pageWikitext('Template:Boat Helm Stats');
    for (const r of parseTable(tpl || '')) {
      if (r.length < 6) continue;
      const { page } = linkCell(r[0]);
      stats.set(tierOf(page), { rapids: num(r[3]) ?? 0, kelp: /\{\{yes/i.test(r[5]) });
    }
    if (!stats.size) warn('helm stats template not parsed; kelp resistance falls back to adamant and better');
    const METALS = ['Bronze', 'Iron', 'Steel', 'Mithril', 'Adamant', 'Rune', 'Dragon'];
    for (const [boat, title] of Object.entries(HELM_SECTIONS)) {
      const rows = parseTable(section(wt, title) || '');
      parts.helm[boat] = rows.filter(r => r.length >= 7).map(r => {
        const { page, text } = linkCell(r[2]);
        const tier = tierOf(page);
        const st = stats.get(tier) || { rapids: Math.max(0, METALS.indexOf(tier) - 1), kelp: METALS.indexOf(tier) >= 4 };
        return { tier, name: text, sailing: num(r[0]), construction: num(r[1]),
          rapids: stripWiki(r[6]), rapidsTier: st.rapids, kelp: st.kelp };
      });
      if (parts.helm[boat].length !== 7) warn(`${boat} helms: parsed ${parts.helm[boat].length} tiers, expected 7`);
    }
  }

  // masts and sails: Sailing | Construction | mast | materials | trim xp | storm | boost | acceleration | Construction xp | cost | fee
  {
    const wt = await pageWikitext('Mast and sails');
    if (!wt) throw new Error('Mast and sails page missing');
    for (const [boat, title] of Object.entries(MAST_SECTIONS)) {
      const rows = parseTable(section(wt, title) || '');
      parts.mast[boat] = rows.filter(r => r.length >= 9).map(r => {
        const { page, text } = linkCell(r[2]);
        return { tier: tierOf(page), name: text, sailing: num(r[0]), construction: num(r[1]),
          storm: stripWiki(r[5]).toLowerCase() || 'none', boost: num(r[6]), accel: num(r[7]) };
      });
      if (parts.mast[boat].length !== 7) warn(`${boat} masts: parsed ${parts.mast[boat].length} tiers, expected 7`);
    }
  }

  // cargo holds: Tiers (levels) and Capacity limits (crates per boat type)
  {
    const wt = await pageWikitext('Cargo hold');
    if (!wt) warn('Cargo hold page missing');
    const lv = new Map();
    for (const r of parseTable(section(wt || '', 'Tiers') || '')) {
      if (r.length < 3) continue;
      const { page } = linkCell(r[0]);
      lv.set(tierOf(page), { item: page, sailing: num(r[1]), construction: num(r[2]) });
    }
    const capSec = section(wt || '', 'Capacity limits') || '';
    const sizes = [...capSec.matchAll(/!\s*\[\[([A-Za-z]+)\]\]/g)].map(m => m[1].toLowerCase());
    for (const r of parseTable(capSec)) {
      if (r.length < 4) continue;
      const { page, text } = linkCell(r[0]);
      const tier = text.split(/\s+/)[0];
      const l = lv.get(tier) || lv.get(tierOf(page)) || {};
      const caps = r.slice(1).map(num);
      const capacity = {};
      boats.forEach((b, i) => { capacity[b.key] = caps[sizes.indexOf(b.key)] ?? caps[i] ?? null; });
      parts.hold.push({ tier, name: page, sailing: l.sailing ?? 1, construction: l.construction ?? 1, capacity });
    }
    if (parts.hold.length !== 7) warn(`cargo holds: parsed ${parts.hold.length} tiers, expected 7`);
  }

  // sanity: levels never fall as tiers rise
  for (const [part, byBoat] of Object.entries(parts)) {
    const lists = Array.isArray(byBoat) ? { all: byBoat } : byBoat;
    for (const [boat, list] of Object.entries(lists))
      for (let i = 1; i < list.length; i++)
        if (list[i].sailing < list[i - 1].sailing) warn(`${boat} ${part}: ${list[i].tier} needs less Sailing than ${list[i - 1].tier}`);
  }

  log(`ship parts: ${boats.length} boats, ` + Object.entries(parts).map(([k, v]) =>
    `${k} ${Array.isArray(v) ? v.length : Object.values(v).map(l => l.length).join('/')}`).join(', '));
  return {
    boats, parts,
    armourPerFlat: 100,   // one flat armour (damage shaved off every hit) per 100 armour
    facilities: {
      fetid: { name: 'Inoculation station', sailing: 40, construction: 37, hazard: 'fetid' },
      icy: { name: 'Eternal brazier', sailing: 78, construction: 72, hazard: 'icy' },
    },
  };
}

// ---- boat combat -----------------------------------------------------------

// the Boat combat page's monster table: hitpoints, max hit against a boat
// with no keel and with each keel tier, aggression. Keyed by page title.
export async function scrapeBoatCombat(pageWikitext, log = console.log) {
  const out = new Map();
  const wt = await pageWikitext('Boat combat');
  if (!wt) { log('  [warn] Boat combat page missing'); return out; }
  const rows = parseTable(section(wt, 'Monsters') || '');
  for (const r of rows) {
    if (r.length < 11) continue;
    const { page } = linkCell(r[0]);
    const maxHits = r.slice(2, 10).map(num);
    if (maxHits.some(v => v == null)) continue;
    out.set(page, { hp: num(r[1]), maxHit: maxHits[0], maxHitByKeel: maxHits.slice(1),
      aggressive: /^yes/i.test(stripWiki(r[10])) });
  }
  log(`boat combat: ${out.size} monsters`);
  return out;
}

// combat stats from a monster page's infobox (the highest max hit across its
// variants, the first attack speed and style, the level it attacks with), the
// Boat combat table's ship-facing max hit taking precedence when it exists
export function monsterCombatStats(wt, combatRow, log = console.log) {
  const field = k => [...(wt || '').matchAll(new RegExp(`\\|\\s*${k}\\d*\\s*=\\s*([^\\n|]*)`, 'gi'))]
    .map(m => m[1].trim()).filter(Boolean);
  const nums = k => field(k).map(num).filter(v => v != null);
  const infoMax = nums('max hit');
  const style = (stripWiki(field('attack style')[0] || '').split(/[,/]/)[0] || '').trim().toLowerCase() || null;
  const att = nums('att')[0] ?? null, mage = nums('mage')[0] ?? null, range = nums('range')[0] ?? null;
  const attack = style === 'magic' ? mage : style === 'ranged' ? range : att;
  const maxHit = combatRow?.maxHit ?? (infoMax.length ? Math.max(...infoMax) : null);
  if (combatRow && infoMax.length && !infoMax.includes(combatRow.maxHit))
    log(`  [note] max hit against boats ${combatRow.maxHit} differs from the infobox (${infoMax.join('/')})`);
  return {
    maxHit,
    speed: nums('attack speed')[0] ?? null,      // ticks between attacks
    style,
    attack: attack ?? null,                      // level rolled for accuracy
    hp: combatRow?.hp ?? nums('hitpoints')[0] ?? null,
  };
}
