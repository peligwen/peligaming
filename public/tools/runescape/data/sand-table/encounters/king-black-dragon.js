// King Black Dragon — his lair, reached through the deep Wilderness. See docs/sand-table/AUTHORING.md.
SAND_TABLE.register({
  id: "king-black-dragon",
  name: "King Black Dragon",
  aka: ["KBD"],
  group: "solo",
  region: "King Black Dragon Lair (via level 42 Wilderness)",
  team: "1 (any number)",
  difficulty: 2,
  kc: "King Black Dragon",
  tagline: "Three heads, four kinds of dragonfire, and a lever in the Wilderness between you and him: shield, potion, Protect from Melee.",
  release: "2002",

  requirements: [
    { kind: "other", text: "Members" },
    { kind: "skill", skill: "Prayer", level: 43, note: "Protect from Melee (or Magic) — 37 for Protect from Magic alone" },
    { kind: "quest", name: "Dragon Slayer I", note: "started, for the anti-dragon shield — or a dragonfire shield / ward" },
    { kind: "other", text: "A walk through level 42 Wilderness to the ladder and the lever. Only three or four items are kept if a player kills you on the way" },
  ],
  recommended: [
    { kind: "skill", skill: "Attack", level: 80, note: "if you melee" },
    { kind: "skill", skill: "Strength", level: 80 },
    { kind: "skill", skill: "Ranged", level: 80, note: "if you range" },
    { kind: "skill", skill: "Hitpoints", level: 70 },
    { kind: "skill", skill: "Prayer", level: 70, note: "Piety; 74 for Rigour" },
    { kind: "quest", name: "Slug Menace", note: "for proselyte, the cheap prayer armour to risk" },
  ],

  expect: {
    overview: "The King Black Dragon is a level 276 dragon with 240 hitpoints. Next to him one attack in three is a bite for up to 25, one in three is ordinary dragonfire for up to 65, and one in three is one of three special breaths for up to 50 — toxic, shocking or icy — each with a side effect. An anti-dragon shield and an antifire potion together make the ordinary breath do nothing and the specials 10. So you stand in his face on Protect from Melee, and the fight is a long, cheap grind. The danger is the Wilderness you cross to reach the lever.",
    phases: [
      { name: "Getting there", text: "Burning amulet to the Lava Maze, west and north along the fence, through the gate, down the ladder by the lesser demons, and pull the lever surrounded by poisonous spiders. Bring nothing you would not lose; a teleblock means the lever is not an escape." },
      { name: "The kill", text: "Shield on, potion in, Protect from Melee, stand adjacent. Every attack is either blocked or 10 or less. Eat when the icy breath freezes you. He respawns 16 ticks after he dies — you never leave." },
    ],
    mechanics: [
      { name: "Bite (melee)", cue: "One of the three heads lunges — one attack in three when you are adjacent", response: "Protect from Melee blocks it. Standing adjacent is safest: it makes a third of his attacks this one", style: "melee", danger: "med", scene: "lair" },
      { name: "Fiery breath", cue: "Orange fire from the middle head, up to 65 with nothing", response: "Anti-dragon shield plus an antifire potion: zero. Either alone, or Protect from Magic, only cuts it", style: "magic", danger: "high", scene: "lair" },
      { name: "Toxic breath", cue: "Green breath — 50 with nothing, 10 with shield and potion", response: "Half the hits that land poison you (8 to start): antidote++ or a serpentine helm", style: "magic", danger: "med", scene: "lair" },
      { name: "Shocking breath", cue: "Crackling white-blue breath — 50 / 10", response: "It can drain 2 from every stat. Re-sip your combat potion when it does", style: "magic", danger: "med", scene: "lair" },
      { name: "Icy breath", cue: "Pale blue breath — 50 / 10", response: "It can freeze you for 10 ticks. You cannot step under or away: eat if you are low, because the next breath is coming regardless", style: "magic", danger: "med", scene: "lair" },
      { name: "Walking under", cue: "Your weapon is slower than his 4-tick cycle (a fang, a twisted bow, a dragon hunter crossbow on rapid)", response: "Attack, walk under him, wait 5 ticks, step out and attack: one of his for one of yours, a fifth less damage", style: "none", danger: "low", scene: "lair" },
    ],
    notes: [
      "The lair is not Wilderness: nothing there can attack you, teleports work, and his bones are not noted by the diary.",
      "Instance: 50,000 from the bank, right-click the lever. It collapses if you die and your items go to a gravestone outside the lever — carry a teleport.",
      "The gravestone trick: die in the lair with the expensive gear on you, once, and collect it from your grave inside — nothing valuable ever crosses the Wilderness worn.",
      "He counts as a black dragon for slayer, except tasks from Krystilia.",
      "A dragon hunter wand with Blood Barrage on auto-retaliate out-heals him entirely: the pet hunter's method.",
    ],
  },

  bring: {
    setups: [
      {
        name: "Melee, four items risked (mid level)",
        style: "melee",
        worn: {
          head: "Helm of neitiznot", cape: "Fire cape", neck: "Amulet of glory", ammo: "Rada's blessing 3",
          weapon: "Zamorakian hasta", body: "Proselyte hauberk", shield: "Anti-dragon shield", legs: "Proselyte cuisse",
          hands: "Barrows gloves", feet: "Dragon boots", ring: "Berserker ring (i)",
        },
        inventory: [
          { item: "Antidote++(4)", qty: 1, why: "the toxic breath and the spiders round the lever" },
          { item: "Extended antifire(4)", qty: 1, why: "with the shield, ordinary dragonfire does nothing at all" },
          { item: "Super combat potion(4)", qty: 1 },
          { item: "Super restore(4)", qty: 4 },
          { item: "Monkfish", qty: 19 },
          { item: "Burning amulet(5)", qty: 1, why: "the Lava Maze teleport is the fastest way to the lair" },
          { item: "Teleport to house (tablet)", qty: 1 },
        ],
        notes: [
          "Proselyte is prayer bonus you can afford to lose; the hasta on stab hits his weakest defence.",
          "Protect Item if you are not skulled: four items kept. The hasta, the helm, the ring and the boots — everything else is cheap on purpose.",
        ],
      },
      {
        name: "Crossbow and ward (mid–high)",
        style: "ranged",
        worn: {
          head: "Ancient coif", cape: "Ava's assembler", neck: "Necklace of anguish", ammo: "Diamond bolts (e)",
          weapon: "Dragon hunter crossbow", body: "Black d'hide body", shield: "Dragonfire ward", legs: "Black d'hide chaps",
          hands: "Barrows gloves", feet: "Ancient d'hide boots", ring: "Ring of shadows",
        },
        inventory: [
          { item: "Antidote++(4)", qty: 1 },
          { item: "Extended antifire(4)", qty: 1 },
          { item: "Ranging potion(4)", qty: 1 },
          { item: "Super restore(4)", qty: 4 },
          { item: "Dark crab", qty: 19 },
          { item: "Burning amulet(5)", qty: 1 },
          { item: "Teleport to house (tablet)", qty: 1 },
        ],
        notes: [
          "Protect from Melee next to him, with the ward blocking the fire: the same idea as melee, from a crossbow.",
          "The dragon hunter crossbow is slower than his 4-tick cycle: attack, walk under, wait, step out.",
        ],
      },
      {
        name: "Dragon hunter lance, gravestone-smuggled (strong)",
        style: "melee",
        worn: {
          head: "Torva full helm", cape: "Infernal cape", neck: "Amulet of rancour", ammo: "Rada's blessing 4",
          weapon: "Dragon hunter lance", body: "Torva platebody", shield: "Avernic defender", legs: "Torva platelegs",
          hands: "Ferocious gloves", feet: "Primordial boots", ring: "Ultor ring",
        },
        inventory: [
          { item: "Antidote++(4)", qty: 1 },
          { item: "Extended super antifire(4)", qty: 1, why: "a defender instead of a shield needs the super antifire and Protect from Magic to fully block fire — you take a little more" },
          { item: "Super restore(4)", qty: 14, why: "an hour's worth: you are not leaving" },
          { item: "Super combat potion(4)", qty: 3 },
          { item: "Manta ray", qty: 7 },
          { item: "Teleport to house (tablet)", qty: 1 },
          { item: "Burning amulet(5)", qty: 1 },
        ],
        notes: [
          "This gear never walks through the Wilderness: die in the lair once wearing it, then collect it from the gravestone inside. Bring an hour of supplies each time.",
          "Trouver parchment on the cape if you do cross with it.",
        ],
      },
    ],
    musts: [
      { item: "Anti-dragon shield", why: "Without a shield his ordinary breath is 65 and the specials 50. A dragonfire shield or ward is the upgrade." },
      { item: "Extended antifire(4)", why: "Shield plus potion is what makes the normal breath do nothing." },
      { item: "Antidote++(4)", why: "The toxic breath poisons through everything, and so do the spiders round the lever." },
    ],
    notes: [
      "Everything you carry through the Wilderness should be something you would shrug at losing; four items are kept with Protect Item.",
      "A bonecrusher necklace swapped on for the last hit buries the dragon bones for 4 prayer each.",
      "Sip the antidote++ and antifire at the bank: 48 minutes of both from one dose of each, no slots.",
    ],
  },

  route: [
    "Burning amulet to the Lava Maze, run west then north along the fence, through the gate, down the ladder by the lesser demons, and pull the lever past the poisonous spiders.",
    "Or the level 44 Wilderness Obelisk (hard Wilderness Diary picks the destination), a Ghorrock teleport, or a waka canoe from Edgeville and a long walk past green dragons.",
    "Watch for player killers the whole way: bring a one-click teleport and nothing you love. Once the lever is pulled you are safe.",
  ],
  loot: {
    uniques: [
      { item: "Draconic visage", note: "1/5,000 — the dragonfire shield" },
      { item: "Dragon pickaxe", note: "1/1,000" },
      { item: "Kbd heads", note: "1/128: mount them at 91 Construction, or for the Wilderness Diary" },
      { item: "Dragon med helm", note: "1/128" },
      { item: "Prince black dragon", note: "the pet" },
    ],
    notes: [
      "Dragon bones every kill, black dragonhide, and rune gear: a modest steady income, not a money boss.",
      "Elite clue 1/450.",
    ],
  },
  tips: [
    "Stand adjacent on Protect from Melee: it turns a third of his attacks into a bite that does nothing.",
    "His special breaths are less likely to have a side effect the better protected you are — about 1 in 8 with shield and prayer.",
    "The instance keeps his drops on the floor 30 minutes, yours 3.",
    "Teleblocked at the ladder? You cannot pull the lever. Run, or fight.",
  ],

  wiki: {
    page: "King Black Dragon",
    monsters: [
      { page: "King Black Dragon", label: "King Black Dragon" },
    ],
  },

  scenes: [
    {
      id: "lair",
      name: "The King Black Dragon Lair",
      subtitle: "one kill on Protect from Melee with shield and potion: the bite and all four breaths",
      arena: {
        w: 20, h: 16, floor: "dark", walls: true,
        features: [
          { kind: "portal", x: 1, y: 8, color: "#a86", label: "Lever" },
          { kind: "lava", x: 16, y: 1, w: 3, h: 2 },
          { kind: "lava", x: 1, y: 13, w: 2, h: 2 },
          { kind: "rock", x: 17, y: 12 },
          { kind: "rock", x: 4, y: 3 },
        ],
      },
      actors: [
        { id: "kbd", kind: "boss", label: "King Black Dragon", shape: "dragon", size: 5, x: 7, y: 6, color: "#2a2a30", hp: 240 },
      ],
      player: { x: 2, y: 8 },
      length: 64,
      script: [
        { t: 0, type: "phase", name: "The kill" },
        { t: 0, type: "note", text: "The lair, just off the lever. Shield on, antifire in you, antidote in you, Protect from Melee. He is aggressive from across the room, so walk straight into his face: next to him, a third of his attacks are a bite that does nothing." },
        { t: 0, type: "pray", pray: "melee" },
        { t: 1, type: "move", actor: "player", to: [12, 7], ticks: 5 },
        { t: 2, type: "attack", from: "kbd", style: "magic", max: 65, hit: 2, pray: "melee", label: "Fiery breath", cue: "orange fire from the middle head, from range" },
        { t: 2, type: "note", text: "Ordinary dragonfire: 65 with nothing. With the shield and the potion it does nothing at all — Protect from Magic instead would only cut it. That is why you pray Melee." },
        { t: 6, type: "attack", from: "kbd", style: "melee", max: 25, hit: 1, label: "Bite", cue: "a head lunges — blocked" },
        { t: 10, type: "attack", from: "kbd", style: "magic", max: 50, hit: 2, pray: "melee", label: "Toxic breath", cue: "green breath" },
        { t: 10, type: "note", text: "The three special breaths: 50 with nothing, 10 with shield and potion, each with a side effect on about one hit in eight when you are protected. Green is toxic —" },
        { t: 12, type: "msg", text: "You have been poisoned!" },
        { t: 13, type: "note", text: "— poison, 8 to start. Your antidote++ is already handling it." },
        { t: 14, type: "attack", from: "kbd", style: "melee", max: 25, hit: 1, label: "Bite", cue: "blocked" },
        { t: 18, type: "attack", from: "kbd", style: "magic", max: 65, hit: 2, pray: "melee", label: "Fiery breath", cue: "orange — nothing" },
        { t: 22, type: "attack", from: "kbd", style: "magic", max: 50, hit: 2, pray: "melee", label: "Shocking breath", cue: "crackling white-blue breath" },
        { t: 22, type: "note", text: "Shocking breath: on a hit it can drain 2 from every stat. Re-sip the combat potion when your Strength drops." },
        { t: 26, type: "attack", from: "kbd", style: "melee", max: 25, hit: 1, label: "Bite", cue: "blocked" },
        { t: 28, type: "hp", actor: "kbd", pct: 65 },
        { t: 30, type: "attack", from: "kbd", style: "magic", max: 50, hit: 2, pray: "melee", label: "Icy breath", cue: "pale blue breath" },
        { t: 30, type: "note", text: "Icy breath: it can freeze you for 10 ticks. No stepping under, no stepping away — so eat if you are low, because the next breath comes on time regardless." },
        { t: 34, type: "attack", from: "kbd", style: "magic", max: 65, hit: 2, pray: "melee", label: "Fiery breath", cue: "orange — nothing" },
        { t: 36, type: "note", text: "A fang or a twisted bow is slower than his 4 ticks: attack, walk under him, wait five ticks, step out, attack. One of his for one of yours." },
        { t: 37, type: "move", actor: "player", to: [9, 8] },
        { t: 39, type: "hp", actor: "kbd", pct: 40 },
        { t: 41, type: "move", actor: "player", to: [12, 7] },
        { t: 42, type: "attack", from: "kbd", style: "melee", max: 25, hit: 1, label: "Bite", cue: "blocked" },
        { t: 46, type: "attack", from: "kbd", style: "magic", max: 50, hit: 2, pray: "melee", label: "Toxic breath", cue: "green — 10" },
        { t: 50, type: "attack", from: "kbd", style: "magic", max: 65, hit: 2, pray: "melee", label: "Fiery breath", cue: "orange — nothing" },
        { t: 52, type: "hp", actor: "kbd", pct: 15 },
        { t: 54, type: "attack", from: "kbd", style: "melee", max: 25, hit: 1, label: "Bite", cue: "blocked" },
        { t: 58, type: "attack", from: "kbd", style: "magic", max: 50, hit: 2, pray: "melee", label: "Shocking breath", cue: "crackling — 10" },
        { t: 60, type: "hp", actor: "kbd", pct: 0 },
        { t: 60, type: "anim", actor: "kbd", kind: "die" },
        { t: 60, type: "msg", text: "Your King Black Dragon kill count is: 1." },
        { t: 60, type: "note", text: "Down. Sixteen ticks and he is back: bonecrusher necklace on for the bones, pick up the hide, and stay where you are. Teleports work in here whenever you want out." },
      ],
    },
  ],
});
