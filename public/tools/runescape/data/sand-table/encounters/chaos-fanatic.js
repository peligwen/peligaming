// The Chaos Fanatic — west of the Lava Maze. See docs/sand-table/AUTHORING.md.
const red = (t, cue) => ({ t, type: "attack", from: "boss", style: "magic", max: 21, hit: 2, label: "Red bolt", cue: cue || "red bolt — Protect from Magic" });
const blob = (t, x, y, note) => ({
  t, type: "aoe", label: "Green explosion", area: { kind: "square", x, y, r: 1 }, warn: 4, max: 31, color: "#5f5",
  ...(note ? { note } : {}),
});

SAND_TABLE.register({
  id: "chaos-fanatic",
  name: "Chaos Fanatic",
  aka: ["the Fanatic", "Fanatic"],
  group: "wilderness",
  region: "West of the Lava Maze, level 42 Wilderness (single-way)",
  team: "1",
  difficulty: 1,
  kc: "Chaos Fanatic",
  tagline: "Red bolts on Protect from Magic, a disarm that a full bag switches off, and three green blobs you walk away from. Singles: nobody can touch you while you're fighting him.",
  release: "2014",

  requirements: [
    { kind: "other", text: "Members" },
    { kind: "skill", skill: "Prayer", level: 37, note: "Protect from Magic — his only real attack" },
  ],
  recommended: [
    { kind: "skill", skill: "Ranged", level: 75, note: "he is weakest to standard ranged (50 defence) and has 200 Magic, 250+ melee defence" },
    { kind: "skill", skill: "Defence", level: 70 },
    { kind: "skill", skill: "Hitpoints", level: 70 },
    { kind: "skill", skill: "Magic", level: 96, note: "optional: Ghorrock Teleport lands beside him; a tablet does the same" },
  ],

  expect: {
    overview: "The Chaos Fanatic is a level 202 madman with 225 hitpoints who stands among unattackable chaotic clouds west of the Lava Maze at level 42 Wilderness, in single-way combat. He casts a red magic bolt every two ticks — Protect from Magic makes all of them zero — and now and then one of two specials: a green bolt that unequips you (impossible with a full inventory), or three slow green blobs that explode where they land, one aimed at your tile. Walk a few tiles and they burst behind you. The place is safe while you fight; it's between kills that a player can reach you.",
    mechanics: [
      { name: "Red bolt", cue: "A red magic projectile, every two ticks", response: "Protect from Magic — up to 21 otherwise, nothing with the prayer. Ranged him back; his Magic is 200 and his melee defence is 250+", style: "magic", danger: "med", scene: "clouds" },
      { name: "Green blobs (explosion)", cue: "Three slow green projectiles drift towards you; one is aimed at the tile you were standing on when they left", response: "Walk three tiles in any direction and let them burst on empty ground: up to 31 each if you're in one. There's no voice line — watch for the green. After a burst he can only fire red bolts for the next 12 attacks (24 ticks)", style: "typeless", danger: "high", scene: "clouds" },
      { name: "Green bolt (disarm)", cue: "A single green projectile — you can't dodge it", response: "With a full inventory it does nothing. Summer pies leave a dish, vial smashing off leaves vials; keep 28 things in the bag and it never fires", style: "typeless", danger: "med", scene: "clouds" },
      { name: "Between kills", cue: "He drops; 15 ticks (9 s) until the next one", response: "This is the only window a PKer has. Nothing teleports at level 42: the Wilderness Obelisk to the north (level 13 with the hard diary), or east into the King Black Dragon lair, which is not Wilderness", style: "none", danger: "med", scene: "clouds" },
    ],
    notes: [
      "After each explosion he's locked to red bolts for 12 attacks. Then each attack has a 10 in 15 chance of red, 4 in 15 of the blobs, 1 in 15 of the disarm.",
      "Since April 2025 the blobs only target the player who last attacked him.",
      "Your left-click on the clouds is nothing; they're scenery.",
      "The Chaos Temple altar to the south-west recharges prayer between kills — and it is one of the busiest PK spots in the Wilderness.",
    ],
  },

  bring: {
    setups: [
      {
        name: "Ranged (magic shortbow — cheap and enough)",
        style: "ranged",
        worn: {
          head: "Archer helm", cape: "Ava's accumulator", neck: "Amulet of glory", ammo: "Rune arrow",
          weapon: "Magic shortbow (i)", body: "Black d'hide body", legs: "Black d'hide chaps",
          hands: "Black d'hide vambraces", feet: "Snakeskin boots", ring: "Explorer's ring 4",
        },
        inventory: [
          { item: "Ranging potion(4)", qty: 1 },
          { item: "Blighted super restore(4)", qty: 4, why: "Protect from Magic every tick of the trip" },
          { item: "Summer pie", qty: 19, why: "22 healing over two bites and the dish stays — a full inventory means no disarm" },
          { item: "Ghorrock teleport (tablet)", qty: 2, why: "two: after you use the first, the empty slot would let him disarm you" },
          { item: "Looting bag", qty: 1 },
          { item: "Royal seed pod", qty: 1, why: "for after the obelisk drops you at level 13 — a normal teleport doesn't work above 20" },
        ],
        notes: [
          "Turn vial smashing off. Everything worn is d'hide-cheap; the bow, the glory and the body are the three you keep unskulled.",
        ],
      },
      {
        name: "Ranged (Craw's / Webweaver)",
        style: "ranged",
        worn: {
          head: "Archer helm", cape: "Ava's assembler", neck: "Necklace of anguish", ammo: "Rada's blessing 4",
          weapon: "Craw's bow", body: "Black d'hide body", legs: "Black d'hide chaps",
          hands: "Barrows gloves", feet: "Mixed hide boots", ring: "Ring of shadows",
        },
        inventory: [
          { item: "Divine ranging potion(4)", qty: 2 },
          { item: "Blighted super restore(4)", qty: 5 },
          { item: "Summer pie", qty: 17 },
          { item: "Ghorrock teleport (tablet)", qty: 2 },
          { item: "Looting bag", qty: 1 },
          { item: "Royal seed pod", qty: 1 },
        ],
        notes: [
          "The bow, the necklace and the ring are your three. Don't overfill the bow with ether — charges go with it on death.",
        ],
      },
    ],
    musts: [
      { item: "Summer pie", why: "Food that leaves an item behind is the whole answer to the disarm. Curry and stew work; sharks don't." },
      { item: "Ghorrock teleport (tablet)", why: "Two of them — one to get there, and the second so the slot never sits empty." },
    ],
    notes: [
      "Check Items Kept on Death with 'Wilderness beyond level 20' ticked. Three items unskulled, four with Protect Item, none if skulled.",
      "A glory, seed pod or ring of wealth teleports up to level 30 only; he is at 42. Your ways out are the obelisk and the KBD lair, not a tab.",
      "Blighted supplies are cheaper than the real thing and only work here — perfect for this.",
    ],
  },

  route: [
    "He stands west of the Lava Maze at level 42 Wilderness, in a ring of chaotic clouds.",
    "Ghorrock Teleport (96 Magic on Ancient Magicks) or a Ghorrock tablet lands next to him.",
    "A burning amulet to the Lava Maze entrance, then run west.",
    "Hard diary: a house obelisk set to level 44, then a short run.",
  ],
  loot: {
    uniques: [
      { item: "Odium shard 1", note: "1/256 (1/128 for either shard) — with shards 2 and 3 from the Crazy archaeologist and Scorpia, the Odium ward" },
      { item: "Malediction shard 1", note: "1/256 — the Malediction ward" },
      { item: "Ancient staff", note: "1/128 — one of very few sources" },
      { item: "Pet Chaos Elemental", note: "1/1,000 — the Elemental's pet, at a third of the Elemental's rate" },
    ],
    notes: [
      "Hard clue 1/128 (1/64 with a ring of wealth (i)), looting bag 1/3, and a fair amount of gp per hour for something this simple.",
      "Killing him, Scorpia and the Crazy archaeologist once each is a hard Wilderness Diary task.",
    ],
  },
  tips: [
    "Single-way combat: while he and you are fighting, no player can attack you. Stay in combat if someone appears, and be ready the moment he dies — the 9-second respawn is their window.",
    "After every explosion you have 24 ticks of pure red bolts. That's when you restore, count your pies, and look at the minimap.",
    "The blobs are slow. Don't panic-run into a cloud; three tiles in any clear direction is plenty.",
    "Leave the altar alone unless you've watched it for a while — it's a PK hotspot, and you're out of combat while you pray.",
    "The obelisk north of him is the exit. With the hard diary you pick level 13 and teleport from there; without it, it's random, and a teleblock disables it.",
  ],

  wiki: {
    page: "Chaos Fanatic",
    monsters: [{ page: "Chaos Fanatic", label: "Chaos Fanatic" }],
  },

  scenes: [
    {
      id: "clouds",
      name: "The chaotic clouds",
      subtitle: "one kill: red bolts every two ticks, two rounds of green blobs, the disarm, and the respawn window",
      arena: {
        w: 14, h: 12, floor: "dark", walls: false,
        features: [
          { kind: "rock", x: 2, y: 2, label: "Chaotic cloud" }, { kind: "rock", x: 11, y: 2 }, { kind: "rock", x: 2, y: 9 },
          { kind: "rock", x: 11, y: 9 }, { kind: "rock", x: 6, y: 10 }, { kind: "rock", x: 10, y: 6 }, { kind: "rock", x: 1, y: 6 },
          { kind: "marker", x: 7, y: 11, label: "→ Wilderness Obelisk (north) → level 13", color: "#7ad" },
          { kind: "marker", x: 13, y: 5, label: "→ Lava Maze / KBD lair (east)", color: "#7ad" },
          { kind: "marker", x: 0, y: 0, label: "→ Chaos Temple altar (SW) — PK hotspot", color: "#f66" },
        ],
      },
      actors: [
        { id: "boss", kind: "boss", label: "Chaos Fanatic", shape: "biped", size: 1, x: 7, y: 6, color: "#6a2a8a", hp: 225 },
      ],
      player: { x: 7, y: 2 },
      length: 66,
      script: [
        { t: 0, type: "phase", name: "Red bolts — Protect from Magic" },
        { t: 0, type: "note", text: "The Fanatic in his ring of clouds, level 42, single-way. Protect from Magic before you shoot: he casts every two ticks and it never stops. Full inventory of pies, vial smashing off." },
        { t: 0, type: "pray", pray: "magic" },
        red(2, "the first red bolt — Protect from Magic makes every one of these a zero"),
        { t: 2, type: "note", text: "Red bolt: magic, up to 21, every two ticks. With the prayer up it's a zero; the drain is the only cost." },
        red(4), red(6),
        { t: 6, type: "say", actor: "boss", text: "Devilish Oxen Roll!" },
        blob(8, 7, 2, "three slow green blobs — one aimed at the tile you were on"), blob(8, 9, 3), blob(8, 5, 1),
        { t: 8, type: "note", text: "Green: three slow blobs float out, one aimed at the tile you're standing on. They explode where they land — up to 31 each. Walk three tiles in any clear direction and watch them burst behind you. No voice line warns you; the colour does." },
        { t: 9, type: "move", actor: "player", to: [4, 3] },
        red(10),
        { t: 12, type: "note", text: "Bursts behind you. Now he's locked to red bolts for 12 attacks — 24 ticks where nothing else can happen. Restore, count your pies, look at the minimap." },
        red(12), red(14), red(16), red(18), red(20), red(22), red(24), red(26), red(28), red(30), red(32),
        { t: 34, type: "attack", from: "boss", style: "typeless", max: 0, hit: 2, pray: null, label: "Green bolt (disarm)", cue: "a single green bolt — unavoidable" },
        { t: 34, type: "note", text: "The other green: one bolt you can't dodge, and it unequips your gear — if there's an empty slot to put it in. There isn't. Nothing happens. That is what the pies are for." },
        red(36), red(38), red(40), red(42),
        blob(44, 4, 3, "blobs again"), blob(44, 2, 4), blob(44, 6, 5),
        { t: 44, type: "note", text: "Green again. Same answer, other direction — back to your first tile is fine, the blobs are aimed at where you are now." },
        { t: 45, type: "move", actor: "player", to: [7, 2] },
        red(46), red(48), red(50), red(52), red(54), red(56), red(58), red(60),
        { t: 62, type: "hp", actor: "boss", pct: 0 },
        { t: 62, type: "anim", actor: "boss", kind: "die" },
        { t: 62, type: "msg", text: "Your Chaos Fanatic kill count is: 1." },
        { t: 62, type: "note", text: "Down. 15 ticks — 9 seconds — to respawn, and this is the only time a player can attack you here. Loot, and look around. If there's a name you don't like, the obelisk is north (level 13 with the hard diary) and the KBD lair east is out of the Wilderness." },
        { t: 64, type: "note", text: "Nobody. Pick up the drop, keep the bag at 28, and be praying Magic before he stands back up." },
      ],
    },
  ],
});
