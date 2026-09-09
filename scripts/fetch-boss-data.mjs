// Pulls the Sand Table's wiki-derived data: every monster's infobox stats
// (combat level, hitpoints, max hits, attack speed, defences, immunities),
// an inventory icon for every item the encounter files name, and a portrait
// of every encounter's main monster (120px) — all from the OSRS Wiki's API, into
//   public/tools/runescape/data/sand-table/wiki.json       (stats + icons)
//   public/tools/runescape/data/sand-table/portraits/*.png (one per encounter)
// Run after adding or editing encounters: `npm run data:bosses`.
// Downloads are cached in .sand-table-cache/ so re-runs only fetch what's new.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { loadIndex, loadEncounter } from './validate-sand-table.mjs';

const API = 'https://oldschool.runescape.wiki/api.php';
const UA = 'peligaming sand-table data fetch (github.com/peligwen/peligaming)';
const DIR = 'public/tools/runescape/data/sand-table';
const CACHE = '.sand-table-cache';
mkdirSync(CACHE, { recursive: true });
mkdirSync(`${DIR}/portraits`, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(url, asBuffer = false) {
  for (let i = 0; i < 4; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`${res.status} ${url}`);
      return asBuffer ? Buffer.from(await res.arrayBuffer()) : await res.json();
    } catch (e) {
      if (i === 3) throw e;
      await sleep(1500 * (i + 1));
    }
  }
}
const api = (params) => get(`${API}?${new URLSearchParams({ format: 'json', formatversion: '2', redirects: '1', ...params })}`);
const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

// ---------------------------------------------------------------- collect
const ids = process.argv.slice(2).length ? process.argv.slice(2) : loadIndex();
const encounters = [];
for (const id of ids) {
  if (!existsSync(`${DIR}/encounters/${id}.js`)) { console.log(`  (no file yet) ${id}`); continue; }
  try { encounters.push(loadEncounter(id)); } catch (e) { console.log(`  ✗ ${id}: ${e.message}`); }
}
const monsters = new Map(); // "page#version" -> {page, version}
const items = new Set();
const portraits = new Map(); // id -> page
for (const e of encounters) {
  for (const m of e.wiki?.monsters || []) monsters.set(`${m.page}#${m.version ?? ''}`, { page: m.page, version: m.version });
  portraits.set(e.id, e.wiki?.portrait || e.wiki?.monsters?.[0]?.page || e.wiki?.page);
  for (const s of e.bring?.setups || []) {
    for (const v of Object.values(s.worn || {})) items.add(v);
    for (const it of s.inventory || []) items.add(it.item);
  }
  for (const m of e.bring?.musts || []) items.add(m.item);
  for (const r of [...(e.requirements || []), ...(e.recommended || [])]) if (r.kind === 'item') items.add(r.item);
  for (const u of e.loot?.uniques || []) items.add(u.item);
}
console.log(`${encounters.length} encounters → ${monsters.size} monster versions, ${items.size} items, ${portraits.size} portraits`);

// ---------------------------------------------------------------- wikitext
// bracket-aware: returns the body of the first {{Infobox Monster ...}} template
function infobox(text) {
  const start = text.search(/\{\{Infobox Monster\b/i);
  if (start < 0) return null;
  let depth = 0, i = start;
  for (; i < text.length - 1; i++) {
    if (text[i] === '{' && text[i + 1] === '{') { depth++; i++; }
    else if (text[i] === '}' && text[i + 1] === '}') { depth--; i++; if (depth === 0) break; }
  }
  return text.slice(start + 2, i - 1);
}
// splits a template body into fields, respecting nested templates and links
function fields(body) {
  const out = {};
  let depth = 0, cur = '', parts = [];
  for (let i = 0; i < body.length; i++) {
    const c = body[i], n = body[i + 1];
    if ((c === '{' && n === '{') || (c === '[' && n === '[')) { depth++; cur += c + n; i++; continue; }
    if ((c === '}' && n === '}') || (c === ']' && n === ']')) { depth--; cur += c + n; i++; continue; }
    if (c === '|' && depth === 0) { parts.push(cur); cur = ''; continue; }
    cur += c;
  }
  parts.push(cur);
  for (const p of parts.slice(1)) {
    const eq = p.indexOf('=');
    if (eq < 0) continue;
    out[p.slice(0, eq).trim().toLowerCase()] = p.slice(eq + 1).trim();
  }
  return out;
}
function clean(v) {
  if (v == null) return null;
  let s = String(v);
  s = s.replace(/<ref[^>]*\/>/g, '').replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '');
  s = s.replace(/<!--[\s\S]*?-->/g, '');
  s = s.replace(/<br\s*\/?>/gi, ', ');
  s = s.replace(/\{\{sic\}\}/gi, '');
  s = s.replace(/\{\{[^{}]*\}\}/g, (m) => { const p = m.slice(2, -2).split('|'); return p.length > 1 ? p[p.length - 1] : ''; });
  s = s.replace(/\[\[([^\]|]*)\|([^\]]*)\]\]/g, '$2').replace(/\[\[([^\]]*)\]\]/g, '$1');
  s = s.replace(/'''?/g, '').replace(/\s+/g, ' ').replace(/\s*,\s*,/g, ',').trim();
  return s.length ? s : null;
}
const KEEP = ['combat', 'hitpoints', 'max hit', 'attack style', 'attack speed', 'size', 'att', 'str', 'def', 'mage', 'range',
  'attbns', 'strbns', 'amagic', 'mbns', 'arange', 'rngbns', 'dstab', 'dslash', 'dcrush', 'dmagic', 'drange', 'dlight', 'dstandard', 'dheavy',
  'elementalweaknesstype', 'elementalweaknesspercent', 'poisonresistance', 'venomresistance', 'immunepoison', 'immunevenom',
  'immunecannon', 'immunethrall', 'freezeresistance', 'slaylvl', 'slayxp', 'examine', 'aggressive', 'poisonous', 'attributes', 'release', 'id', 'name', 'image'];
function pick(f, version) {
  const versions = [];
  for (let n = 1; f[`version${n}`] != null; n++) versions.push(clean(f[`version${n}`]));
  let n = null;
  if (version != null) {
    if (typeof version === 'number') n = version;
    else { const i = versions.findIndex((v) => v && v.toLowerCase() === String(version).toLowerCase()); if (i >= 0) n = i + 1; }
    if (n == null) console.log(`    version "${version}" not found; versions are ${versions.join(' | ')}`);
  }
  const out = { versions, version: n ? versions[n - 1] : null };
  for (const k of KEEP) {
    const v = (n && f[`${k}${n}`] != null) ? f[`${k}${n}`] : f[k];
    const c = clean(v);
    if (c != null) out[k] = c;
  }
  if (out.image) { const m = out.image.match(/File:([^|\]]+)/i); out.image = m ? m[1].trim() : null; }
  for (const k of ['combat', 'hitpoints', 'attack speed', 'size', 'att', 'str', 'def', 'mage', 'range', 'attbns', 'strbns', 'amagic', 'mbns', 'arange', 'rngbns',
    'dstab', 'dslash', 'dcrush', 'dmagic', 'drange', 'dlight', 'dstandard', 'dheavy', 'elementalweaknesspercent', 'slaylvl', 'freezeresistance']) {
    if (out[k] != null && /^-?\d+(\.\d+)?$/.test(out[k])) out[k] = Number(out[k]);
  }
  return out;
}

const wiki = { fetched: new Date().toISOString(), monsters: {}, icons: {}, missing: { monsters: [], icons: [], portraits: [] } };
const pages = [...new Set([...monsters.values()].map((m) => m.page))];
const texts = new Map();
for (const batch of chunk(pages, 20)) {
  const d = await api({ action: 'query', prop: 'revisions', rvprop: 'content', rvslots: 'main', titles: batch.join('|') });
  const redirects = new Map((d.query.redirects || []).map((r) => [r.to, r.from]));
  for (const p of d.query.pages || []) {
    const names = [p.title, redirects.get(p.title)].filter(Boolean);
    const t = p.revisions?.[0]?.slots?.main?.content;
    for (const nme of names) texts.set(nme, t || null);
  }
  await sleep(300);
}
for (const [key, m] of monsters) {
  const t = texts.get(m.page);
  const box = t ? infobox(t) : null;
  if (!box) { wiki.missing.monsters.push(key); console.log(`  no infobox: ${m.page}`); continue; }
  wiki.monsters[key] = pick(fields(box), m.version);
}
console.log(`stats: ${Object.keys(wiki.monsters).length} monster versions`);

// ---------------------------------------------------------------- icons
// The wiki's inventory icon for an item is File:<Item name>.png; resolve each
// through imageinfo (follows file redirects, e.g. renamed items) then download.
async function fileUrls(fileTitles, width) {
  const out = new Map();
  for (const batch of chunk(fileTitles, 50)) {
    const params = { action: 'query', prop: 'imageinfo', iiprop: 'url', titles: batch.join('|') };
    if (width) params.iiurlwidth = String(width);
    const d = await api(params);
    const norm = new Map([...(d.query.normalized || []), ...(d.query.redirects || [])].map((r) => [r.to, r.from]));
    for (const p of d.query.pages || []) {
      const info = p.imageinfo?.[0];
      const url = info ? (width ? info.thumburl || info.url : info.url) : null;
      out.set(p.title, url);
      if (norm.has(p.title)) out.set(norm.get(p.title), url);
    }
    await sleep(300);
  }
  return out;
}
async function download(url, cacheKey) {
  const path = `${CACHE}/${cacheKey.replace(/[^\w.()+'-]+/g, '_')}`;
  if (existsSync(path)) return readFileSync(path);
  const buf = await get(url, true);
  if (buf) writeFileSync(path, buf);
  await sleep(150);
  return buf;
}
const itemList = [...items].sort();
const iconUrls = await fileUrls(itemList.map((i) => `File:${i}.png`));
// items whose icon isn't simply <name>.png (capitalisation, "(tablet)", stack
// sizes like "Rune bolts 5.png") resolve through their own page's infobox image
const unresolved = itemList.filter((i) => !iconUrls.get(`File:${i}.png`));
for (const batch of chunk(unresolved, 20)) {
  const d = await api({ action: 'query', prop: 'revisions', rvprop: 'content', rvslots: 'main', titles: batch.join('|') });
  const back = new Map([...(d.query.normalized || []), ...(d.query.redirects || [])].map((r) => [r.to, r.from]));
  const wanted = new Map();
  for (const pg of d.query.pages || []) {
    const t = pg.revisions?.[0]?.slots?.main?.content; if (!t) continue;
    const m = t.match(/\|\s*image1?\s*=\s*\[\[File:([^\]|]+)/i) || t.match(/\[\[File:([^\]|]+\.png)/i);
    if (!m) continue;
    // map every original spelling that led to this page
    const names = [pg.title];
    let n = pg.title; while (back.has(n)) { n = back.get(n); names.push(n); }
    for (const nm of names) if (batch.includes(nm)) wanted.set(nm, `File:${m[1].trim()}`);
  }
  const urls = await fileUrls([...new Set(wanted.values())]);
  for (const [nm, f] of wanted) if (urls.get(f)) iconUrls.set(`File:${nm}.png`, urls.get(f));
  await sleep(300);
}
for (const item of itemList) {
  const url = iconUrls.get(`File:${item}.png`);
  if (!url) { wiki.missing.icons.push(item); console.log(`  no icon: ${item}`); continue; }
  const buf = await download(url, `icon_${item}.png`);
  if (!buf) { wiki.missing.icons.push(item); continue; }
  wiki.icons[item] = `data:image/png;base64,${buf.toString('base64')}`;
}
console.log(`icons: ${Object.keys(wiki.icons).length} of ${itemList.length}`);

// ---------------------------------------------------------------- portraits
// The infobox image of each encounter's headline monster, as a 160px-wide
// thumbnail. Raids name an activity page; their first monster's image is used.
const portraitFiles = new Map();
for (const [id, page] of portraits) {
  const t = texts.get(page) ?? (await (async () => {
    const d = await api({ action: 'query', prop: 'revisions', rvprop: 'content', rvslots: 'main', titles: page });
    await sleep(300);
    return d.query.pages?.[0]?.revisions?.[0]?.slots?.main?.content || null;
  })());
  let file = null;
  if (t) {
    const box = infobox(t) || (t.match(/\{\{Infobox [^|]+\|[\s\S]*?\n\}\}/) || [null])[0]?.slice(2, -2);
    const f = box ? fields(box) : {};
    const img = f.image1 || f.image || '';
    const m = String(img).match(/File:([^|\]]+)/i);
    file = m ? m[1].trim() : null;
  }
  if (!file) { wiki.missing.portraits.push(id); console.log(`  no portrait: ${id} (${page})`); continue; }
  portraitFiles.set(id, `File:${file}`);
}
const portraitUrls = await fileUrls([...new Set(portraitFiles.values())], 120);
for (const [id, file] of portraitFiles) {
  const url = portraitUrls.get(file);
  if (!url) { wiki.missing.portraits.push(id); console.log(`  no portrait url: ${id} (${file})`); continue; }
  const buf = await download(url, `portrait_${id}.png`);
  if (!buf) { wiki.missing.portraits.push(id); continue; }
  writeFileSync(`${DIR}/portraits/${id}.png`, buf);
}
console.log(`portraits: ${portraitFiles.size - wiki.missing.portraits.length} of ${portraits.size}`);

if (process.argv.slice(2).length && existsSync(`${DIR}/wiki.json`)) {
  // partial run: merge into the existing file rather than dropping everyone else
  const prev = JSON.parse(readFileSync(`${DIR}/wiki.json`, 'utf8'));
  wiki.monsters = { ...prev.monsters, ...wiki.monsters };
  wiki.icons = { ...prev.icons, ...wiki.icons };
}
writeFileSync(`${DIR}/wiki.json`, JSON.stringify(wiki));
console.log(`wrote ${DIR}/wiki.json (${(readFileSync(`${DIR}/wiki.json`).length / 1024).toFixed(0)} KB)`);
