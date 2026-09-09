// Bryophyta, the Moss Giantess — the free-to-play sewer boss with the growthlings.
SAND_TABLE.register({
  id: "bryophyta",
  name: "Bryophyta",
  aka: ["the Moss Giantess", "the moss giant boss", "Bryo"],
  group: "solo",
  region: "Varrock Sewers",
  team: "1",
  difficulty: 1,
  kc: "Bryophyta",
  tagline: "Pray Magic, keep your distance, and when three little green things sprout around her, put the sword away and pick up an axe.",
  release: "2018",

  requirements: [
    { kind: "item", item: "Mossy key", text: "one to unlock her gate the first time (not consumed), then one per chest — moss giants drop them" },
    { kind: "item", item: "Bronze axe", text: "any axe or magic secateurs for the growthlings; there is a bronze axe on the log pile inside her lair" },
    { kind: "other", text: "Free-to-play" },
  ],
  recommended: [
    { kind: "skill", skill: "Attack", level: 50, note: "melee: rune scimitar" },
    { kind: "skill", skill: "Strength", level: 50 },
    { kind: "skill", skill: "Defence", level: 50, note: "melee; 40 is enough if you range her" },
    { kind: "skill", skill: "Prayer", level: 37, note: "Protect from Magic, on before you open the gate" },
    { kind: "skill", skill: "Ranged", level: 60, note: "the comfortable F2P method: she never walks to you, so she never melees" },
    { kind: "skill", skill: "Magic", level: 59, note: "Fire Blast: she is 50% weaker to fire — the best F2P damage here by far" },
    { kind: "skill", skill: "Hitpoints", level: 50 },
  ],

  expect: {
    overview: "Bryophyta is a level 128 moss giant with 115 hitpoints in a lair just east of the moss giants in the Varrock Sewers. She hits for 16 with crush and 10 with magic, and on members' worlds she poisons for 8. She does not move: stand back and she can only cast, so Protect from Magic and a bow make her nearly free. The one thing that kills people is the growthlings — three little plants that make her immune until they are cut down with an axe or magic secateurs, and every attack you waste on her while they live is a magic blast in your face.",
    mechanics: [
      { name: "Crush", cue: "You are next to her and she swings", response: "Protect from Melee if you melee her — or stand two tiles away and she never swings at all. She does not walk", style: "melee", danger: "med", scene: "lair" },
      { name: "Magic blast", cue: "A green blast leaves her hands; every 6 ticks when you are out of reach", response: "Protect from Magic. Put it on before you open the gate: she attacks on sight", style: "magic", danger: "med", scene: "lair" },
      { name: "Growthlings", cue: "Three growthlings sprout and walk at you; your hits on her do nothing", response: "Stop attacking her. Equip an axe (or magic secateurs) and click each growthling — one click kills one. Battleaxes and the blessed axe do not count. Only poison and venom hurt her while they live. They hit up to 5 with slash and die in two seconds", style: "melee", danger: "high", scene: "lair" },
      { name: "Poison (members' worlds)", cue: "A green hit and the poison splat, starting at 8", response: "Bring an antipoison on members' worlds even with prayer up. Free-to-play worlds: she does not poison", style: "typeless", danger: "low", scene: "lair" },
    ],
    notes: [
      "A 1 in 5 chance of growthlings each time she attacks while you are attacking her; only one batch of three at a time, with a cooldown of about 20 ticks between batches.",
      "Growthlings give no combat experience, and you can cut them with an axe above your Woodcutting level — it is a weapon here, not a tool.",
      "She respawns 15 ticks after you try the chest (key or not), or when you leave and re-enter.",
      "Kill count only increases when you open the chest with a mossy key.",
    ],
  },

  bring: {
    setups: [
      {
        name: "Ranged (free-to-play)",
        style: "ranged",
        worn: {
          head: "Coif", cape: "Red cape", neck: "Amulet of power", ammo: "Adamant arrow", weapon: "Maple shortbow", body: "Green d'hide body",
          legs: "Green d'hide chaps", hands: "Green d'hide vambraces", feet: "Leather boots",
        },
        inventory: [
          { item: "Bronze axe", qty: 1, why: "the growthlings — or take the one from the log pile in her lair" },
          { item: "Knife", qty: 1, why: "the web on the way in if you come through the sewers" },
          { item: "Mossy key", qty: 1, why: "one per chest; the gate stays unlocked after the first" },
          { item: "Swordfish", qty: 22 },
        ],
        notes: ["Stand three or four tiles back with Protect from Magic on and only the growthlings can touch you."],
      },
      {
        name: "Melee (free-to-play)",
        style: "melee",
        worn: {
          head: "Rune full helm", cape: "Red cape", neck: "Amulet of power", weapon: "Rune scimitar", body: "Green d'hide body",
          shield: "Rune kiteshield", legs: "Green d'hide chaps", hands: "Green d'hide vambraces", feet: "Leather boots",
        },
        inventory: [
          { item: "Bronze axe", qty: 1, why: "growthlings; equip it and click them" },
          { item: "Strength potion(4)", qty: 1 },
          { item: "Knife", qty: 1, why: "the web" },
          { item: "Mossy key", qty: 1 },
          { item: "Swordfish", qty: 22 },
        ],
        notes: ["Green d'hide for magic defence, rune helm and kiteshield for her crush. Guthix armour adds a prayer point per piece for almost the same price."],
      },
      {
        name: "Melee (members)",
        style: "melee",
        worn: {
          head: "Helm of neitiznot", cape: "Fire cape", neck: "Amulet of glory", ammo: "Rada's blessing 2", weapon: "Dragon scimitar", body: "Fighter torso",
          shield: "Dragon defender", legs: "Dragon platelegs", hands: "Barrows gloves", feet: "Dragon boots", ring: "Berserker ring (i)",
        },
        inventory: [
          { item: "Dragon axe", qty: 1, why: "growthlings — any axe; magic secateurs also work" },
          { item: "Dragon claws", qty: 1, why: "she has 115 hitpoints and no defence bonuses: specs end the kill" },
          { item: "Antipoison(4)", qty: 1, why: "members' worlds only: she poisons for 8" },
          { item: "Super combat potion(4)", qty: 1 },
          { item: "Prayer potion(4)", qty: 2 },
          { item: "Mossy key", qty: 1 },
          { item: "Shark", qty: 18 },
          { item: "Giantsoul amulet", qty: 1, why: "teleports you to her gate" },
        ],
        notes: ["With a Desert amulet 4 or a house pool for spec energy and the giantsoul amulet, that is six to eight keys an hour."],
      },
    ],
    musts: [
      { item: "Mossy key", why: "The chest is the only source of Bryophyta's essence, and the kill only counts when you open it." },
      { item: "Bronze axe", why: "Or any axe, or magic secateurs. Without one the growthlings make her immune until you leave." },
    ],
    notes: [
      "Fire spells are the F2P power option: 50% fire weakness, and a staff of fire makes Fire Blast cheap.",
      "On free-to-play worlds she cannot poison you; antipoison is a members' concern.",
    ],
  },

  route: [
    "Varrock Sewers via the manhole east of the palace, north to the moss giants, then east through a web (knife or slash weapon) to her gate.",
    "Members: the level 51 Agility pipe near Vannaka in Edgeville Dungeon, or a giantsoul amulet straight to the gate.",
    "Use a mossy key on the gate once. There is no safe ledge — she attacks on sight, so Protect from Magic before you open it.",
    "Kill her, then open the chest with a key. The chest drops loot on the floor and she respawns 9 seconds later.",
  ],
  loot: {
    uniques: [
      { item: "Bryophyta's essence", note: "1 in 118 from the chest, F2P too: with a battlestaff (62 Crafting, or Zaff for 50k) it makes Bryophyta's staff, which holds nature runes and sometimes does not use one" },
      { item: "Mossy key", note: "1 in 16 from her, 1 in 8 on a moss giant Slayer task — the loop feeds itself" },
    ],
    notes: [
      "Her own drops are moss-giant loot: big bones (giant bones for members), runes, coins. The chest holds the good table; F2P gets noted strength potions and rune platelegs in place of herbs and seeds.",
      "Members: ensouled giant heads 1 in 24, giant champion scroll 1 in 5,000, moss giant bones during Rag and Bone Man II.",
      "Beginner clue 1 in 45.",
    ],
  },
  tips: [
    "Pray Magic before the gate, not after. She has already cast by the time the lair loads.",
    "Equip the axe rather than using it on them: one left-click per growthling.",
    "Stand back. Out of her reach she never melees, and rangers and mages never need Protect from Melee at all.",
    "Growthlings can spawn on the tick she dies. Cut them anyway; they block the chest otherwise.",
  ],

  wiki: {
    page: "Bryophyta",
    monsters: [
      { page: "Bryophyta", label: "Bryophyta" },
      { page: "Growthling", label: "Growthling" },
    ],
  },

  scenes: [
    {
      id: "lair",
      name: "Bryophyta's lair",
      subtitle: "one ranged kill from outside her reach: magic blasts, a batch of growthlings, the chest",
      arena: {
        w: 14, h: 12, floor: "swamp", walls: true,
        features: [
          { kind: "portal", x: 6, y: 0, color: "#8bd" },
          { kind: "marker", x: 7, y: 0, label: "Gate", color: "#8bd" },
          { kind: "rock", x: 12, y: 5, label: "Logs (bronze axe)" },
          { kind: "altar", x: 12, y: 10, label: "Chest" },
          { kind: "water", x: 0, y: 9, w: 3, h: 3 },
        ],
      },
      actors: [
        { id: "boss", kind: "boss", label: "Bryophyta", shape: "giant", size: 3, x: 6, y: 6, color: "#5f8a3c", hp: 115 },
      ],
      player: { x: 6, y: 1 },
      length: 64,
      script: [
        { t: 0, type: "note", text: "The gate opens and she is already casting. Protect from Magic is on. You stand four tiles south of her — she does not walk, so from here she can only cast." },
        { t: 0, type: "pray", pray: "magic" },
        { t: 1, type: "attack", from: "boss", style: "magic", max: 10, hit: 2, label: "Magic blast", cue: "a green blast from her hands" },
        { t: 7, type: "attack", from: "boss", style: "magic", max: 10, hit: 2, label: "Magic blast", cue: "every 6 ticks" },
        { t: 9, type: "hp", actor: "boss", pct: 75 },
        { t: 13, type: "attack", from: "boss", style: "magic", max: 10, hit: 2, label: "Magic blast", cue: "every 6 ticks" },
        { t: 13, type: "spawn", actor: { id: "g1", kind: "add", label: "Growthling", shape: "blob", size: 1, x: 5, y: 5, color: "#7cc04a" } },
        { t: 13, type: "spawn", actor: { id: "g2", kind: "add", label: "Growthling", shape: "blob", size: 1, x: 9, y: 6, color: "#7cc04a" } },
        { t: 13, type: "spawn", actor: { id: "g3", kind: "add", label: "Growthling", shape: "blob", size: 1, x: 7, y: 9, color: "#7cc04a" } },
        { t: 13, type: "note", text: "Growthlings: three sprout around her and she is immune. Stop shooting her. Wield the axe now — they walk to you and hit up to 5." },
        { t: 14, type: "move", actor: "g1", to: [5, 2], ticks: 3 },
        { t: 14, type: "move", actor: "g2", to: [7, 2], ticks: 4 },
        { t: 14, type: "move", actor: "g3", to: [6, 2], ticks: 5 },
        { t: 17, type: "note", text: "Axe in hand, click the first one: one click, one kill. They are 10 hitpoints and the axe always finishes them." },
        { t: 18, type: "despawn", actor: "g1" },
        { t: 19, type: "attack", from: "boss", style: "magic", max: 10, hit: 2, label: "Magic blast", cue: "she keeps casting while you cut" },
        { t: 20, type: "despawn", actor: "g2" },
        { t: 22, type: "despawn", actor: "g3" },
        { t: 22, type: "note", text: "All three cut. Bow back on, and hit her again — she has been immune since they sprouted, so nothing you did in between counted. About 20 ticks before she can sprout another batch." },
        { t: 25, type: "attack", from: "boss", style: "magic", max: 10, hit: 2, label: "Magic blast", cue: "every 6 ticks" },
        { t: 31, type: "attack", from: "boss", style: "magic", max: 10, hit: 2, label: "Magic blast", cue: "every 6 ticks" },
        { t: 33, type: "msg", text: "You have been poisoned!" },
        { t: 33, type: "note", text: "Members' worlds: a poison hit starting at 8, prayer or not. Sip the antipoison. On free-to-play worlds this never happens." },
        { t: 35, type: "hp", actor: "boss", pct: 40 },
        { t: 37, type: "attack", from: "boss", style: "magic", max: 10, hit: 2, label: "Magic blast", cue: "every 6 ticks" },
        { t: 43, type: "attack", from: "boss", style: "magic", max: 10, hit: 2, label: "Magic blast", cue: "every 6 ticks" },
        { t: 49, type: "attack", from: "boss", style: "magic", max: 10, hit: 2, label: "Magic blast", cue: "every 6 ticks" },
        { t: 55, type: "attack", from: "boss", style: "magic", max: 10, hit: 2, label: "Magic blast", cue: "the last one" },
        { t: 59, type: "hp", actor: "boss", pct: 0 },
        { t: 59, type: "anim", actor: "boss", kind: "die" },
        { t: 59, type: "note", text: "Down. Bury the bones, then a mossy key on the chest: loot on the floor, kill count, and she is back in 15 ticks — prayer on before you click it." },
        { t: 60, type: "move", actor: "player", to: [11, 9], ticks: 4 },
      ],
    },
  ],
});
