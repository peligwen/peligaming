// ---------------------------------------------------------------------------
// Shared mock data for the Job Board UX prototypes.
//
// Numbers are plausible OSRS exchange prices, not live ones. Every prototype
// reads the SAME data so the comparison is about layout and interaction, not
// content. The shapes mirror what the real board computes in flip-desk.jsx
// (buildJobs / JobCard), reduced to what a UI needs.
//
//   window.JB.SKILLS   the six skills the board prices work for
//   window.JB.SHEET    the player's sheet: levels, membership, quests, rsn
//   window.JB.JOBS     one entry per job
//   window.JB.math()   per-mode, per-batch arithmetic shared by every prototype
//   window.JB.fmt*     the desk's number formats
//
// Modes: "express" = take the market (insta-buy inputs, insta-sell product —
// thinner pay, starts now); "patient" = quote & wait (the week's going rates on
// both ends — full margin, each leg takes about a day to fill).
// ---------------------------------------------------------------------------
(function () {
  const SKILLS = ["Smithing", "Crafting", "Fletching", "Cooking", "Herblore", "Magic"];

  // OSRS-style skill icons are not bundled — prototypes may use these glyphs or draw their own
  const SKILL_GLYPH = { Smithing: "⚒", Crafting: "✂", Fletching: "➶", Cooking: "♨", Herblore: "⚗", Magic: "✦" };

  const SHEET = {
    rsn: "Peli",
    members: true,
    skills: { Smithing: 62, Crafting: 71, Fletching: 84, Cooking: 88, Herblore: 55, Magic: 74 },
    // every quest/unlock that gates a job on today's board; true = done
    quests: {
      "Dwarf Cannon": true,
      "The Tourist Trap": true,
      "Tai Bwo Wannai Trio": false,
      "Lunar Diplomacy": false,
      "Broader Fletching": false,
    },
  };

  const UNLOCK_NOTE = {
    "Broader Fletching": "Slayer reward unlock — 300 points at any Slayer master",
    "Lunar Diplomacy": "Quest — and these are Lunar spells, cast after swapping spellbooks at the Astral altar",
  };
  const unlockNote = (u) => UNLOCK_NOTE[u] || "Quest required — tick it off in your sheet once it's done";
  const GEAR_NOTE = {
    "Ring of forging": "Wear one at the furnace — without it half your iron ore burns away.",
    "Ammo mould": "Bought from Nulodion at the Dwarven mine for 5 gp.",
    "Amulet mould": "A few gp from any crafting shop.",
    "Glassblowing pipe": "A few gp from a crafting shop, or the Entrana glassblower.",
    Chisel: "A few gp from a general store.",
    "Pestle and mortar": "A few gp from a general store or herblore shop.",
  };
  const gearNote = (g) => GEAR_NOTE[g] || "Hand tool required — a few gp from a shop";

  // px: unit price by mode. fillH: how long a standing offer for ONE day-sized
  // batch takes to fill in patient mode (hours) — express fills at once.
  const J = (o) => o;
  const JOBS = [
    J({
      key: "steel-bar", verb: "Smelt", out: "Steel bar", skill: "Smithing", members: false,
      levels: [{ s: "Smithing", l: 30 }], unlocks: [], facilities: ["Furnace"], gear: [],
      secs: 3.45, xp: [["Smithing", 17.5]],
      buys: [
        { name: "Iron ore", per: 1, px: { express: 98, patient: 91 }, fillH: 2.2 },
        { name: "Coal", per: 2, px: { express: 146, patient: 139 }, fillH: 3.1 },
      ],
      steps: [{ verb: "Smelt", out: "Steel bar", per: 1, at: "furnace", secsEach: 3.0 }],
      sell: { px: { express: 405, patient: 436 }, fillH: 4.0 },
      fees: 0, maxN: { express: 1200, patient: 4200 }, defaultN: 150,
      flags: { crush: 0, rich: false, stale: [], moving: [] },
    }),
    J({
      key: "cannonballs", verb: "Smith", out: "Cannonball", skill: "Smithing", members: true,
      levels: [{ s: "Smithing", l: 35 }], unlocks: ["Dwarf Cannon"], facilities: ["Furnace"], gear: ["Ammo mould"],
      secs: 3.05, xp: [["Smithing", 6.4]],
      buys: [{ name: "Steel bar", per: 0.25, px: { express: 432, patient: 412 }, fillH: 5.5 }],
      steps: [{ verb: "Smith", out: "Cannonball", per: 1, at: "furnace", secsEach: 2.65, qtyPer: 4 }],
      sell: { px: { express: 172, patient: 181 }, fillH: 3.0 },
      fees: 0, maxN: { express: 6000, patient: 14000 }, defaultN: 500,
      flags: { crush: 0, rich: false, stale: [], moving: [] },
    }),
    J({
      key: "adamant-dart-tip", verb: "Smith", out: "Adamant dart tip", skill: "Smithing", members: true,
      levels: [{ s: "Smithing", l: 74 }], unlocks: ["The Tourist Trap"], facilities: ["Anvil"], gear: [],
      secs: 0.52, xp: [["Smithing", 6.25]],
      buys: [{ name: "Adamantite bar", per: 0.1, px: { express: 1910, patient: 1840 }, fillH: 6.0 }],
      steps: [{ verb: "Smith", out: "Adamant dart tip", per: 1, at: "anvil", secsEach: 0.45, qtyPer: 10 }],
      sell: { px: { express: 228, patient: 241 }, fillH: 4.5 },
      fees: 0, maxN: { express: 3000, patient: 9000 }, defaultN: 500,
      flags: { crush: 0, rich: false, stale: [], moving: [] },
    }),
    J({
      key: "gold-bar", verb: "Smelt", out: "Gold bar", skill: "Smithing", members: false,
      levels: [{ s: "Smithing", l: 40 }], unlocks: [], facilities: ["Furnace"], gear: [],
      secs: 3.45, xp: [["Smithing", 22.5]],
      buys: [{ name: "Gold ore", per: 1, px: { express: 184, patient: 176 }, fillH: 2.0 }],
      steps: [{ verb: "Smelt", out: "Gold bar", per: 1, at: "furnace", secsEach: 3.0 }],
      sell: { px: { express: 101, patient: 112 }, fillH: 3.0 },
      fees: 0, maxN: { express: 2500, patient: 8000 }, defaultN: 150,
      flags: { crush: 0, rich: false, stale: [], moving: [] },
    }),
    J({
      key: "rune-platebody", verb: "Smith", out: "Rune platebody", skill: "Smithing", members: false,
      levels: [{ s: "Smithing", l: 99 }], unlocks: [], facilities: ["Anvil"], gear: [],
      secs: 5.9, xp: [["Smithing", 375]],
      buys: [{ name: "Runite bar", per: 5, px: { express: 12480, patient: 12210 }, fillH: 9.0 }],
      steps: [{ verb: "Smith", out: "Rune platebody", per: 1, at: "anvil", secsEach: 5.1 }],
      sell: { px: { express: 38420, patient: 39050 }, fillH: 6.0 },
      fees: 0, maxN: { express: 40, patient: 120 }, defaultN: 20,
      flags: { crush: 0, rich: false, stale: [], moving: [] },
    }),
    J({
      key: "diamond", verb: "Cut", out: "Diamond", skill: "Crafting", members: false,
      levels: [{ s: "Crafting", l: 43 }], unlocks: [], facilities: [], gear: ["Chisel"],
      secs: 1.38, xp: [["Crafting", 107.5]],
      buys: [{ name: "Uncut diamond", per: 1, px: { express: 2310, patient: 2240 }, fillH: 7.0 }],
      steps: [{ verb: "Cut", out: "Diamond", per: 1, at: "", secsEach: 1.2 }],
      sell: { px: { express: 2905, patient: 2980 }, fillH: 5.0 },
      fees: 0, maxN: { express: 400, patient: 1100 }, defaultN: 300,
      flags: { crush: 0, rich: false, stale: [], moving: [] },
    }),
    J({
      key: "opal", verb: "Cut", out: "Opal", skill: "Crafting", members: true,
      levels: [{ s: "Crafting", l: 1 }], unlocks: [], facilities: [], gear: ["Chisel"],
      secs: 1.6, xp: [["Crafting", 15]],
      buys: [{ name: "Uncut opal", per: 1.31, px: { express: 128, patient: 121 }, fillH: 3.0 }],
      steps: [{ verb: "Cut", out: "Opal", per: 1.31, at: "", secsEach: 1.2 }],
      sell: { px: { express: 214, patient: 226 }, fillH: 4.0 },
      fees: 0, maxN: { express: 1500, patient: 4000 }, defaultN: 300,
      flags: { crush: 0.24, rich: false, stale: [], moving: [] },
    }),
    J({
      key: "zenyte", verb: "Cut", out: "Zenyte", skill: "Crafting", members: true,
      levels: [{ s: "Crafting", l: 89 }], unlocks: [], facilities: [], gear: ["Chisel"],
      secs: 1.38, xp: [["Crafting", 200]],
      buys: [{ name: "Uncut zenyte", per: 1, px: { express: 13260000, patient: 13010000 }, fillH: 30 }],
      steps: [{ verb: "Cut", out: "Zenyte", per: 1, at: "", secsEach: 1.2 }],
      sell: { px: { express: 13890000, patient: 14120000 }, fillH: 36 },
      fees: 0, maxN: { express: 2, patient: 4 }, defaultN: 1,
      flags: { crush: 0, rich: true, stale: ["Uncut zenyte"], moving: ["Zenyte"] },
    }),
    J({
      key: "amulet-of-glory", verb: "Craft", out: "Amulet of glory", skill: "Crafting", members: true,
      levels: [{ s: "Crafting", l: 80 }, { s: "Magic", l: 68 }], unlocks: [], facilities: ["Furnace"], gear: ["Amulet mould"],
      secs: 8.6, xp: [["Crafting", 150], ["Magic", 78]],
      buys: [
        { name: "Dragonstone", per: 1, px: { express: 12540, patient: 12310 }, fillH: 8.0 },
        { name: "Gold bar", per: 1, px: { express: 112, patient: 104 }, fillH: 2.0 },
        { name: "Cosmic rune", per: 1, px: { express: 104, patient: 99 }, fillH: 1.5 },
        { name: "Water rune", per: 15, px: { express: 5, patient: 4 }, fillH: 1.0 },
        { name: "Earth rune", per: 15, px: { express: 4, patient: 4 }, fillH: 1.0 },
      ],
      steps: [
        { verb: "Craft", out: "Dragonstone amulet (u)", per: 1, at: "furnace", secsEach: 3.0 },
        { verb: "String", out: "Dragonstone amulet", per: 1, at: "", secsEach: 1.2 },
        { verb: "Enchant", out: "Amulet of glory", per: 1, at: "", secsEach: 3.0 },
      ],
      sell: { px: { express: 13210, patient: 13480 }, fillH: 7.0 },
      fees: 0, maxN: { express: 60, patient: 200 }, defaultN: 50,
      flags: { crush: 0, rich: false, stale: [], moving: [] },
    }),
    J({
      key: "bow-string", verb: "Spin", out: "Bow string", skill: "Crafting", members: false,
      levels: [{ s: "Crafting", l: 10 }], unlocks: [], facilities: ["Spinning wheel"], gear: [],
      secs: 3.45, xp: [["Crafting", 15]],
      buys: [{ name: "Flax", per: 1, px: { express: 46, patient: 41 }, fillH: 2.5 }],
      steps: [{ verb: "Spin", out: "Bow string", per: 1, at: "spinning wheel", secsEach: 3.0 }],
      sell: { px: { express: 92, patient: 99 }, fillH: 3.0 },
      fees: 0, maxN: { express: 3000, patient: 9000 }, defaultN: 150,
      flags: { crush: 0, rich: false, stale: [], moving: [] },
    }),
    J({
      key: "black-dragon-leather", verb: "Tan", out: "Black dragon leather", skill: "", members: true,
      levels: [], unlocks: [], facilities: ["Tannery"], gear: [],
      secs: 1.4, xp: [],
      buys: [{ name: "Black dragonhide", per: 1, px: { express: 2062, patient: 2010 }, fillH: 6.0 }],
      steps: [{ verb: "Tan", out: "Black dragon leather", per: 1, at: "tannery", secsEach: 1.2 }],
      sell: { px: { express: 2150, patient: 2190 }, fillH: 5.0 },
      fees: 20, maxN: { express: 900, patient: 2600 }, defaultN: 300,
      flags: { crush: 0, rich: false, stale: [], moving: [] },
    }),
    J({
      key: "unpowered-orb", verb: "Blow", out: "Unpowered orb", skill: "Crafting", members: true,
      levels: [{ s: "Crafting", l: 46 }], unlocks: [], facilities: [], gear: ["Glassblowing pipe"],
      secs: 2.3, xp: [["Crafting", 52.5]],
      buys: [{ name: "Molten glass", per: 1, px: { express: 58, patient: 52 }, fillH: 2.0 }],
      steps: [{ verb: "Blow", out: "Unpowered orb", per: 1, at: "", secsEach: 2.0 }],
      sell: { px: { express: 88, patient: 96 }, fillH: 3.5 },
      fees: 0, maxN: { express: 2000, patient: 6000 }, defaultN: 200,
      flags: { crush: 0, rich: false, stale: [], moving: [] },
    }),
    J({
      key: "magic-longbow", verb: "Fletch", out: "Magic longbow", skill: "Fletching", members: true,
      levels: [{ s: "Fletching", l: 85 }], unlocks: [], facilities: [], gear: [],
      secs: 2.76, xp: [["Fletching", 91.5]],
      buys: [
        { name: "Magic logs", per: 1, px: { express: 1058, patient: 1024 }, fillH: 6.0 },
        { name: "Bow string", per: 1, px: { express: 99, patient: 92 }, fillH: 3.0 },
      ],
      steps: [
        { verb: "Fletch", out: "Magic longbow (u)", per: 1, at: "", secsEach: 1.2 },
        { verb: "String", out: "Magic longbow", per: 1, at: "", secsEach: 1.2 },
      ],
      sell: { px: { express: 1236, patient: 1262 }, fillH: 5.0 },
      fees: 0, maxN: { express: 500, patient: 1400 }, defaultN: 150,
      flags: { crush: 0, rich: false, stale: [], moving: [] },
    }),
    J({
      key: "broad-arrows", verb: "Fletch", out: "Broad arrows", skill: "Fletching", members: true,
      levels: [{ s: "Fletching", l: 52 }], unlocks: ["Broader Fletching"], facilities: [], gear: [],
      secs: 0.09, xp: [["Fletching", 10]],
      buys: [
        { name: "Broad arrowheads", per: 1, px: { express: 56, patient: 53 }, fillH: 2.0 },
        { name: "Headless arrow", per: 1, px: { express: 44, patient: 42 }, fillH: 2.0 },
      ],
      steps: [{ verb: "Fletch", out: "Broad arrows", per: 1, at: "", secsEach: 0.08, qtyPer: 15 }],
      sell: { px: { express: 112, patient: 118 }, fillH: 3.0 },
      fees: 0, maxN: { express: 10000, patient: 30000 }, defaultN: 5000,
      flags: { crush: 0, rich: false, stale: [], moving: [] },
    }),
    J({
      key: "yew-longbow-u", verb: "Fletch", out: "Yew longbow (u)", skill: "Fletching", members: false,
      levels: [{ s: "Fletching", l: 70 }], unlocks: [], facilities: [], gear: [],
      secs: 1.38, xp: [["Fletching", 75]],
      buys: [{ name: "Yew logs", per: 1, px: { express: 188, patient: 181 }, fillH: 3.0 }],
      steps: [{ verb: "Fletch", out: "Yew longbow (u)", per: 1, at: "", secsEach: 1.2 }],
      sell: { px: { express: 198, patient: 209 }, fillH: 4.0 },
      fees: 0, maxN: { express: 2500, patient: 7000 }, defaultN: 300,
      flags: { crush: 0, rich: false, stale: [], moving: [] },
    }),
    J({
      key: "karambwan", verb: "Cook", out: "Cooked karambwan", skill: "Cooking", members: true,
      levels: [{ s: "Cooking", l: 30 }], unlocks: ["Tai Bwo Wannai Trio"], facilities: ["Cooking range"], gear: [],
      secs: 1.38, xp: [["Cooking", 190]],
      buys: [{ name: "Raw karambwan", per: 1, px: { express: 486, patient: 471 }, fillH: 4.0 }],
      steps: [{ verb: "Cook", out: "Cooked karambwan", per: 1, at: "cooking range", secsEach: 1.2 }],
      sell: { px: { express: 552, patient: 568 }, fillH: 4.0 },
      fees: 0, maxN: { express: 3000, patient: 9000 }, defaultN: 300,
      flags: { crush: 0, rich: false, stale: [], moving: [] },
    }),
    J({
      key: "shark", verb: "Cook", out: "Shark", skill: "Cooking", members: true,
      levels: [{ s: "Cooking", l: 80 }], unlocks: [], facilities: ["Cooking range"], gear: [],
      secs: 2.76, xp: [["Cooking", 210]],
      buys: [{ name: "Raw shark", per: 1, px: { express: 893, patient: 871 }, fillH: 5.0 }],
      steps: [{ verb: "Cook", out: "Shark", per: 1, at: "cooking range", secsEach: 2.4 }],
      sell: { px: { express: 862, patient: 884 }, fillH: 4.0 },
      fees: 0, maxN: { express: 2000, patient: 6000 }, defaultN: 150,
      flags: { crush: 0, rich: false, stale: [], moving: [] },
    }),
    J({
      key: "wine", verb: "Make", out: "Jug of wine", skill: "Cooking", members: false,
      levels: [{ s: "Cooking", l: 35 }], unlocks: [], facilities: [], gear: [],
      secs: 1.38, xp: [["Cooking", 200]],
      buys: [
        { name: "Grapes", per: 1, px: { express: 724, patient: 698 }, fillH: 6.0 },
        { name: "Jug of water", per: 1, px: { express: 12, patient: 9 }, fillH: 1.0 },
      ],
      steps: [{ verb: "Make", out: "Jug of wine", per: 1, at: "", secsEach: 1.2 }],
      sell: { px: { express: 498, patient: 521 }, fillH: 3.0 },
      fees: 0, maxN: { express: 1500, patient: 4500 }, defaultN: 300,
      flags: { crush: 0, rich: false, stale: [], moving: [] },
    }),
    J({
      key: "prayer-potion", verb: "Mix", out: "Prayer potion(3)", skill: "Herblore", members: true,
      levels: [{ s: "Herblore", l: 38 }], unlocks: [], facilities: [], gear: [],
      secs: 2.76, xp: [["Herblore", 87.5]],
      buys: [
        { name: "Ranarr weed", per: 1, px: { express: 7120, patient: 6940 }, fillH: 6.0 },
        { name: "Vial of water", per: 1, px: { express: 6, patient: 4 }, fillH: 1.0 },
        { name: "Snape grass", per: 1, px: { express: 468, patient: 452 }, fillH: 3.0 },
      ],
      steps: [
        { verb: "Mix", out: "Ranarr potion (unf)", per: 1, at: "", secsEach: 1.2 },
        { verb: "Mix", out: "Prayer potion(3)", per: 1, at: "", secsEach: 1.2 },
      ],
      sell: { px: { express: 9260, patient: 9440 }, fillH: 4.0 },
      fees: 0, maxN: { express: 600, patient: 1800 }, defaultN: 150,
      flags: { crush: 0, rich: false, stale: [], moving: [] },
    }),
    J({
      key: "super-restore", verb: "Mix", out: "Super restore(3)", skill: "Herblore", members: true,
      levels: [{ s: "Herblore", l: 63 }], unlocks: [], facilities: [], gear: [],
      secs: 2.76, xp: [["Herblore", 142.5]],
      buys: [
        { name: "Snapdragon", per: 1, px: { express: 8810, patient: 8620 }, fillH: 7.0 },
        { name: "Vial of water", per: 1, px: { express: 6, patient: 4 }, fillH: 1.0 },
        { name: "Red spiders' eggs", per: 1, px: { express: 912, patient: 884 }, fillH: 4.0 },
      ],
      steps: [
        { verb: "Mix", out: "Snapdragon potion (unf)", per: 1, at: "", secsEach: 1.2 },
        { verb: "Mix", out: "Super restore(3)", per: 1, at: "", secsEach: 1.2 },
      ],
      sell: { px: { express: 10180, patient: 10360 }, fillH: 4.0 },
      fees: 0, maxN: { express: 500, patient: 1500 }, defaultN: 150,
      flags: { crush: 0, rich: false, stale: [], moving: [] },
    }),
    J({
      key: "saradomin-brew", verb: "Mix", out: "Saradomin brew(3)", skill: "Herblore", members: true,
      levels: [{ s: "Herblore", l: 81 }], unlocks: [], facilities: [], gear: ["Pestle and mortar"],
      secs: 4.1, xp: [["Herblore", 180]],
      buys: [
        { name: "Toadflax", per: 1, px: { express: 2410, patient: 2350 }, fillH: 5.0 },
        { name: "Vial of water", per: 1, px: { express: 6, patient: 4 }, fillH: 1.0 },
        { name: "Bird nest", per: 1, px: { express: 5120, patient: 4980 }, fillH: 9.0 },
      ],
      steps: [
        { verb: "Crush", out: "Crushed nest", per: 1, at: "", secsEach: 0.6 },
        { verb: "Mix", out: "Toadflax potion (unf)", per: 1, at: "", secsEach: 1.2 },
        { verb: "Mix", out: "Saradomin brew(3)", per: 1, at: "", secsEach: 1.2 },
      ],
      sell: { px: { express: 7010, patient: 7180 }, fillH: 4.0 },
      fees: 0, maxN: { express: 300, patient: 900 }, defaultN: 100,
      flags: { crush: 0, rich: false, stale: [], moving: [] },
    }),
    J({
      key: "ranarr-weed", verb: "Clean", out: "Ranarr weed", skill: "Herblore", members: true,
      levels: [{ s: "Herblore", l: 25 }], unlocks: [], facilities: [], gear: [],
      secs: 0.69, xp: [["Herblore", 7.5]],
      buys: [{ name: "Grimy ranarr weed", per: 1, px: { express: 6902, patient: 6760 }, fillH: 6.0 }],
      steps: [{ verb: "Clean", out: "Ranarr weed", per: 1, at: "", secsEach: 0.6 }],
      sell: { px: { express: 7120, patient: 7240 }, fillH: 6.0 },
      fees: 0, maxN: { express: 800, patient: 2400 }, defaultN: 500,
      flags: { crush: 0, rich: false, stale: [], moving: [] },
    }),
    J({
      key: "high-alch-yew-longbow", verb: "High alch", out: "Yew longbow", skill: "Magic", members: false, alch: true,
      levels: [{ s: "Magic", l: 55 }], unlocks: [], facilities: [], gear: [], fireStaff: true,
      secs: 3.45, xp: [["Magic", 65]],
      buys: [
        { name: "Yew longbow", per: 1, px: { express: 542, patient: 528 }, fillH: 4.0 },
        { name: "Nature rune", per: 1, px: { express: 112, patient: 108 }, fillH: 1.0 },
        { name: "Fire rune", per: 5, px: { express: 4, patient: 4 }, fillH: 1.0 },
      ],
      steps: [{ verb: "High alch", out: "Yew longbow", per: 1, at: "", secsEach: 3.0 }],
      sell: { px: { express: 768, patient: 768 }, fillH: 0, alchValue: true },
      fees: 0, maxN: { express: 700, patient: 2000 }, defaultN: 150,
      flags: { crush: 0, rich: false, stale: [], moving: [] },
    }),
    J({
      key: "low-alch-steel-platebody", verb: "Low alch", out: "Steel platebody", skill: "Magic", members: false, alch: true,
      levels: [{ s: "Magic", l: 21 }], unlocks: [], facilities: [], gear: [], fireStaff: true,
      secs: 2.07, xp: [["Magic", 31]],
      buys: [
        { name: "Steel platebody", per: 1, px: { express: 706, patient: 688 }, fillH: 3.0 },
        { name: "Nature rune", per: 1, px: { express: 112, patient: 108 }, fillH: 1.0 },
        { name: "Fire rune", per: 3, px: { express: 4, patient: 4 }, fillH: 1.0 },
      ],
      steps: [{ verb: "Low alch", out: "Steel platebody", per: 1, at: "", secsEach: 1.8 }],
      sell: { px: { express: 800, patient: 800 }, fillH: 0, alchValue: true },
      fees: 0, maxN: { express: 400, patient: 1200 }, defaultN: 200,
      flags: { crush: 0, rich: false, stale: [], moving: [] },
    }),
    J({
      key: "ring-of-recoil", verb: "Enchant", out: "Ring of recoil", skill: "Magic", members: false,
      levels: [{ s: "Magic", l: 7 }], unlocks: [], facilities: [], gear: [],
      secs: 3.45, xp: [["Magic", 17.5]],
      buys: [
        { name: "Sapphire ring", per: 1, px: { express: 652, patient: 631 }, fillH: 3.0 },
        { name: "Cosmic rune", per: 1, px: { express: 104, patient: 99 }, fillH: 1.5 },
        { name: "Water rune", per: 1, px: { express: 5, patient: 4 }, fillH: 1.0 },
      ],
      steps: [{ verb: "Enchant", out: "Ring of recoil", per: 1, at: "", secsEach: 3.0 }],
      sell: { px: { express: 946, patient: 972 }, fillH: 4.0 },
      fees: 0, maxN: { express: 900, patient: 2500 }, defaultN: 150,
      flags: { crush: 0, rich: false, stale: [], moving: [] },
    }),
    J({
      key: "combat-bracelet", verb: "Enchant", out: "Combat bracelet", skill: "Magic", members: true,
      levels: [{ s: "Magic", l: 68 }], unlocks: [], facilities: [], gear: [],
      secs: 3.45, xp: [["Magic", 78]],
      buys: [
        { name: "Dragonstone bracelet", per: 1, px: { express: 12610, patient: 12380 }, fillH: 8.0 },
        { name: "Cosmic rune", per: 1, px: { express: 104, patient: 99 }, fillH: 1.5 },
        { name: "Water rune", per: 15, px: { express: 5, patient: 4 }, fillH: 1.0 },
        { name: "Earth rune", per: 15, px: { express: 4, patient: 4 }, fillH: 1.0 },
      ],
      steps: [{ verb: "Enchant", out: "Combat bracelet", per: 1, at: "", secsEach: 3.0 }],
      sell: { px: { express: 13520, patient: 13790 }, fillH: 7.0 },
      fees: 0, maxN: { express: 80, patient: 240 }, defaultN: 50,
      flags: { crush: 0, rich: false, stale: [], moving: [] },
    }),
    J({
      key: "spin-flax", verb: "Cast", out: "Bow string", skill: "Magic", members: true,
      levels: [{ s: "Magic", l: 76 }, { s: "Crafting", l: 10 }], unlocks: ["Lunar Diplomacy"], facilities: [], gear: [],
      secs: 0.69, xp: [["Magic", 15], ["Crafting", 15]],
      buys: [
        { name: "Flax", per: 1, px: { express: 46, patient: 41 }, fillH: 2.5 },
        { name: "Astral rune", per: 0.2, px: { express: 128, patient: 121 }, fillH: 1.5 },
        { name: "Nature rune", per: 0.4, px: { express: 112, patient: 108 }, fillH: 1.0 },
        { name: "Air rune", per: 1, px: { express: 4, patient: 4 }, fillH: 1.0 },
      ],
      steps: [{ verb: "Cast", out: "Bow string", per: 1, at: "", secsEach: 0.6, qtyPer: 5 }],
      sell: { px: { express: 92, patient: 99 }, fillH: 3.0 },
      fees: 0, maxN: { express: 3000, patient: 9000 }, defaultN: 500,
      flags: { crush: 0, rich: false, stale: [], moving: [] },
    }),
  ];

  /* ---------- the desk's arithmetic, identical for every prototype ---------- */
  const CAPTURE = 0.5;
  const geTax = (px) => (px < 50 ? 0 : Math.min(Math.floor(px * 0.02), 5000000));

  // per-unit numbers for a job in a mode
  function unit(job, mode) {
    const cost = job.buys.reduce((s, b) => s + b.per * b.px[mode], 0) + job.fees;
    const sellRaw = job.sell.px[mode];
    const sellNet = job.alch ? sellRaw : sellRaw - geTax(sellRaw);
    return { cost, sellRaw, sellNet, profit: sellNet - cost, tax: job.alch ? 0 : geTax(sellRaw) };
  }

  // the whole batch: outlay, pay, xp, and the clocks
  function math(job, mode, n) {
    const u = unit(job, mode);
    const workH = (n * job.secs) / 3600;
    const buyClock = mode === "patient" ? Math.max(0, ...job.buys.map((b) => (b.fillH * n) / job.maxN.patient * 2)) : 0;
    const sellClock = mode === "patient" && !job.alch ? (job.sell.fillH * n) / job.maxN.patient * 2 : 0;
    const totalH = workH + Math.max(buyClock, 0) + sellClock + 2 / 60;
    const cost = Math.round(n * u.cost);
    const profit = Math.round(n * u.profit);
    return {
      n, cost, profit, profitUnit: u.profit, sellUnit: u.sellNet, sellRaw: u.sellRaw, tax: u.tax,
      workH, buyClock, sellClock, totalH,
      roi: cost > 0 ? (profit / cost) * 100 : 0,
      xp: job.xp.map(([s, v]) => [s, v * n]),
      gpPerXp: (skill) => { const x = job.xp.find(([s]) => s === skill)?.[1] || 0; return x > 0 ? u.profit / x : null; },
      lines: {
        buys: job.buys.map((b) => ({ ...b, qty: Math.ceil(b.per * n), unitPx: b.px[mode], total: Math.ceil(b.per * n) * b.px[mode], fillH: mode === "patient" ? Math.max(1, (b.fillH * n) / job.maxN.patient * 2) : 0 })),
        fees: Math.round(job.fees * n),
        steps: job.steps.map((s) => ({ ...s, count: Math.ceil(s.per * n), hours: (Math.ceil(s.per * n) * s.secsEach * 1.15) / 3600 })),
      },
      capped: n >= job.maxN[mode],
    };
  }

  // can the player on this sheet start the job?
  function canDo(job, sheet) {
    if (job.members && !sheet.members) return false;
    for (const q of job.levels) if ((+sheet.skills[q.s] || 1) < q.l) return false;
    for (const u of job.unlocks) if (!sheet.quests[u]) return false;
    return true;
  }
  // why not? the first blocker, as a short phrase
  function blocker(job, sheet) {
    if (job.members && !sheet.members) return "members only";
    for (const q of job.levels) if ((+sheet.skills[q.s] || 1) < q.l) return `${q.s} ${q.l}`;
    for (const u of job.unlocks) if (!sheet.quests[u]) return u;
    return null;
  }

  // the board's default order: best total pay at the default batch first
  function rank(jobs, mode, focus) {
    const arr = jobs.filter((j) => {
      const p = unit(j, mode).profit;
      if (focus) return j.xp.some(([s, v]) => s === focus && v > 0);
      return p > 0;
    });
    if (focus) arr.sort((a, b) => (-unit(a, mode).profit / (a.xp.find(([s]) => s === focus)?.[1] || 1)) - (-unit(b, mode).profit / (b.xp.find(([s]) => s === focus)?.[1] || 1)));
    else arr.sort((a, b) => unit(b, mode).profit * b.defaultN - unit(a, mode).profit * a.defaultN);
    return arr;
  }

  /* ---------- formats ---------- */
  const fmtGp = (n) => {
    if (n == null || isNaN(n)) return "–";
    const neg = n < 0 ? "-" : ""; const x = Math.abs(n);
    if (x >= 1e9) return neg + (x / 1e9).toFixed(x >= 1e10 ? 1 : 2) + "b";
    if (x >= 1e6) return neg + (x / 1e6).toFixed(x >= 1e7 ? 1 : 2) + "m";
    if (x >= 10000) return neg + (x / 1000).toFixed(1) + "k";
    return neg + Math.round(x).toLocaleString();
  };
  const fmtFull = (n) => (n == null ? "–" : Math.round(n).toLocaleString());
  const fmtDur = (h) => {
    if (h == null || !isFinite(h)) return "—";
    const m = h * 60;
    if (m < 1) return "<1 min";
    if (m < 60) return Math.round(m) + " min";
    if (h < 48) return (h < 10 ? h.toFixed(1) : Math.round(h)) + " hr";
    return Math.round(h / 24) + " days";
  };
  const fmtXp = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1) + "m" : n >= 10000 ? (n / 1000).toFixed(1) + "k" : n >= 100 ? Math.round(n).toLocaleString() : String(+n.toFixed(1)));
  const fmtGpx = (g) => (Math.abs(g) >= 100 ? Math.round(Math.abs(g)).toLocaleString() : Math.abs(g).toFixed(Math.abs(g) >= 10 ? 1 : 2));
  const niceRound = (n) => {
    if (n <= 10) return Math.max(1, Math.round(n));
    const pow = 10 ** Math.floor(Math.log10(n)); const m = n / pow;
    return Math.round((m < 1.5 ? 1 : m < 2.5 ? 2 : m < 3.5 ? 3 : m < 4.5 ? 4 : m < 7.5 ? 5 : 10) * pow);
  };

  window.JB = { SKILLS, SKILL_GLYPH, SHEET, JOBS, math, unit, canDo, blocker, rank, unlockNote, gearNote, fmtGp, fmtFull, fmtDur, fmtXp, fmtGpx, niceRound, geTax };
})();
