#!/usr/bin/env node
// Checks the Azeroth Survivors Save Editor's engine — the <script
// id="save-engine"> block of the tool page — in Node:
//   - SHA-1 against the FIPS 180-1 vectors and HMAC-SHA1 against RFC 2202,
//   - the RSE1 seal: round trips with a random and a fixed nonce, the tag
//     catching a flipped byte, bad input refused,
//   - the talent experience table (point k costs 65 + 15k; 51 cost 23,205),
//   - the item id codec and the names it yields,
//   - the save model: an untouched save comes back byte for byte, new lines
//     land where the game writes them, the typed accessors keep their
//     invariants, and an edited save survives sealing,
//   - loadSave on sealed, plain and foreign text,
//   - and the data tables for duplicate keys.
// Pass `--engine path.js` to check a copy of the engine somewhere else.
//
//   node scripts/check-save-editor.mjs [--engine file]      (npm run check:save-editor)

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const args = process.argv.slice(2);
const enginePath = args.includes('--engine') ? args[args.indexOf('--engine') + 1] : null;
const PAGE = 'public/tools/azeroth-survivors/save-editor.html';

let src;
if (enginePath) src = readFileSync(enginePath, 'utf8');
else {
  const html = readFileSync(PAGE, 'utf8');
  const m = html.match(/<script id="save-engine">([\s\S]*?)<\/script>/);
  if (!m) throw new Error(`${PAGE} has no <script id="save-engine"> block`);
  src = m[1];
}
const SAVE = new Function(`${src}\nreturn SAVE;`)();
const { RSE, S, model } = SAVE;

let failures = 0, checks = 0;
function check(name, ok, detail = '') {
  checks++;
  if (!ok) failures++;
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${detail ? ': ' + detail : ''}`);
}
const hex = (b) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
const enc = (s) => new TextEncoder().encode(s);
const fill = (n, v) => new Uint8Array(n).fill(v);
function throws(fn, re) { try { fn(); return false; } catch (e) { return re.test(e.message); } }

// ------------------------------------------------------------- SHA-1 / HMAC
console.log('SHA-1 (FIPS 180-1 appendix A and B)');
check('sha1("")', hex(RSE.sha1(enc(''))) === 'da39a3ee5e6b4b0d3255bfef95601890afd80709');
check('sha1("abc")', hex(RSE.sha1(enc('abc'))) === 'a9993e364706816aba3e25717850c26c9cd0d89d');
check('sha1(two-block message)', hex(RSE.sha1(enc('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'))) === '84983e441c3bd26ebaae4aa1f95129e5e54670f1');
check('sha1(a million "a")', hex(RSE.sha1(fill(1_000_000, 0x61))) === '34aa973cd4c4daa4f61eeb2bdbad27316534016f');
{
  // every length across the padding edges, against Node's own SHA-1
  let ok = true;
  for (let n = 0; n <= 130; n++) {
    const msg = new Uint8Array(n).map((_, i) => (i * 37 + n) & 0xff);
    if (hex(RSE.sha1(msg)) !== createHash('sha1').update(msg).digest('hex')) ok = false;
  }
  check('sha1 agrees with node:crypto for every length 0–130 (the padding edges)', ok);
}

console.log('HMAC-SHA1 (RFC 2202)');
const hmac = (k, m) => hex(RSE.hmacSha1(k, m));
check('case 1', hmac(fill(20, 0x0b), enc('Hi There')) === 'b617318655057264e28bc0b6fb378c8ef146be00');
check('case 2', hmac(enc('Jefe'), enc('what do ya want for nothing?')) === 'effcdf6ae5eb2fa2d27416d5f184df9c259a7c79');
check('case 3', hmac(fill(20, 0xaa), fill(50, 0xdd)) === '125d7342b9ac11cd91a39af48aa17b4f63f175d3');
check('case 6 (key longer than a block)', hmac(fill(80, 0xaa), enc('Test Using Larger Than Block-Size Key - Hash Key First')) === 'aa4ae5e15272d00e95705637ce8a3b55ed402112');
check('case 7 (key and data longer than a block)', hmac(fill(80, 0xaa), enc('Test Using Larger Than Block-Size Key and Larger Than One Block-Size Data')) === 'e8e99d0f45237d786d6bbaa7965c7808bbff1a91');

// ------------------------------------------------------------- the seal
console.log('RSE1 seal');
const SAMPLE = [
  'pick|2|1|0|duskwood|Aldric|3,1,4,2,0|1',
  'open|2|wsg',
  'items|102000,102010,102020,102100,102210,102800,90011',
  'equip|2|0:102000,4:102210,15:102800',
  'look|2|18:90011',
  'talent|2|1250|holy_light:3,devotion:2',
  'spec|2|0|holy_light:3,devotion:2|',
  'seen|ring_of_protection=2,band_of_flesh=1',
  'ach|class:paladin,count:runs10,zone:elwynn',
  'achat|class:paladin=1761000000,count:runs10=1761000500,zone:elwynn=1760999000',
  'stat|kills=12345,gold=678,guardians=12,bosses=9,runs=11,wins=2,caches=3,marks=40',
  'beat|2|elwynn,duskwood',
  'perk|rerolls:1',
  'tabard|90011',
  'races|1,3,7',
  'hero|2|1|0|3,1,4,2,0',
  'marks|2|40',
  'stars|102000:1',
  'pity|102030:4',
  'glow|2|1900',
  'hbeat|2|elwynn:1',
].join('\n') + '\n';

const sealed = RSE.seal(SAMPLE);
check('sealed text starts with RSE1: and is base64', /^RSE1:[A-Za-z0-9+/]+=*$/.test(sealed));
check('blob is nonce + ciphertext + tag', RSE.b64decode(sealed.slice(5)).length === 16 + enc(SAMPLE).length + 20);
let r = RSE.unseal(sealed);
check('round trip', r.plain === SAMPLE && r.tagOk === true);
check('two exports differ, decode alike', RSE.seal(SAMPLE) !== sealed && RSE.unseal(RSE.seal(SAMPLE)).plain === SAMPLE);
const nonce = new Uint8Array(16).map((_, i) => i * 7 + 1);
check('a fixed nonce is deterministic', RSE.seal(SAMPLE, nonce) === RSE.seal(SAMPLE, nonce));
check('the nonce comes back out', hex(RSE.unseal(RSE.seal(SAMPLE, nonce)).nonce) === hex(nonce));
check('the empty save seals', RSE.unseal(RSE.seal('')).plain === '' && RSE.unseal(RSE.seal('')).tagOk);
check('non-ASCII survives', RSE.unseal(RSE.seal('pick|2|1|0|elwynn|Zoë ☃|0,0,0,0,0|0\n')).plain === 'pick|2|1|0|elwynn|Zoë ☃|0,0,0,0,0|0\n');
{
  const blob = RSE.b64decode(sealed.slice(5));
  const ct = new Uint8Array(blob); ct[16 + 30] ^= 0x01;           // a byte of ciphertext
  const t = RSE.unseal('RSE1:' + RSE.b64encode(ct));
  check('a flipped ciphertext byte fails the tag and changes one character', t.tagOk === false && t.plain !== SAMPLE && t.plain.length === SAMPLE.length);
  const tg = new Uint8Array(blob); tg[tg.length - 1] ^= 0x80;    // a byte of the tag
  const u = RSE.unseal('RSE1:' + RSE.b64encode(tg));
  check('a flipped tag byte fails the tag, plaintext intact', u.tagOk === false && u.plain === SAMPLE);
}
check('no prefix is refused', throws(() => RSE.unseal('hello'), /RSE1/));
check('a too-short blob is refused', throws(() => RSE.unseal('RSE1:AAAA'), /short/));
check('whitespace and line breaks in the base64 are tolerated', RSE.unseal(sealed.replace(/(.{60})/g, '$1\n')).plain === SAMPLE);

// ------------------------------------------------------------- talents
console.log('talent experience');
check('point k costs 65 + 15k', SAVE.talentCost(1) === 80 && SAVE.talentCost(2) === 95 && SAVE.talentCost(51) === 830);
check('all 51 points cost 23,205', SAVE.xpForPoints(51) === 23205);
let tOk = true;
for (let n = 0; n <= SAVE.MAX_TALENT_POINTS; n++) {
  const xp = SAVE.xpForPoints(n);
  if (SAVE.talentPointsFor(xp).points !== n) tOk = false;
  if (n > 0 && SAVE.talentPointsFor(xp - 1).points !== n - 1) tOk = false;
}
check('points(xp(n)) = n and one XP short is n − 1, for every n', tOk);
check('1,250 XP is 8 points, 190 into the 200 for the ninth', JSON.stringify(SAVE.talentPointsFor(1250)) === JSON.stringify({ points: 8, into: 190, next: 200 }));
check('beyond the cap: 51 points, nothing next', SAVE.talentPointsFor(1e9).points === 51 && SAVE.talentPointsFor(1e9).next === 0);

// ------------------------------------------------------------- items
console.log('item ids and names');
let codec = true, names = true;
for (const c of SAVE.CLASS_ORDER) {
  const seen = new Set();
  for (let s = 0; s <= 9; s++) for (let t = 0; t <= 5; t++) {
    const id = SAVE.itemId(c, s, t), d = SAVE.decodeItem(id);
    if (!d || d.cls !== c || d.s !== s || d.t !== t) codec = false;
    if (s < 8) { const n = SAVE.itemName(id); if (seen.has(n)) names = false; seen.add(n); }
  }
}
check('decodeItem inverts itemId for every class, slot and tier', codec);
check('the 48 armor names of a class are all different', names);
check('ids outside the range decode to nothing', SAVE.decodeItem(99999) === null && SAVE.decodeItem(200000) === null && SAVE.decodeItem(106000) === null);
check('"{set} {noun}" sets', SAVE.itemName(102210) === 'Lightforge Breastplate' && SAVE.itemName(102020) === 'Lawbringer Helm');
check('"{noun} of {set}" sets', SAVE.itemName(101030) === 'Helm of Wrath');
check('weapons by tier', SAVE.itemName(101840) === 'Sulfuras, Hand of Ragnaros' && SAVE.itemName(104910) === "Thief's Blade");
check('PvP tier', SAVE.itemName(102250) === "Field Marshal's / Warlord's Breastplate" && SAVE.itemName(102850) === 'PvP weapon');
check('tabards and cosmetics', SAVE.itemName(90011) === 'Stormwind Tabard' && SAVE.itemName(90105) === 'Onyxia Scale Cloak' && SAVE.itemName(12345) === 'item 12345');

// ------------------------------------------------------------- the model
console.log('save model');
const idx = (key, cls) => SAVE.findLine(key, cls);
SAVE.parsePlain(SAMPLE);
check('an untouched save comes back byte for byte', SAVE.serializePlain() === SAMPLE);
check('one class in the save', JSON.stringify(SAVE.classesInSave()) === '[2]');
check('pick', S.pick().name === 'Aldric' && S.pick().zone === 'duskwood' && S.pick().diff === 1);
check('talent', S.talent(2).xp === 1250 && S.talent(2).alloc === 'holy_light:3,devotion:2');
check('hbeat / beat / open', S.hbeat(2).get('elwynn') === '1' && S.beat(2).join() === 'elwynn,duskwood' && S.open(2) === 'wsg');

S.setTalent(1, 500, '');
check('a new class-keyed line follows the last line of its key', idx('talent', 1) === idx('talent', 2) + 1);
S.setMarks(1, 10);
check('…marks too', idx('marks', 1) === idx('marks', 2) + 1);
S.setPets(['squirrel']);
check('a new key lands in the game\'s order (pets: after races, before hero)', idx('pets') > idx('races') && idx('pets') < idx('hero'));
S.setResets(2);
check('…resets after pets', idx('resets') === idx('pets') + 1);
check('both classes now in the save', JSON.stringify(SAVE.classesInSave()) === '[1,2]');

S.setItems([102010, 102000, 102000, 90011]);
check('items are deduplicated and sorted', SAVE.getLine('items')[1] === '90011,102000,102010');
S.setStars(new Map([['102010', '0'], ['102000', '3'], ['102020', '2']]));
check('stars drop zeros and sort by id', SAVE.getLine('stars')[1] === '102000:3,102020:2');
S.setStars(new Map());
check('no stars, no line', SAVE.getLine('stars') === null);
S.setAch([...S.ach(), 'feat:thrifty']);
const stamp = +S.achat().get('feat:thrifty');
check('a new achievement is stamped now', S.ach().includes('feat:thrifty') && Math.abs(stamp - Date.now() / 1000) < 5);
check('old stamps are kept', S.achat().get('zone:elwynn') === '1760999000');
S.setAch(S.ach().filter((k) => k !== 'zone:elwynn'));
check('removing an achievement removes its stamp', !S.ach().includes('zone:elwynn') && !S.achat().has('zone:elwynn'));
S.setPerk(new Map([['rerolls', '0'], ['banish', '2']]));
check('perks drop zero ranks', SAVE.getLine('perk')[1] === 'banish:2');
S.setHbeat(2, new Map([['elwynn', '0'], ['duskwood', '3']]));
check('heroic tiers drop zeros', SAVE.getLine('hbeat', 2)[2] === 'duskwood:3');
S.setHbeat(2, new Map([['duskwood', '0']]));
check('all zero, no line', SAVE.getLine('hbeat', 2) === null);
S.setResets(0);
check('resets 0 removes the line', SAVE.getLine('resets') === null);
check('unknown lines (spec, seen, pity, tabard, races) are untouched', ['spec', 'seen', 'pity', 'tabard', 'races'].every((k) => SAMPLE.includes(SAVE.getLine(k).join('|') + '\n')));
{
  const edited = SAVE.serializePlain();
  const back = RSE.unseal(RSE.seal(edited));
  SAVE.parsePlain(back.plain);
  check('an edited save survives sealing byte for byte', back.tagOk && SAVE.serializePlain() === edited);
}

// ------------------------------------------------------------- loading
console.log('loadSave');
check('a sealed save loads with its signature checked', SAVE.loadSave(sealed) === true && model.lines.length === 21 && hex(model.nonce).length === 32);
check('decrypted lines load too', SAVE.loadSave(SAMPLE) === null && model.nonce === null && SAVE.serializePlain() === SAMPLE);
check('lines that do not start with pick| are recognised', SAVE.loadSave('open|2|wsg\nitems|102000\n') === null && model.lines.length === 2);
check('foreign text is refused with a message', throws(() => SAVE.loadSave('{"not": "a save"}'), /does not look like/));
check('a broken seal is refused with a message', throws(() => SAVE.loadSave('RSE1:AAAA'), /Could not decode/));

// ------------------------------------------------------------- data tables
console.log('data tables');
const unique = (arr) => new Set(arr).size === arr.length;
check('achievement keys are unique', unique(SAVE.ACHIEVEMENTS.map((a) => a[0])));
check('perk keys are unique', unique(SAVE.PERKS.map((p) => p[0])));
check('12 zones, unique ids', SAVE.ZONES.length === 12 && unique(SAVE.ZONES.map((z) => z[0])));
check('every class has five sets and five-tier weapon lists', SAVE.CLASS_ORDER.every((c) => SAVE.CLASSES[c].sets.length === 5 && SAVE.CLASSES[c].weapons.every((w) => w.length === 5)));
check('every armor type names eight slots', Object.values(SAVE.NOUNS).every((n) => n.length === 8));
check('perk requirements name real achievements', SAVE.PERKS.every((p) => (p[3].match(/[a-z]+:[a-z0-9]+/g) || []).every((k) => SAVE.ACHIEVEMENTS.some((a) => a[0] === k))));

console.log(`\n${checks - failures} of ${checks} checks passed`);
process.exit(failures ? 1 : 0);
