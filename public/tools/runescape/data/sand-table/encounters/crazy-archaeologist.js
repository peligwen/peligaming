// Bellock, the Crazy archaeologist — the ruins south of the Forgotten Cemetery. See docs/sand-table/AUTHORING.md.
const book = (t, x, y, label, note) => ({
  t, type: "aoe", label, area: { kind: "square", x, y, r: 1 }, warn: 3, max: 24, color: "#e0a050",
  ...(note ? { note } : {}),
});

SAND_TABLE.register({
  id: "crazy-archaeologist",
  name: "Crazy archaeologist",
  aka: ["Bellock", "Crazy Arch"],
  group: "wilderness",
  region: "The western ruins south of the Forgotten Cemetery, level 23 Wilderness (single-way)",
  team: "1",
  difficulty: 1,
  kc: "Crazy Archaeologist",
  tagline: "Ranged from three tiles on Protect from Missiles; when he shouts 'Rain of knowledge!' walk out of the books, then walk again. Singles, level 23: a glory gets you home.",
  release: "2014",

  requirements: [
    { kind: "other", text: "Members" },
    { kind: "skill", skill: "Prayer", level: 40, note: "Protect from Missiles for his throws; 43 for Melee if you stand next to him" },
  ],
  recommended: [
    { kind: "skill", skill: "Magic", level: 75, note: "a trident: he has 1 Magic, so spells barely miss; 50+ with Iban's staff also works" },
    { kind: "skill", skill: "Hitpoints", level: 60 },
    { kind: "skill", skill: "Defence", level: 60 },
    { kind: "item", item: "Amulet of glory", text: "or a royal seed pod / ring of wealth — the only teleports that work at level 23" },
  ],

  expect: {
    overview: "Bellock is a level 204 archaeologist with 225 hitpoints digging in the ruins south of the Forgotten Cemetery, level 23 Wilderness, single-way combat. He throws from range and only punches if you stand next to him, so from three tiles away Protect from Missiles makes his ordinary attacks nothing. His one trick is the 'Rain of knowledge!': three books arc at you and explode in a 3×3 each, then one of them splits into two more that go off nearby a beat later — up to 24 apiece. He has 1 Magic, so mage him.",
    mechanics: [
      { name: "Ranged attack", cue: "He throws at you from the dig, every three ticks", response: "Protect from Missiles from three or more tiles away and it's nothing (up to 14 otherwise)", style: "ranged", danger: "low", scene: "ruins" },
      { name: "Punch", cue: "You are next to him", response: "He melees anyone adjacent, up to 14: Protect from Melee — or better, don't stand there; it also gives you no time to see the books coming", style: "melee", danger: "low", scene: "ruins" },
      { name: "Rain of knowledge", cue: "He shouts 'Rain of knowledge!' and three books arc towards you", response: "Walk three tiles clear before they land: each bursts in a 3×3 for up to 24. Then keep going — one book splits into two more that explode nearby a beat later. Stand still until the floor is quiet, then walk back", style: "typeless", danger: "high", scene: "ruins" },
      { name: "Between kills", cue: "He drops; 15 ticks (9 s) to respawn", response: "Only now can another player attack you. Level 23: a normal teleport does nothing, a glory, seed pod or ring of wealth works. Have one on", style: "none", danger: "med", scene: "ruins" },
    ],
    notes: [
      "He has 5 stab and slash defence, 30 crush, 250 ranged — a whip works, a crossbow doesn't. His magic defence looks high on paper (250) but runs off his Magic level of 1, so spells land.",
      "On a Crazy archaeologist boss task you may kill the Deranged archaeologist on Fossil Island instead, unless Krystilia or Konar specified the Wilderness.",
      "A popular rune crossbow source for mid-level ironmen (two at a time, 5/128).",
      "He is the one Wilderness boss with no pet.",
    ],
  },

  bring: {
    setups: [
      {
        name: "Magic (mystic and a trident)",
        style: "magic",
        worn: {
          head: "Mystic hat", cape: "Saradomin cape", neck: "Amulet of glory", weapon: "Trident of the seas",
          body: "Mystic robe top", shield: "Book of darkness", legs: "Mystic robe bottom",
          hands: "Barrows gloves", feet: "Mystic boots", ring: "Explorer's ring 4",
        },
        inventory: [
          { item: "Magic potion(4)", qty: 1 },
          { item: "Blighted super restore(4)", qty: 3, why: "Protect from Missiles all trip" },
          { item: "Stamina potion(4)", qty: 1 },
          { item: "Looting bag", qty: 1 },
          { item: "Burning amulet(5)", qty: 1, why: "Bandit Camp teleport — the ruins are just west of it" },
          { item: "Blighted karambwan", qty: 8 },
          { item: "Blighted manta ray", qty: 12 },
        ],
        notes: [
          "The glory on your neck is the exit: rub it the moment a name you don't like walks up between kills. The trident is the only thing here worth protecting.",
        ],
      },
      {
        name: "Magic (three items and robes — near-zero risk)",
        style: "magic",
        worn: {
          head: "Mystic hat", cape: "Saradomin cape", neck: "Amulet of glory", weapon: "Mystic earth staff",
          body: "Mystic robe top", legs: "Mystic robe bottom", hands: "Rune gloves", feet: "Mystic boots",
        },
        inventory: [
          { item: "Blighted super restore(4)", qty: 3 },
          { item: "Stamina potion(4)", qty: 1 },
          { item: "Looting bag", qty: 1 },
          { item: "Burning amulet(5)", qty: 1 },
          { item: "Blighted karambwan", qty: 8 },
          { item: "Blighted manta ray", qty: 12 },
        ],
        notes: [
          "Autocast your best standard bolt or blast on the earth staff; he has 1 Magic, so accuracy is not the problem, and 225 hitpoints go slowly but surely. Nothing on you is worth a PKer's time.",
        ],
      },
      {
        name: "Melee (whip, next to him)",
        style: "melee",
        worn: {
          head: "Helm of neitiznot", cape: "Obsidian cape", neck: "Amulet of glory", weapon: "Abyssal whip",
          body: "Black d'hide body", shield: "Rune defender", legs: "Black d'hide chaps",
          hands: "Barrows gloves", feet: "Dragon boots", ring: "Berserker ring (i)",
        },
        inventory: [
          { item: "Super combat potion(4)", qty: 1 },
          { item: "Blighted super restore(4)", qty: 3, why: "Protect from Melee while you're adjacent" },
          { item: "Stamina potion(4)", qty: 1 },
          { item: "Looting bag", qty: 1 },
          { item: "Burning amulet(5)", qty: 1 },
          { item: "Blighted karambwan", qty: 7 },
          { item: "Blighted manta ray", qty: 12 },
        ],
        notes: [
          "5 slash defence: a whip shreds him. The price is standing adjacent, where the books land on top of you with no run-up — step off the moment he shouts.",
        ],
      },
    ],
    musts: [
      { item: "Amulet of glory", why: "Level 23: a normal teleport does nothing. A glory, seed pod or ring of wealth is the difference between leaving and not." },
    ],
    notes: [
      "Three items: check Items Kept on Death with 'Wilderness beyond level 20' ticked. Don't bring a fourth you'd mind losing to a Smite.",
      "Blighted food and restores are cheaper and only work here. Leave a slot or two — he drops a lot of un-noted junk you'll want to bag for the rune crossbows.",
      "Turn PK skull prevention on; there's nothing here you'd ever want to click on that isn't him.",
    ],
  },

  route: [
    "The ruins are just south of the Forgotten Cemetery and west of the Bandit Camp, level 23 Wilderness.",
    "Dareeyak Teleport (78 Magic on Ancient Magicks) or a Dareeyak tablet is the closest. A burning amulet to the Bandit Camp and a short run west is the cheap way.",
    "Trollheim Teleport (61 Magic) and the level-64 Agility rocks into the Wilderness, or the Arceuus Cemetery Teleport (71), also land nearby.",
    "Home is a glory — level 23 is above the line for normal teleports and below it for the level-30 items.",
  ],
  loot: {
    uniques: [
      { item: "Odium shard 2", note: "1/256 (1/128 for either shard) — with shards 1 and 3 from the Chaos Fanatic and Scorpia, the Odium ward" },
      { item: "Malediction shard 2", note: "1/256 — the Malediction ward" },
      { item: "Rune crossbow", note: "two at a time, 5/128 — why ironmen come" },
      { item: "Fedora", note: "1/128 — his hat" },
    ],
    notes: [
      "Hard clue 1/128 (1/64 with a ring of wealth (i)), looting bag 1/3, and mid-value bulk: dragon arrows, rune knives, red d'hide, onyx bolt tips.",
      "Killing him, the Chaos Fanatic and Scorpia once each is a hard Wilderness Diary task.",
    ],
  },
  tips: [
    "Three tiles is the number: far enough that he never punches, close enough that the books are easy to read.",
    "The shout comes first, then the books. Start walking on the shout, not on the books.",
    "Two moves per special, not one — the split books go off after the first three, close to where they landed.",
    "Single-way: nobody can attack you while you and he are fighting. Between kills, glory in hand, watch the minimap.",
    "If you mage him, longrange casting from four or five tiles makes the books even easier and keeps you out of punch range after a bad dodge.",
  ],

  wiki: {
    page: "Crazy archaeologist",
    monsters: [{ page: "Crazy archaeologist", label: "Crazy archaeologist" }],
  },

  scenes: [
    {
      id: "ruins",
      name: "Bellock's dig",
      subtitle: "one kill from three tiles: throws on Missiles, two 'Rain of knowledge!' specials with their split books, and the respawn window",
      arena: {
        w: 12, h: 12, floor: "stone", walls: false,
        features: [
          { kind: "block", x: 0, y: 10, w: 4, h: 1, label: "Ruined wall" },
          { kind: "block", x: 8, y: 10, w: 4, h: 1, label: "Ruined wall" },
          { kind: "pillar", x: 1, y: 6, height: 2 }, { kind: "pillar", x: 10, y: 6, height: 2 },
          { kind: "rock", x: 2, y: 8, label: "Dig" }, { kind: "rock", x: 9, y: 8 },
          { kind: "marker", x: 11, y: 3, label: "→ Bandit Camp (east)", color: "#7ad" },
          { kind: "marker", x: 5, y: 11, label: "→ Forgotten Cemetery (north)", color: "#7ad" },
        ],
      },
      actors: [
        { id: "boss", kind: "boss", label: "Crazy archaeologist", shape: "biped", size: 1, x: 5, y: 7, color: "#8a6a3a", hp: 225 },
      ],
      player: { x: 5, y: 2 },
      length: 66,
      script: [
        { t: 0, type: "phase", name: "Ranged from three tiles" },
        { t: 0, type: "note", text: "Bellock at his dig, level 23, single-way. Protect from Missiles up and stand three tiles off: from here he only throws, and the throws are zero. Trident him." },
        { t: 0, type: "pray", pray: "ranged" },
        { t: 1, type: "move", actor: "player", to: [5, 3] },
        { t: 3, type: "attack", from: "boss", style: "ranged", max: 14, hit: 2, label: "Throw", cue: "he throws from the dig every three ticks — Protect from Missiles" },
        { t: 3, type: "note", text: "His ordinary attack: a throw for up to 14, every three ticks. Missiles makes it nothing. If you were adjacent he'd punch for the same instead." },
        { t: 6, type: "attack", from: "boss", style: "ranged", max: 14, hit: 2, label: "Throw", cue: "throw" },
        { t: 9, type: "attack", from: "boss", style: "ranged", max: 14, hit: 2, label: "Throw", cue: "throw" },
        { t: 12, type: "say", actor: "boss", text: "Rain of knowledge!" },
        book(12, 5, 3, "Book", "three books arc at you — 3×3 each, one on your tile"), book(12, 7, 4, "Book"), book(12, 3, 5, "Book"),
        { t: 12, type: "note", text: "'Rain of knowledge!' — three books arc towards you, one at the tile you're on, and each bursts in a 3×3 for up to 24. Start walking on the shout: three tiles clear, away from the other two." },
        { t: 13, type: "move", actor: "player", to: [8, 1] },
        book(15, 9, 2, "Split book", "one book splits on impact: two more explode nearby after a delay"), book(15, 6, 5, "Split book"),
        { t: 15, type: "note", text: "They burst — and one of them splits into two more books that go off nearby a beat later. One of those is on you again. Keep walking until nothing on the floor is glowing." },
        { t: 16, type: "move", actor: "player", to: [5, 1] },
        { t: 18, type: "attack", from: "boss", style: "ranged", max: 14, hit: 2, label: "Throw", cue: "throw — Missiles is still up" },
        { t: 21, type: "attack", from: "boss", style: "ranged", max: 14, hit: 2, label: "Throw", cue: "throw" },
        { t: 24, type: "attack", from: "boss", style: "ranged", max: 14, hit: 2, label: "Throw", cue: "throw" },
        { t: 27, type: "note", text: "Quiet floor. Back to three tiles off him and the trident." },
        { t: 27, type: "move", actor: "player", to: [5, 3] },
        { t: 30, type: "attack", from: "boss", style: "ranged", max: 14, hit: 2, label: "Throw", cue: "throw" },
        { t: 33, type: "attack", from: "boss", style: "ranged", max: 14, hit: 2, label: "Throw", cue: "throw" },
        { t: 36, type: "attack", from: "boss", style: "ranged", max: 14, hit: 2, label: "Throw", cue: "throw" },
        { t: 39, type: "say", actor: "boss", text: "Rain of knowledge!" },
        book(39, 5, 3, "Book", "books"), book(39, 3, 2, "Book"), book(39, 6, 5, "Book"),
        { t: 39, type: "note", text: "Again. Same drill, the other way this time: three tiles clear on the shout, then a second step for the split." },
        { t: 40, type: "move", actor: "player", to: [8, 3] },
        book(42, 8, 4, "Split book"), book(42, 4, 6, "Split book"),
        { t: 43, type: "move", actor: "player", to: [9, 1] },
        { t: 45, type: "attack", from: "boss", style: "ranged", max: 14, hit: 2, label: "Throw", cue: "throw" },
        { t: 48, type: "attack", from: "boss", style: "ranged", max: 14, hit: 2, label: "Throw", cue: "throw" },
        { t: 50, type: "move", actor: "player", to: [5, 3] },
        { t: 51, type: "attack", from: "boss", style: "ranged", max: 14, hit: 2, label: "Throw", cue: "throw" },
        { t: 54, type: "attack", from: "boss", style: "ranged", max: 14, hit: 2, label: "Throw", cue: "throw" },
        { t: 57, type: "attack", from: "boss", style: "ranged", max: 14, hit: 2, label: "Throw", cue: "throw" },
        { t: 60, type: "hp", actor: "boss", pct: 0 },
        { t: 60, type: "anim", actor: "boss", kind: "die" },
        { t: 60, type: "msg", text: "Your Crazy Archaeologist kill count is: 1." },
        { t: 60, type: "note", text: "Down. 15 ticks to respawn, and this is the only time another player can touch you here. Loot with the glory in hand: level 23, a normal teleport does nothing, the glory does." },
        { t: 63, type: "note", text: "Nobody on the minimap. Bag the drop and be three tiles off with Missiles up when he stands." },
      ],
    },
  ],
});
