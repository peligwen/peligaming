// Courier (port) tasks — the wiki's per-board task pool, plus the few
// numbers the planner needs to price a task: task-slot unlocks, coin-bag
// tiers, and cargo-hold capacities. Shared by fetch-naval-data.mjs (full
// rebuild) and fetch-courier-tasks.mjs (quick refresh of just this block).
//
// Every standard task on the wiki's "Courier tasks" page is one
// {{CourierTaskLine}} transclusion carrying: Sailing level, base XP, the
// notice board it is posted on, where the cargo is collected, where it is
// delivered, the crate item, and how many crates. Two shapes exist:
//   A>B    board == cargo location: collect here, deliver there
//   A>B>A  board == destination:    sail to the cargo, bring it back here
// (the wiki's XP already reflects the doubled distance of the round trip).

const stripWiki = s => (s || '')
  .replace(/\{\{[^{}]*\}\}/g, '')
  .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&ndash;|&mdash;/g, '–')
  .replace(/'{2,}/g, '')
  .replace(/\s+/g, ' ').trim();

const num = s => +String(s).replace(/[^\d.]/g, '');

// Tasks the community has confirmed always sit on their board regardless of
// the roll (Guide:Sailing cargo port tasks). Keyed by the in-game task name;
// a name that no longer matches a scraped row is reported, not silently lost.
const STATIC_TASKS = [
  'Lunar Isle fur delivery (Port Roberts)',
  'Lunar Isle fish delivery (Port Piscarilius)',
  'Lunar Isle logs delivery',
  'Lunar Isle crystal seed delivery',
];

/**
 * @param {(title: string) => Promise<string|null>} pageWikitext
 * @param {Set<string>|string[]} portNames  mooring-point names from the ports scrape
 * @param {(msg: string) => void} [log]
 */
export async function scrapeCourier(pageWikitext, portNames, log = console.log) {
  const known = new Set(portNames);
  const warn = m => log(`  [warn] ${m}`);

  // ---- the task pool
  const wt = await pageWikitext('Courier tasks');
  if (!wt) throw new Error('Courier tasks page missing');
  const tasks = [];
  for (const m of wt.matchAll(/\{\{CourierTaskLine\|([^{}]*)\}\}/g)) {
    const kv = Object.fromEntries(m[1].split('|').map(s => {
      const i = s.indexOf('=');
      return i < 0 ? [s.trim(), ''] : [s.slice(0, i).trim(), s.slice(i + 1).trim()];
    }));
    const t = {
      id: +kv.taskId,
      name: stripWiki(kv.transcript),
      level: +kv.level || 1,
      xp: +kv.xp || 0,
      board: stripWiki(kv.noticeBoard),
      cargo: stripWiki(kv.cargoLocation),
      dest: stripWiki(kv.destination),
      item: stripWiki(kv.item).replace(/^Crate of /i, ''),
      qty: +kv.qty || 1,
    };
    for (const k of ['board', 'cargo', 'dest'])
      if (!known.has(t[k])) warn(`task #${t.id} ${k} "${t[k]}" is not a known mooring point`);
    if (t.board !== t.cargo && t.board !== t.dest)
      warn(`task #${t.id} "${t.name}" is neither A>B nor A>B>A`);
    if (t.cargo === t.dest) warn(`task #${t.id} "${t.name}" delivers to its own origin`);
    if (!t.xp) warn(`task #${t.id} "${t.name}" lists no XP`);
    tasks.push(t);
  }
  tasks.sort((a, b) => a.level - b.level || a.board.localeCompare(b.board) || a.id - b.id);
  const ids = new Set(tasks.map(t => t.id));
  if (ids.size !== tasks.length) warn('duplicate task ids in the wiki table');

  for (const name of STATIC_TASKS) {
    const t = tasks.find(t => t.name === name);
    if (t) t.static = true; else warn(`static task not found in table: "${name}"`);
  }

  // ---- bounty tasks: the other half of every board's pool. One per board is
  // always up (the wiki's guaranteed flag); the rest roll like courier tasks
  // do. The courier planner only needs how many notices they fill and which
  // one is fixed, but the rows are kept whole for anything that wants them.
  const bounty = [];
  {
    const bw = await pageWikitext('Bounty tasks');
    if (!bw) warn('Bounty tasks page missing — boards will be modelled as courier-only');
    for (const m of (bw || '').matchAll(/\{\{BountyTaskLine\|([^{}]*)\}\}/g)) {
      const kv = Object.fromEntries(m[1].split('|').map(s => {
        const i = s.indexOf('=');
        return i < 0 ? [s.trim(), ''] : [s.slice(0, i).trim(), s.slice(i + 1).trim()];
      }));
      const monster = stripWiki(kv.monster).replace(/ \((monster|sea|Sailing)\)/i, '');
      bounty.push({
        id: +kv.taskId,
        name: stripWiki(kv.transcript) || `${monster} bounty (${stripWiki(kv.item).toLowerCase()})`,
        level: +kv.level || 30,
        xp: +kv.xp || 0,
        board: stripWiki(kv.noticeBoard),
        monster,
        item: stripWiki(kv.item),
        qty: +kv.qty || 1,
        guaranteed: /^yes$/i.test(kv.guaranteed || ''),
      });
    }
    bounty.sort((a, b) => a.level - b.level || a.board.localeCompare(b.board) || a.id - b.id);
    for (const b of bounty) if (!known.has(b.board)) warn(`bounty #${b.id} board "${b.board}" is not a known mooring point`);
    for (const bd of new Set(tasks.map(t => t.board))) {
      const g = bounty.filter(b => b.board === bd && b.guaranteed).length;
      if (g !== 1) warn(`board ${bd}: ${g} guaranteed bounty tasks (the wiki says every board has one)`);
    }
    log(`bounty tasks: ${bounty.length} on ${new Set(bounty.map(b => b.board)).size} boards (${bounty.filter(b => b.guaranteed).length} guaranteed)`);
  }

  // ---- task slots by level: the first wikitable on the page (Level | Tasks)
  const slots = [];
  const slotTable = wt.split('==Notes==')[0].match(/\{\|[\s\S]*?\|\}/)?.[0] ?? '';
  for (const r of slotTable.matchAll(/\n\|\s*(\d+)\s*\|\|\s*(\d+)/g)) slots.push([+r[1], +r[2]]);
  if (!slots.length) { warn('task-slot table not found; using known unlocks'); slots.push([1, 1], [7, 2], [28, 3], [56, 4], [84, 5]); }

  // ---- coin bags: tier by base XP, coins per bag (4/5 of completions;
  // the other 1/5 is a port-specific reward bag of supplies)
  const bags = [];
  {
    const cw = await pageWikitext('Port coin bag');
    for (const r of (cw || '').matchAll(/\{\{plinkt\|(\w+) port coin bag\}\}\s*\|\|\s*([\d,]+)\s*(?:&ndash;|–|-)\s*([\d,]+)\s*\|\|\s*([\d,]+)/g))
      bags.push({ tier: r[1], coins: [num(r[2]), num(r[3])], minXp: num(r[4]) });
    bags.sort((a, b) => a.minXp - b.minXp);
    if (bags.length !== 5) warn(`expected 5 coin-bag tiers, parsed ${bags.length}`);
    const chance = cw?.match(/(\d)\/(\d) chance to receive a coin bag/);
    var coinChance = chance ? +chance[1] / +chance[2] : 0.8;
  }

  // ---- cargo holds: crate capacity by hold material × boat size
  const holds = { sizes: [], rows: [] };
  {
    const hw = await pageWikitext('Cargo hold');
    const sec = hw?.split('==Capacity limits==')[1]?.split(/\n==/)[0] ?? '';
    holds.sizes = [...sec.matchAll(/!\s*\[\[([A-Za-z]+)\]\]/g)].map(m => m[1]);
    for (const r of sec.matchAll(/\{\{ilinkt\|([^|}]+)\|txt=([^}]+)\}\}\s*\|\|\s*([\d\s|]+)/g)) {
      const caps = r[3].split('||').map(num).filter(n => n > 0);
      holds.rows.push({ name: r[2].trim(), item: r[1].trim(), level: null, capacity: caps });
    }
    if (!holds.rows.length) warn('cargo hold capacity table not found');
  }

  log(`courier tasks: ${tasks.length} on ${new Set(tasks.map(t => t.board)).size} boards ` +
    `(${tasks.filter(t => t.board !== t.cargo).length} round trips, ${tasks.filter(t => t.static).length} static)`);
  return {
    slots, bags, coinChance, rewardBagChance: +(1 - coinChance).toFixed(2), holds,
    boardReset: 'Boards reroll for everyone at 00:00 UTC and for you after every 8 tasks completed; what each board shows is a random draw from its pool.',
    // what a board shows at once: eight notices — the guaranteed bounty, any
    // static courier task, and a random draw from the rest of the pool,
    // courier and bounty alike, locked ones included (the roll pays your
    // level no heed). Observed in play; the wiki gives the pools, not the count.
    board: {
      shows: 8,
      note: 'A board shows 8 notices: its guaranteed bounty task, its static courier tasks, and a random draw from the rest of its pool (courier and bounty alike, locked ones included).',
    },
    tasks,
    bounty,
  };
}
