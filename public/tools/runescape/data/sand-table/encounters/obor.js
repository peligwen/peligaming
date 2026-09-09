// Obor, the Hill Titan — the free-to-play giant boss behind the hill giants' gate.
SAND_TABLE.register({
  id: "obor",
  name: "Obor",
  aka: ["the Hill Titan", "the hill giant boss"],
  group: "solo",
  region: "Edgeville Dungeon",
  team: "1",
  difficulty: 1,
  kc: "Obor",
  tagline: "A hill giant with a club and a throwing arm: the melee can be prayed, the boulder only halved, and the club knocks you back.",
  release: "2016",

  requirements: [
    { kind: "item", item: "Giant key", text: "one to unlock his gate the first time (not consumed), then one per chest — he and the hill giants drop them" },
    { kind: "other", text: "Free-to-play" },
  ],
  recommended: [
    { kind: "skill", skill: "Attack", level: 50, note: "melee: rune scimitar" },
    { kind: "skill", skill: "Strength", level: 50 },
    { kind: "skill", skill: "Defence", level: 50, note: "his crush is accurate; rune chainbody helps" },
    { kind: "skill", skill: "Hitpoints", level: 50, note: "the boulder is a 26, or 13 through Protect from Missiles" },
    { kind: "skill", skill: "Prayer", level: 40, note: "Protect from Missiles halves the boulder — turn it on before you climb down" },
    { kind: "skill", skill: "Ranged", level: 60, note: "if you range him: green d'hide and a maple shortbow" },
    { kind: "skill", skill: "Magic", level: 50, note: "if you Snare and kite him; he is weak to magic and 20% weaker to earth spells" },
  ],

  expect: {
    overview: "Obor is a level 106 hill giant with 120 hitpoints in a pit in the Edgeville Dungeon. He hits with a club for up to 22 and throws a boulder for up to 26. Protect from Melee stops the club; Protect from Missiles only halves the boulder, which is why most people pray Missiles and let their armour handle the club. The club also shoves you back a tile or two and delays your next attack. He is not clever: bind him and he stands there. Free-to-play's second real boss, and the only source of the hill giant club.",
    mechanics: [
      { name: "Club slam", cue: "He is next to you and swings the club overhead", response: "Protect from Melee blocks it. If you are praying Missiles instead, wear your best crush defence and eat. Either way the slam shoves you back and delays your next swing", style: "melee", danger: "med", scene: "lair" },
      { name: "Knockback", cue: "The club connects and you skid backwards a tile or two", response: "Fight with your back to a wall: you still lose the attack delay, but you stay in reach instead of walking back in every time", style: "none", danger: "low", scene: "lair" },
      { name: "Boulder", cue: "He stops walking, sometimes short of melee range, and hurls a rock", response: "Protect from Missiles before it lands — it still hits up to 13 through the prayer, 26 without. Keep the prayer up all fight; the boulder can come from anywhere in the pit", style: "ranged", danger: "high", scene: "lair" },
      { name: "Snare kiting", cue: "You cast Snare and he stops where he stands", response: "Wait until he is near one wall, bind him, run to the far wall and cast Fire Strike or better until it wears off, then bind again. Snare sometimes holds him less than the full 9.6 seconds — members should use Entangle or ice spells", style: "magic", danger: "low" },
      { name: "Stops short", cue: "He halts a few tiles away instead of walking up to you", response: "He is about to throw. Mages: bind him now without running; melee: close the gap and keep hitting", style: "ranged", danger: "med", scene: "lair" },
    ],
    notes: [
      "You start on a safe ledge; climb down the rocks to start. Turn your prayer on before you climb.",
      "He respawns as soon as you try the chest (with or without a key) or leave and re-enter. World-hopping inside teleports you out.",
      "Kill count only increases when you open the chest with a giant key, and the chest is where the real loot is. Killing him for keys without opening is allowed: 1 in 16 per kill.",
      "Immune to poison and venom.",
    ],
  },

  bring: {
    setups: [
      {
        name: "Melee (free-to-play)",
        style: "melee",
        worn: {
          head: "Rune full helm", cape: "Red cape", neck: "Amulet of power", weapon: "Rune scimitar", body: "Rune chainbody",
          shield: "Rune kiteshield", legs: "Rune platelegs", hands: "Green d'hide vambraces", feet: "Leather boots",
        },
        inventory: [
          { item: "Strength potion(4)", qty: 1 },
          { item: "Giant key", qty: 1, why: "the first opens the gate for good; after that one per chest" },
          { item: "Swordfish", qty: 24, why: "a boulder through prayer is 13, the club is 22 unprayed — you will eat" },
          { item: "Energy potion(4)", qty: 1, why: "walking back in after each shove" },
        ],
        notes: ["Pray Missiles the whole fight and let the chainbody take the club. Back into a wall."],
      },
      {
        name: "Ranged (free-to-play)",
        style: "ranged",
        worn: {
          head: "Coif", cape: "Red cape", neck: "Amulet of power", ammo: "Adamant arrow", weapon: "Maple shortbow", body: "Green d'hide body",
          legs: "Green d'hide chaps", hands: "Green d'hide vambraces", feet: "Leather boots",
        },
        inventory: [
          { item: "Giant key", qty: 1 },
          { item: "Swordfish", qty: 24 },
          { item: "Energy potion(4)", qty: 1, why: "you kite: he walks up, you back off" },
        ],
        notes: ["He walks to you; you cannot keep him at range without Snare, so pray Missiles and accept some club hits."],
      },
      {
        name: "Melee (members)",
        style: "melee",
        worn: {
          head: "Helm of neitiznot", cape: "Fire cape", neck: "Amulet of glory", ammo: "Rada's blessing 2", weapon: "Abyssal whip", body: "Fighter torso",
          shield: "Dragon defender", legs: "Dragon platelegs", hands: "Barrows gloves", feet: "Dragon boots", ring: "Berserker ring (i)",
        },
        inventory: [
          { item: "Super combat potion(4)", qty: 1 },
          { item: "Prayer potion(4)", qty: 2, why: "Protect from Missiles all fight; the kill is short" },
          { item: "Giant key", qty: 1 },
          { item: "Shark", qty: 20 },
          { item: "Giantsoul amulet", qty: 1, why: "teleports you to his gate; with a Desert amulet 4 for spec restores people do 120 kills an hour" },
        ],
        notes: ["A toxic blowpipe at 75 Ranged is the strongest thing here: his Defence is 60 and it attacks fast."],
      },
    ],
    musts: [
      { item: "Giant key", why: "No key, no chest, no kill count, no club. Hill giants drop them (Wilderness ones twice as often)." },
    ],
    notes: [
      "Protect from Missiles is the prayer of the fight: the club can be tanked or prayed, but the boulder is the big unprayable-ish hit.",
      "Free players can bring a strength potion; the fight is over in a minute.",
    ],
  },

  route: [
    "Edgeville Dungeon via the trapdoor south of the Edgeville bank; through the hill giants to the locked gate on the west wall.",
    "Use the giant key on the gate once. Inside, you are on a safe ledge: put your prayer on, then climb down the rocks.",
    "Giantsoul amulet (members) teleports straight to the gate.",
    "After the kill, open the chest with a key. That counts the kill and respawns him.",
  ],
  loot: {
    uniques: [
      { item: "Hill giant club", note: "1 in 118 from the chest: a 40 Attack two-hander with the best crush bonus in free-to-play, and the F2P PvP knockout weapon" },
      { item: "Giant key", note: "1 in 16 from Obor himself, so the loop sustains itself" },
    ],
    notes: [
      "Obor's own drops are hill-giant loot: big bones (giant bones for members), runes, a few coins. The chest holds the good table.",
      "Members: ensouled giant heads 1 in 25, and the giant champion scroll 1 in 5,000.",
      "Beginner clue 1 in 50.",
    ],
  },
  tips: [
    "Stand with your back to a wall and the knockback costs you nothing but the attack delay.",
    "He does not always walk all the way to you before attacking — a pause at range means a boulder.",
    "Mages: Snare from the far wall when he reaches the near one, then cast until it breaks. Bring an energy potion in F2P.",
    "The chest respawns him even without a key: you can farm keys from him and cash them in later.",
  ],

  wiki: {
    page: "Obor",
    monsters: [
      { page: "Obor", label: "Obor" },
    ],
  },

  scenes: [
    {
      id: "lair",
      name: "Obor's lair",
      subtitle: "one melee kill: the club and its shove, the boulder through Protect from Missiles, and backing into the wall",
      arena: {
        w: 12, h: 10, floor: "cave", walls: true,
        features: [
          { kind: "block", x: 0, y: 8, w: 12, h: 2 },
          { kind: "marker", x: 5, y: 9, label: "Safe ledge", color: "#8bd" },
          { kind: "rock", x: 5, y: 7, label: "Climb down" },
          { kind: "altar", x: 10, y: 1, label: "Chest" },
        ],
      },
      actors: [
        { id: "boss", kind: "boss", label: "Obor", shape: "giant", size: 2, x: 6, y: 4, color: "#a8865a", hp: 120 },
      ],
      player: { x: 5, y: 6 },
      length: 72,
      script: [
        { t: 0, type: "note", text: "You climbed down with Protect from Missiles already on: the boulder is the hit that matters (26, halved by the prayer) and it can come at any range. The club is a 22 your armour has to eat — or swap to Protect from Melee when he is adjacent." },
        { t: 0, type: "pray", pray: "ranged" },
        { t: 1, type: "move", actor: "player", to: [5, 4] },
        { t: 2, type: "attack", from: "boss", style: "melee", max: 22, hit: 1, label: "Club slam", cue: "he raises the club over his head" },
        { t: 3, type: "move", actor: "player", to: [3, 4] },
        { t: 3, type: "note", text: "The club lands and shoves you two tiles back; your next swing is delayed. Every slam does this — so put your back to a wall." },
        { t: 8, type: "attack", from: "boss", style: "ranged", max: 26, hit: 2, label: "Boulder", cue: "he stops and hurls a rock" },
        { t: 8, type: "note", text: "The boulder. Protect from Missiles makes it a 13 instead of a 26 — it is never a 0. Keep the prayer up." },
        { t: 10, type: "move", actor: "player", to: [1, 4] },
        { t: 10, type: "note", text: "Walk to the west wall and let him come. Against the wall the shove has nowhere to send you." },
        { t: 11, type: "move", actor: "boss", to: [2, 4], ticks: 2 },
        { t: 14, type: "attack", from: "boss", style: "melee", max: 22, hit: 1, label: "Club slam", cue: "adjacent — every 6 ticks" },
        { t: 15, type: "note", text: "Slam, no movement: you lose the attack delay and nothing else. Hit him between his swings." },
        { t: 20, type: "attack", from: "boss", style: "ranged", max: 26, hit: 2, label: "Boulder", cue: "he winds up a throw even at melee range" },
        { t: 26, type: "attack", from: "boss", style: "melee", max: 22, hit: 1, label: "Club slam", cue: "club up" },
        { t: 30, type: "hp", actor: "boss", pct: 70 },
        { t: 32, type: "attack", from: "boss", style: "ranged", max: 26, hit: 2, label: "Boulder", cue: "a rock" },
        { t: 38, type: "attack", from: "boss", style: "melee", max: 22, hit: 1, label: "Club slam", cue: "club up" },
        { t: 40, type: "note", text: "Eat on his throw animation, not his swing: a slam right after a boulder is the combination that kills 50-hitpoint accounts." },
        { t: 44, type: "attack", from: "boss", style: "ranged", max: 26, hit: 2, label: "Boulder", cue: "a rock" },
        { t: 46, type: "hp", actor: "boss", pct: 40 },
        { t: 50, type: "attack", from: "boss", style: "melee", max: 22, hit: 1, label: "Club slam", cue: "club up" },
        { t: 56, type: "attack", from: "boss", style: "ranged", max: 26, hit: 2, label: "Boulder", cue: "a rock" },
        { t: 62, type: "attack", from: "boss", style: "melee", max: 22, hit: 1, label: "Club slam", cue: "the last swing" },
        { t: 66, type: "hp", actor: "boss", pct: 0 },
        { t: 66, type: "anim", actor: "boss", kind: "die" },
        { t: 66, type: "note", text: "Down. Bury the giant bones from the floor, then use a giant key on the chest for the real loot — that is the kill count. He respawns the moment you touch the chest, so be ready or leave." },
        { t: 67, type: "move", actor: "player", to: [9, 2], ticks: 4 },
      ],
    },
  ],
});
