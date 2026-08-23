// ---------------------------------------------------------------------------
// peligaming tool manifest
//
// This file is the single source of truth for the index page. Adding a tool
// is a two-step edit:
//
//   1. Drop the tool's HTML file under public/tools/<game>/<name>.html
//      (a Claude artifact exports as a single self-contained HTML file).
//   2. Add an entry to the matching game's `tools` array below.
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
          name: "RuneScape Tool",
          description: "Placeholder — replace tools/runescape/index.html with your exported artifact.",
          path: "tools/runescape/index.html",
          placeholder: true,
        },
      ],
    },
    {
      name: "Skyrim",
      icon: "🐉",
      accent: "#8fb4cc",
      tools: [
        {
          name: "Skyrim Tool",
          description: "Placeholder — replace tools/skyrim/index.html with your exported artifact.",
          path: "tools/skyrim/index.html",
          placeholder: true,
        },
      ],
    },
  ],
};
