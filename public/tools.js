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
          name: "Flip Desk",
          description: "Grand Exchange flipping desk — margins, GE tax, volume and risk, with live OSRS Wiki prices.",
          path: "tools/runescape/flip-desk.html",
        },
        {
          name: "Gielinor Crafting Web",
          description: "Every craftable item in OSRS as an explorable 3D web of recipes.",
          path: "tools/runescape/osrs-crafting-web-3d.html",
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
