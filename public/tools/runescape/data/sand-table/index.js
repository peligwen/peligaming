// The Sand Table's encounter roster, in the order the board shows them
// (grouped by `group` inside the app). Each id is a file under encounters/.
// Add an id here when its file lands; the validator checks every listed id.
window.SAND_TABLE = window.SAND_TABLE || {};
window.SAND_TABLE.ids = [
  // raids
  "cox", "tob",
  // group bosses
  "hueycoatl", "nex", "corporeal-beast", "gwd-graardor", "gwd-kril", "gwd-zilyana", "gwd-kreearra",
  // solo bosses
  "scurrius", "brutus", "obor", "bryophyta", "king-black-dragon", "dagannoth-kings", "kalphite-queen", "zulrah", "vorkath", "phantom-muspah", "vardorvis", "duke-sucellus", "whisperer", "leviathan", "araxxor", "amoxliatl", "maggot-king", "mad-angel", "doom-of-mokhaiotl",
  // slayer bosses
  "shellbane-gryphon",
  // wilderness bosses
  "callisto", "vetion", "venenatis", "chaos-elemental", "scorpia", "chaos-fanatic", "crazy-archaeologist",
  // challenges
  "fight-caves", "inferno", "colosseum", "gauntlet",
  // skilling bosses
  "wintertodt", "tempoross", "zalcano",
];
// Planned, not yet written (see docs/sand-table/AUTHORING.md):
// toa, royal-titans, yama, giant-mole, sarachnis, skotizo, nightmare, alchemical-hydra, cerberus, grotesque-guardians, kraken, thermonuclear-smoke-devil, abyssal-sire, barrows, moons-of-peril
