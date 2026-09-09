// ---------------------------------------------------------------------------
// peligaming tool manifest
//
// This file is the single source of truth for the index page. Adding a tool
// is a two-step edit:
//
//   1a. Plain HTML tool (a Claude artifact exported as HTML): drop the file
//       under public/tools/<game>/<name>.html.
//   1b. React/JSX tool: put the .jsx source under tools-src/<game>/, add it
//       to the TOOLS list in scripts/build-tools.mjs, and run
//       `npm run build:tools` (commit the built HTML it writes).
//   2.  Add an entry to the matching game's `tools` array below.
//
// To add a whole new game, add a new object to `games` with a name, an emoji
// icon, an accent color, and a `tools` array.
//
// Entry fields:
//   name        — card title
//   description — one-line card subtitle
//   path        — relative path to the tool page (from the site root)
//   placeholder — optional; true marks the card as awaiting real content
// ---------------------------------------------------------------------------

window.PELIGAMING = {
  games: [
    {
      name: "RuneScape",
      icon: "⚔️",
      accent: "#d9a334",
      tools: [
        {
          name: "Sand Table",
          description: "Boss and raid rehearsals: every fight's requirements ticked against your hiscores, what to expect and what to bring (the worn kit and the 28 slots, with a why on the odd items), and the arena rebuilt tile by tile in 3D with a tick clock you scrub — then a drill mode that grades your prayer switches and your footwork. Chambers, Theatre, Tombs, the Hueycoatl, Scurrius, Zulrah, Vorkath, the Inferno and fifty more.",
          path: "tools/runescape/sand-table.html",
        },
        {
          name: "Job Board",
          description: "Skilling work priced by the Grand Exchange: a ledger of jobs for the professions you tick, sortable by xp/hr, gp/hr, gp per xp and how afk the work is, each with a contract to buy, work and sell — plus a Market Board of the week's going rates and standing orders priced to fill within a day, a Commodities grid of the goods everyone trades with a GEB (Grand Exchange Basket) on every family, and an econ primer.",
          path: "tools/runescape/job-board.html",
        },
        {
          name: "Gielinor Crafting Web",
          description: "Every craftable item in OSRS as an explorable 3D web of recipes, with xp lenses that paint each skill's training map.",
          path: "tools/runescape/osrs-crafting-web-3d.html",
        },
        {
          name: "Naval Pathfinder",
          description: "Chart sailing routes between ports, wrecks and shoals — around krakens, fetid waters and icy seas, weighed against what your own hull and keel can take — and plot courier-task silk roads: port loops that keep every task slot earning, priced in gp/h and xp/h.",
          path: "tools/runescape/naval-pathfinder.html",
        },
        {
          name: "Lingo Cheat Sheet",
          description: "OSRS Spanish for English speakers: a searchable phrasebook of neutral international Spanish for greetings, trading, bossing, the wildy, skilling and clan chat, the game's own Spanglish verbs (dropear, tradear, lurear), chat shorthand, and the regional flavour that tells you where a player is from — click any phrase to copy it, with a chat-spelling toggle for how it is really typed.",
          path: "tools/runescape/lingo-cheat-sheet.html",
        },
      ],
    },
    {
      name: "Fortnite",
      icon: "🪂",
      accent: "#4dd7ff",
      tools: [
        {
          name: "Tactical Terrain",
          description: "The live island in 3D — place an observer to map sightlines and dead ground, probe shots, and read cover before you rotate.",
          path: "tools/fortnite/tactical-map.html",
        },
      ],
    },
    {
      name: "Skyrim",
      icon: "🐉",
      accent: "#8fb4cc",
      tools: [
        {
          name: "Enchanting Simulator",
          description: "Arcane Enchanter loadout planner — max-enchant magnitudes for every slot at 100 Enchanting.",
          path: "tools/skyrim/enchanting-simulator.html",
        },
        {
          name: "Alchemy Lab",
          description: "Brewing planner — the best-value potions and poisons from your ingredient stock, ranked in septims.",
          path: "tools/skyrim/alchemy-lab.html",
        },
      ],
    },
  ],
};
