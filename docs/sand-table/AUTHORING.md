# Sand Table — authoring an encounter

The Sand Table (`public/tools/runescape/sand-table.html`) is a bossing and
raiding rehearsal tool for Old School RuneScape. Every encounter is one file
under `public/tools/runescape/data/sand-table/encounters/<id>.js` that calls
`SAND_TABLE.register({...})` with a plain object in the shape below. The app
loads every id listed in `data/sand-table/index.js`, and
`scripts/validate-sand-table.mjs` checks every file against this document.

The tool's whole point is what the wiki can't do: it puts the mechanic in
**space and time** — a tile-scale 3D diorama of the arena with a tick clock
you scrub, then a drill mode that turns the table around and grades your
prayer switches and movement. So every encounter is three things:

1. **The briefing** — requirements (checked against the player's hiscores),
   what to expect (phases, mechanics with cue → response), how to get there,
   why people go (loot).
2. **The kit** — worn setups and a 4×7 inventory, item by item, with a *why*
   on anything a first-timer would not think to bring.
3. **The sand table** — one or more scenes: an arena, actors, and a script
   of events in game ticks (0.6 s) that the app plays back and drills.

## Voice and accuracy

- Second person, short sentences, the game's own words ("pray Magic",
  "the head glows", "Saradomin brew"). No trading-desk talk, no fluff.
- Original prose. Read the OSRS Wiki's `<Boss>` and `<Boss>/Strategies`
  pages for facts and write them in your own words — the wiki's text is
  CC BY-NC-SA and the tool credits it as the source of the *data*, not as
  copied guide text.
- Numbers (max hits, hitpoints, attack speed, requirement levels) come from
  the wiki's infobox and strategy page as of today. Don't guess a number;
  if a figure is uncertain, describe the behaviour instead.
- Every mechanic answers two questions: **what do I see** (the cue) and
  **what do I do** (the response). "Olm's head faces the middle and glows
  green → pray Magic" beats "Olm uses a magic attack".
- The scene is a **scripted reenactment of one representative rotation**,
  not a full combat simulation. Say so in `subtitle` if the rotation varies.

## Reading the wiki

Use the API with a descriptive User-Agent, never scrape rendered HTML:

```sh
UA="peligaming sand-table author (github.com/peligwen/peligaming)"
# raw wikitext of a page (infobox + prose)
curl -sS -A "$UA" "https://oldschool.runescape.wiki/api.php?action=query&prop=revisions&rvprop=content&rvslots=main&format=json&redirects=1&titles=Scurrius%2FStrategies"
# plain-text intro
curl -sS -A "$UA" "https://oldschool.runescape.wiki/api.php?action=query&prop=extracts&explaintext=1&format=json&redirects=1&titles=Scurrius"
```

Monster stats (combat level, hitpoints, max hits, attack speed, defensive
bonuses, immunities) are **not** hand-copied into the encounter file: list
the monster pages under `wiki.monsters` and `scripts/fetch-boss-data.mjs`
pulls them into `data/sand-table/wiki.json`. Likewise item icons: name items
exactly as their wiki page is titled ("Saradomin brew(4)", "Anti-venom+(4)",
"Rune crossbow", "Toxic blowpipe") and the same script fetches the icons.

## The object

```js
SAND_TABLE.register({
  id: "scurrius",                 // file name, url hash, stable
  name: "Scurrius",
  aka: ["the Rat King", "Rat"],   // nicknames players actually use
  group: "solo",                  // raid | group | solo | slayer | wilderness | minigame | skilling
  region: "Varrock Sewers",
  team: "1 or 2+",                // free text: "1–100", "1 (2–4 typical)"
  difficulty: 1,                  // 1–5 skulls: 1 first boss ever … 5 Inferno / CM / HMT
  kc: "Scurrius",                 // exact hiscores activity name(s), string or array; omit if none
  tagline: "The first boss: telegraphed rockfalls, three styles, one prayer at a time.",
  release: "2024",                // year is enough

  requirements: [                 // hard gates — the app ticks/crosses these
    { kind: "skill", skill: "Prayer", level: 43, note: "for protection prayers" },
    { kind: "quest", name: "Dragon Slayer II" },
    { kind: "item", item: "Anti-venom+(4)", text: "or a Serpentine helm" },
    { kind: "other", text: "Members" },
  ],
  recommended: [ /* same shapes; soft targets for a comfortable first kill */ ],

  expect: {
    overview: "Two or three sentences: what kind of fight this is and what kills people.",
    phases: [ { name: "Phase 1", text: "…" } ],       // omit if there are no phases
    mechanics: [
      {
        name: "Rockfall",
        cue: "Grey shadows appear on the floor",
        response: "Step off any shadowed tile within two ticks",
        style: "typeless",       // melee | ranged | magic | typeless | none
        danger: "high",          // low | med | high
        scene: "arena",          // optional: scene id whose script shows it
      },
    ],
    notes: [ "Anything else a first-timer should know." ],
  },

  bring: {
    setups: [
      {
        name: "Melee (budget)",
        style: "melee",          // melee | ranged | magic | hybrid
        worn: {                  // wiki item names; leave a slot out if empty
          head: "Helm of neitiznot", cape: "Fire cape", neck: "Amulet of glory",
          ammo: "Rada's blessing 4", weapon: "Abyssal whip", body: "Fighter torso",
          shield: "Dragon defender", legs: "Obsidian platelegs", hands: "Barrows gloves",
          feet: "Dragon boots", ring: "Berserker ring (i)",
        },
        inventory: [             // ≤ 28 entries counting qty; order as you'd lay them out
          { item: "Super combat potion(4)", qty: 1, why: "…" },
          { item: "Prayer potion(4)", qty: 4 },
          { item: "Shark", qty: 20 },
        ],
        notes: [ "Bring a stamina if you walk." ],
      },
    ],
    musts: [ { item: "Anti-venom+(4)", why: "Zulrah's venom hits 20s without it" } ],
    notes: [ "Prayer bonus matters more than defence here." ],
  },

  route: [ "Varrock Sewers via the manhole east of Varrock Palace", "…" ],
  loot: {
    uniques: [ { item: "Scurrius' spine", note: "unlocks the Bone mace/shortbow/staff" } ],
    notes: [ "≈ 1M gp/h at max, mostly from…" ],
  },
  tips: [ "What the wiki doesn't stress: …" ],

  wiki: {
    page: "Scurrius",                                   // main article
    monsters: [ { page: "Scurrius", version: "Solo", label: "Scurrius" } ],
  },

  scenes: [ /* see below */ ],
});
```

## Scenes

A scene is an arena, its actors, the player's start tile, and a script.
Coordinates are OSRS-style: **x east, y north, (0,0) the south-west tile**,
integers. An actor of `size` N stands on N×N tiles with (x, y) its
south-west tile (the game's convention). Distances are in tiles; time is in
**ticks** (0.6 s) from the scene's start.

```js
{
  id: "arena",                       // unique within the encounter
  name: "Scurrius' lair",
  subtitle: "one rotation: two rockfalls and a style swap",
  arena: {
    w: 14, h: 12,                    // tiles; keep it 8–30 a side
    floor: "stone",                  // stone | sand | ice | blood | cave | grass | metal | swamp | dark
    walls: true,                     // a low wall around the edge
    features: [                      // optional scenery / terrain
      { kind: "pillar", x: 3, y: 3, w: 1, h: 1, height: 3, label: "Pillar" },
      { kind: "block", x: 0, y: 8, w: 4, h: 4 },          // impassable box
      { kind: "pit", x: 6, y: 6, w: 2, h: 2 },            // lowered, dark
      { kind: "water", x: 0, y: 0, w: 14, h: 1 },         // blue tiles
      { kind: "lava", x: 12, y: 0, w: 2, h: 2 },
      { kind: "rock", x: 5, y: 9 },
      { kind: "altar", x: 7, y: 11, label: "Altar" },
      { kind: "portal", x: 13, y: 5, color: "#7ad" },
      { kind: "marker", x: 4, y: 4, label: "Stand here", color: "#ff0" },  // a floor label
    ],
  },
  actors: [
    { id: "boss", kind: "boss", label: "Scurrius", shape: "rat", size: 3, x: 6, y: 5, color: "#8a7a66", hp: 500 },
    { id: "ally1", kind: "team", label: "Teammate", shape: "biped", size: 1, x: 2, y: 3, color: "#4da" },
  ],
  player: { x: 4, y: 2 },            // start tile (hp comes from the hiscores)
  length: 40,                        // ticks; the app loops after this
  script: [ /* events, sorted by t */ ],
}
```

### Shapes

`biped` (human/humanoid), `giant`, `serpent` (Zulrah, Hueycoatl), `dragon`,
`olm` (a head rising from the floor), `hand`, `quadruped` (Cerberus, Callisto),
`spider`, `rat`, `blob` (Bloat), `demon` (winged humanoid), `bird` (Kree'arra),
`golem`, `orb` (floating sphere: Vasa's crystals, Verzik's orbs), `crystal`,
`worm`, `skeleton`, `kraken` (tentacles), `beetle`, `wolf`, `pillar` (a
targetable object). Pick the closest; colour does the rest.

### Events

Every event has `t` (tick). Sort the script by `t`.

| type | fields | meaning |
| --- | --- | --- |
| `attack` | `from`, `style`, `max`, `hit`, `label`, `cue`, `pray?`, `unblockable?` | The boss winds up at `t`; the hit lands at `t + hit` (1 for melee, 2–4 for projectiles). `pray` defaults to `style`; set `pray: null` (or `style: "typeless"`) when no prayer helps. The drill grades the player's overhead at the landing tick. |
| `aoe` | `label`, `tiles` **or** `area`, `warn`, `max`, `note?`, `color?` | Danger tiles shown from `t` until they hit at `t + warn`. `tiles: [[x,y],…]`; `area: {kind:"rect",x,y,w,h}` \| `{kind:"square",x,y,r}` (all tiles within r) \| `{kind:"ring",x,y,r}` (the ring at distance r) \| `{kind:"row",y}` \| `{kind:"col",x}` \| `{kind:"line",x1,y1,x2,y2}`. |
| `move` | `actor`, `to: [x,y]`, `ticks?` | Walk an actor to a tile over `ticks` (default 1 per tile, run speed). `actor: "player"` is the guide's own movement in the reenactment (ignored in the drill, where the user walks). |
| `say` | `actor`, `text`, `dur?` | Overhead text (the boss taunts, "Chompy!"…). |
| `msg` | `text` | A chatbox game message ("The Hueycoatl is shielding itself."). |
| `note` | `text` | The coach: what is happening and what to do. Use these generously — they narrate the reenactment. |
| `phase` | `name` | A phase banner. |
| `spawn` | `actor: {…}` | Add an actor (adds, hands, tornadoes…). |
| `despawn` | `actor` | Remove an actor. |
| `safe` | `label`, `tiles`/`area`, `dur` | Green tiles: where to stand. |
| `pray` | `pray` | Force the reenactment player's overhead at `t` (`melee` \| `ranged` \| `magic` \| `none`) when it isn't implied by an attack. |
| `hp` | `actor`, `pct` | Set an actor's health bar (phase progress). |
| `anim` | `actor`, `kind` | `slam` \| `rise` \| `sink` \| `spin` \| `die` \| `shield` \| `flash` — cosmetic. |
| `face` | `actor`, `dir` | `n` \| `e` \| `s` \| `w` \| `player`. |

Rules the validator enforces:

- All tiles inside the arena; actor sizes fit; `t` within `0…length`.
- In the reenactment (the guide's own `move` events for the player, auto
  prayer per attack), the player must never stand on a danger tile when it
  hits. Write the `move` that dodges each `aoe`.
- Every scene needs at least one `note` in its first 3 ticks that says what
  the scene shows, and a `note` on every mechanic the first time it happens.
- Item names in `bring` must be exact wiki page names.

## What "done" looks like for one encounter

- The file validates (`node scripts/validate-sand-table.mjs <id>`).
- Requirements match the wiki's; recommended levels are a real player's
  comfortable first-kill bar, not max.
- At least one setup a mid-level player could actually own, and one
  strong one; the inventory is the real 28 (or fewer), not a wish list.
- Every mechanic on the wiki's strategy page appears in `expect.mechanics`
  with a cue and a response; the dangerous ones appear in the scene script.
- The scene script reads like a good PoV: notes narrate, attacks are
  prayable, aoes are dodgeable, and it loops cleanly.
