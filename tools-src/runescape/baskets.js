// The Commodities tab's curated grid: the goods everyone trades, sorted into
// material families and processing stages, plus the recipe-linked pairs
// (logs to planks, ore to bars, bars to cannonballs) whose price ratio the
// game itself keeps honest.
//
// Every family, every stage column and the whole grid is a GEB — a Grand
// Exchange Basket: a fixed load of goods priced at each day's going rates
// and set to 100 at the start of the window, so 104 reads "the same load
// costs 4% more than it did then". The maths lives in basket-model.js.
//
// Items are named, not numbered: names are what the board resolves against
// the wiki's mapping at run time, and a name that has left the game simply
// drops out of its cell. Each family owns its items — nothing sits in two
// families, so "vs family" and the whole-grid basket stay honest — and a
// pair may reach across families (flax is a hide-and-glass raw, bow string
// is a wood refined) or outside the grid entirely (the three-dose potions).

export const STAGES = [
  { key: "raw", name: "Raw", hint: "Gathered, dropped or grown — what the skiller buys" },
  { key: "refined", name: "Refined", hint: "One step along — bars, planks, leather, clean herbs" },
  { key: "product", name: "Product", hint: "What the consumer buys — ammo, food, potions, gear" },
];

// Series colours: the dataviz palette's dark-surface steps in its validated
// slot order (blue, orange, aqua, yellow, magenta, green, violet) — every
// adjacent pair clears the colour-blind and normal-vision floors on the
// chart's #211d17 ground. Colour follows the family, never its rank, so a
// hidden family never repaints the survivors. The whole-grid basket is the
// board's own off-white, dashed: a total, not a category.
export const SLOT_COLORS = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9"];
export const ALL_COLOR = "#f3ecdc";

export const FAMILIES = [
  {
    key: "wood", name: "Wood", slot: 1,
    stages: {
      raw: ["Logs", "Oak logs", "Willow logs", "Maple logs", "Yew logs", "Magic logs", "Teak logs", "Mahogany logs"],
      refined: ["Plank", "Oak plank", "Teak plank", "Mahogany plank", "Arrow shaft", "Bow string"],
      product: ["Yew longbow", "Magic longbow"],
    },
  },
  {
    key: "metal", name: "Metal", slot: 0,
    stages: {
      raw: ["Copper ore", "Tin ore", "Iron ore", "Coal", "Silver ore", "Gold ore", "Mithril ore", "Adamantite ore", "Runite ore"],
      refined: ["Bronze bar", "Iron bar", "Steel bar", "Silver bar", "Gold bar", "Mithril bar", "Adamantite bar", "Runite bar"],
      product: ["Steel nails", "Rune arrowtips", "Adamant dart tip", "Rune dart tip"],
    },
  },
  {
    key: "hide", name: "Hide & glass", slot: 4,
    stages: {
      raw: ["Cowhide", "Green dragonhide", "Blue dragonhide", "Red dragonhide", "Black dragonhide", "Flax", "Bucket of sand", "Soda ash", "Uncut ruby", "Uncut diamond"],
      refined: ["Leather", "Hard leather", "Green dragon leather", "Black dragon leather", "Molten glass", "Ruby", "Diamond"],
      product: ["Black d'hide body", "Unpowered orb"],
    },
  },
  {
    key: "food", name: "Food", slot: 2,
    stages: {
      raw: ["Raw tuna", "Raw lobster", "Raw swordfish", "Raw monkfish", "Raw shark", "Raw karambwan", "Raw anglerfish", "Grapes"],
      refined: [],
      product: ["Tuna", "Lobster", "Swordfish", "Monkfish", "Shark", "Cooked karambwan", "Anglerfish", "Jug of wine"],
    },
  },
  {
    key: "herbs", name: "Herbs", slot: 5,
    stages: {
      raw: ["Grimy ranarr weed", "Grimy toadflax", "Grimy irit leaf", "Grimy avantoe", "Grimy snapdragon", "Grimy torstol",
        "Ranarr seed", "Snapdragon seed", "Vial of water", "Snape grass", "Red spiders' eggs", "Crushed nest", "Amylase crystal"],
      refined: ["Ranarr weed", "Toadflax", "Irit leaf", "Avantoe", "Snapdragon", "Torstol",
        "Ranarr potion (unf)", "Toadflax potion (unf)", "Snapdragon potion (unf)"],
      product: ["Prayer potion(4)", "Super restore(4)", "Saradomin brew(4)", "Stamina potion(4)", "Antifire potion(4)", "Super combat potion(4)"],
    },
  },
  {
    key: "runes", name: "Runes", slot: 6,
    stages: {
      raw: ["Pure essence"],
      refined: [],
      product: ["Air rune", "Fire rune", "Chaos rune", "Death rune", "Blood rune", "Soul rune", "Nature rune", "Law rune", "Cosmic rune", "Astral rune", "Wrath rune"],
    },
  },
  {
    key: "ammo", name: "Ammo", slot: 3,
    stages: {
      raw: ["Feather"],
      refined: ["Headless arrow"],
      product: ["Steel cannonball", "Rune arrow", "Amethyst arrow", "Dragon arrow", "Rune dart", "Dragon dart", "Broad bolts", "Ruby bolts (e)", "Diamond bolts (e)", "Red chinchompa", "Black chinchompa"],
    },
  },
];

// Recipe-linked pairs: `out` × `yield` is what one action makes; `ins` are
// [name, quantity] per action; `fee` is coin paid to an NPC per action. The
// sawmill and tanner fees are the wiki's; smelting takes its coal counts
// from the recipe data; one steel bar casts four cannonballs. Iron bars are
// left out — the furnace loses half the ore without a ring of forging, so
// the ratio wouldn't mean what the others mean.
export const PAIRS = [
  { key: "plank", out: "Plank", ins: [["Logs", 1]], fee: 100, via: "sawmill" },
  { key: "oakplank", out: "Oak plank", ins: [["Oak logs", 1]], fee: 250, via: "sawmill" },
  { key: "teakplank", out: "Teak plank", ins: [["Teak logs", 1]], fee: 500, via: "sawmill" },
  { key: "mahogplank", out: "Mahogany plank", ins: [["Mahogany logs", 1]], fee: 1500, via: "sawmill" },
  { key: "steelbar", out: "Steel bar", ins: [["Iron ore", 1], ["Coal", 2]], via: "furnace" },
  { key: "mithbar", out: "Mithril bar", ins: [["Mithril ore", 1], ["Coal", 4]], via: "furnace" },
  { key: "addybar", out: "Adamantite bar", ins: [["Adamantite ore", 1], ["Coal", 6]], via: "furnace" },
  { key: "runebar", out: "Runite bar", ins: [["Runite ore", 1], ["Coal", 8]], via: "furnace" },
  { key: "goldbar", out: "Gold bar", ins: [["Gold ore", 1]], via: "furnace" },
  { key: "cball", out: "Steel cannonball", yield: 4, ins: [["Steel bar", 1]], via: "ammo mould" },
  { key: "bowstring", out: "Bow string", ins: [["Flax", 1]], via: "spinning wheel" },
  { key: "leather", out: "Leather", ins: [["Cowhide", 1]], fee: 1, via: "tanner" },
  { key: "greenleather", out: "Green dragon leather", ins: [["Green dragonhide", 1]], fee: 20, via: "tanner" },
  { key: "blackleather", out: "Black dragon leather", ins: [["Black dragonhide", 1]], fee: 20, via: "tanner" },
  { key: "glass", out: "Molten glass", ins: [["Bucket of sand", 1], ["Soda ash", 1]], via: "furnace" },
  { key: "ruby", out: "Ruby", ins: [["Uncut ruby", 1]], via: "chisel" },
  { key: "diamond", out: "Diamond", ins: [["Uncut diamond", 1]], via: "chisel" },
  { key: "yewbow", out: "Yew longbow", ins: [["Yew logs", 1], ["Bow string", 1]], via: "knife" },
  { key: "magicbow", out: "Magic longbow", ins: [["Magic logs", 1], ["Bow string", 1]], via: "knife" },
  { key: "headless", out: "Headless arrow", ins: [["Arrow shaft", 1], ["Feather", 1]], via: "fletching" },
  { key: "runearrow", out: "Rune arrow", ins: [["Headless arrow", 1], ["Rune arrowtips", 1]], via: "fletching" },
  { key: "shark", out: "Shark", ins: [["Raw shark", 1]], via: "range" },
  { key: "monkfish", out: "Monkfish", ins: [["Raw monkfish", 1]], via: "range" },
  { key: "karambwan", out: "Cooked karambwan", ins: [["Raw karambwan", 1]], via: "range" },
  { key: "anglerfish", out: "Anglerfish", ins: [["Raw anglerfish", 1]], via: "range" },
  { key: "wine", out: "Jug of wine", ins: [["Grapes", 1]], via: "jug of water" },
  { key: "ranarr", out: "Ranarr weed", ins: [["Grimy ranarr weed", 1]], via: "cleaning" },
  { key: "snapdragon", out: "Snapdragon", ins: [["Grimy snapdragon", 1]], via: "cleaning" },
  { key: "toadflax", out: "Toadflax", ins: [["Grimy toadflax", 1]], via: "cleaning" },
  { key: "ranarrunf", out: "Ranarr potion (unf)", ins: [["Ranarr weed", 1], ["Vial of water", 1]], via: "mixing" },
  { key: "prayer", out: "Prayer potion(3)", ins: [["Ranarr potion (unf)", 1], ["Snape grass", 1]], via: "mixing" },
  { key: "restore", out: "Super restore(3)", ins: [["Snapdragon potion (unf)", 1], ["Red spiders' eggs", 1]], via: "mixing" },
  { key: "brew", out: "Saradomin brew(3)", ins: [["Toadflax potion (unf)", 1], ["Crushed nest", 1]], via: "mixing" },
];

// every name the tab needs history for: the grid, then whatever the pairs
// reach for outside it
export function basketNames() {
  const seen = new Set();
  for (const f of FAMILIES) for (const list of Object.values(f.stages)) for (const n of list) seen.add(n);
  for (const p of PAIRS) { seen.add(p.out); for (const [n] of p.ins) seen.add(n); }
  return [...seen];
}
