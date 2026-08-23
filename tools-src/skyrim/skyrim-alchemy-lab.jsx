import { useState, useMemo, useEffect } from "react";

/* ============================================================
   DATA — effects: [baseCost, baseMagnitude, baseDuration, harmful]
   Values follow the game's pricing curve (cost · mag^1.1 · (dur/10)^1.1)
   and are approximations meant for ranking, not exact in-game gold.
   ============================================================ */
const FX = {
  "Cure Disease": [0.5, 5, 0, false],
  "Damage Health": [3, 2, 0, true],
  "Damage Magicka": [2.2, 3, 0, true],
  "Damage Magicka Regen": [0.5, 100, 5, true],
  "Damage Stamina": [1.8, 3, 0, true],
  "Damage Stamina Regen": [0.3, 100, 5, true],
  "Fear": [5, 1, 30, true],
  "Fortify Alteration": [0.05, 4, 60, false],
  "Fortify Barter": [2, 1, 30, false],
  "Fortify Block": [0.5, 5, 60, false],
  "Fortify Carry Weight": [0.15, 4, 300, false],
  "Fortify Conjuration": [0.25, 5, 60, false],
  "Fortify Destruction": [0.5, 5, 60, false],
  "Fortify Enchanting": [0.6, 4, 30, false],
  "Fortify Health": [0.35, 4, 60, false],
  "Fortify Heavy Armor": [0.5, 2, 60, false],
  "Fortify Illusion": [0.4, 4, 60, false],
  "Fortify Light Armor": [0.5, 2, 60, false],
  "Fortify Lockpicking": [0.25, 2, 30, false],
  "Fortify Magicka": [0.3, 4, 60, false],
  "Fortify Marksman": [0.5, 4, 60, false],
  "Fortify One-handed": [0.5, 4, 60, false],
  "Fortify Pickpocket": [0.25, 2, 60, false],
  "Fortify Restoration": [0.5, 4, 60, false],
  "Fortify Smithing": [0.75, 4, 30, false],
  "Fortify Sneak": [0.5, 4, 60, false],
  "Fortify Stamina": [0.3, 4, 60, false],
  "Fortify Two-handed": [0.5, 4, 60, false],
  "Frenzy": [15, 1, 10, true],
  "Invisibility": [100, 0, 4, false],
  "Lingering Damage Health": [1.5, 1, 10, true],
  "Lingering Damage Magicka": [1, 1, 10, true],
  "Lingering Damage Stamina": [1.8, 1, 10, true],
  "Paralysis": [500, 0, 1, true],
  "Ravage Health": [0.4, 2, 10, true],
  "Ravage Magicka": [1, 2, 10, true],
  "Ravage Stamina": [0.4, 2, 10, true],
  "Regenerate Health": [0.1, 5, 300, false],
  "Regenerate Magicka": [0.1, 5, 300, false],
  "Regenerate Stamina": [0.1, 5, 300, false],
  "Resist Fire": [0.5, 3, 60, false],
  "Resist Frost": [0.5, 3, 60, false],
  "Resist Magic": [1, 1, 60, false],
  "Resist Poison": [0.5, 4, 60, false],
  "Resist Shock": [0.5, 3, 60, false],
  "Restore Health": [0.5, 5, 0, false],
  "Restore Magicka": [0.6, 5, 0, false],
  "Restore Stamina": [0.6, 5, 0, false],
  "Slow": [1, 50, 5, true],
  "Waterbreathing": [30, 0, 5, false],
  "Weakness to Fire": [0.6, 3, 30, true],
  "Weakness to Frost": [0.5, 3, 30, true],
  "Weakness to Magic": [1, 2, 30, true],
  "Weakness to Poison": [1, 2, 30, true],
  "Weakness to Shock": [0.7, 3, 30, true],
};

const EFFECT_NAMES = Object.keys(FX);
const EFFECT_INDEX = Object.fromEntries(EFFECT_NAMES.map((n, i) => [n, i]));

/* Ingredient-specific value multipliers (the famous outliers) */
const SPECIAL = {
  "Giant's Toe|Fortify Health": 5.9,
  "Salmon Roe|Waterbreathing": 12.5,
  "River Betty|Damage Health": 2.5,
  "Deathbell|Damage Health": 1.5,
};

/* name, [4 effects], dlc tag (optional) */
const RAW_INGREDIENTS = [
  ["Abecean Longfin", ["Weakness to Frost", "Fortify Sneak", "Weakness to Poison", "Fortify Restoration"]],
  ["Bear Claws", ["Restore Stamina", "Fortify Health", "Fortify One-handed", "Damage Magicka Regen"]],
  ["Bee", ["Restore Stamina", "Ravage Stamina", "Regenerate Stamina", "Weakness to Shock"]],
  ["Beehive Husk", ["Resist Poison", "Fortify Light Armor", "Fortify Sneak", "Fortify Destruction"]],
  ["Bleeding Crown", ["Weakness to Fire", "Fortify Block", "Weakness to Poison", "Resist Magic"]],
  ["Blisterwort", ["Damage Stamina", "Frenzy", "Restore Health", "Fortify Smithing"]],
  ["Blue Butterfly Wing", ["Damage Stamina", "Fortify Conjuration", "Damage Magicka Regen", "Fortify Enchanting"]],
  ["Blue Dartwing", ["Resist Shock", "Fortify Pickpocket", "Restore Health", "Fear"]],
  ["Blue Mountain Flower", ["Restore Health", "Fortify Conjuration", "Fortify Health", "Damage Magicka Regen"]],
  ["Bone Meal", ["Damage Stamina", "Resist Fire", "Fortify Conjuration", "Ravage Stamina"]],
  ["Briar Heart", ["Restore Magicka", "Fortify Block", "Paralysis", "Fortify Magicka"]],
  ["Butterfly Wing", ["Restore Health", "Fortify Barter", "Lingering Damage Stamina", "Damage Magicka"]],
  ["Canis Root", ["Damage Stamina", "Fortify One-handed", "Fortify Marksman", "Paralysis"]],
  ["Charred Skeever Hide", ["Restore Stamina", "Cure Disease", "Resist Poison", "Restore Health"]],
  ["Chaurus Eggs", ["Weakness to Poison", "Fortify Stamina", "Damage Magicka", "Invisibility"]],
  ["Chaurus Hunter Antennae", ["Damage Stamina", "Fortify Conjuration", "Damage Magicka Regen", "Fortify Enchanting"], "DG"],
  ["Chicken's Egg", ["Resist Magic", "Damage Magicka Regen", "Waterbreathing", "Lingering Damage Stamina"]],
  ["Creep Cluster", ["Restore Magicka", "Damage Stamina Regen", "Fortify Carry Weight", "Weakness to Magic"]],
  ["Crimson Nirnroot", ["Damage Health", "Damage Stamina", "Invisibility", "Resist Magic"]],
  ["Cyrodilic Spadetail", ["Damage Stamina", "Fortify Restoration", "Fear", "Ravage Health"]],
  ["Daedra Heart", ["Restore Health", "Damage Stamina Regen", "Damage Magicka", "Fear"]],
  ["Deathbell", ["Damage Health", "Ravage Stamina", "Slow", "Weakness to Poison"]],
  ["Dragon's Tongue", ["Resist Fire", "Fortify Barter", "Fortify Illusion", "Fortify Two-handed"]],
  ["Dwarven Oil", ["Weakness to Magic", "Fortify Illusion", "Regenerate Magicka", "Restore Magicka"]],
  ["Ectoplasm", ["Restore Magicka", "Fortify Destruction", "Fortify Magicka", "Damage Health"]],
  ["Elves Ear", ["Restore Magicka", "Fortify Marksman", "Weakness to Frost", "Resist Fire"]],
  ["Eye of Sabre Cat", ["Restore Stamina", "Ravage Health", "Damage Magicka", "Restore Health"]],
  ["Falmer Ear", ["Damage Health", "Frenzy", "Resist Poison", "Fortify Lockpicking"]],
  ["Fire Salts", ["Weakness to Frost", "Resist Fire", "Restore Magicka", "Regenerate Magicka"]],
  ["Fly Amanita", ["Resist Fire", "Fortify Two-handed", "Frenzy", "Regenerate Stamina"]],
  ["Frost Mirriam", ["Resist Frost", "Fortify Sneak", "Ravage Magicka", "Damage Stamina Regen"]],
  ["Frost Salts", ["Weakness to Fire", "Resist Frost", "Restore Magicka", "Fortify Conjuration"]],
  ["Garlic", ["Resist Poison", "Fortify Stamina", "Regenerate Magicka", "Regenerate Health"]],
  ["Giant Lichen", ["Weakness to Shock", "Ravage Health", "Weakness to Poison", "Restore Magicka"]],
  ["Giant's Toe", ["Damage Stamina", "Fortify Health", "Fortify Carry Weight", "Damage Stamina Regen"]],
  ["Gleamblossom", ["Regenerate Health", "Fear", "Waterbreathing", "Paralysis"], "DG"],
  ["Glow Dust", ["Damage Magicka", "Damage Magicka Regen", "Fortify Destruction", "Resist Shock"]],
  ["Glowing Mushroom", ["Resist Shock", "Fortify Destruction", "Fortify Smithing", "Fortify Health"]],
  ["Grass Pod", ["Resist Poison", "Ravage Magicka", "Fortify Alteration", "Restore Magicka"]],
  ["Hagraven Claw", ["Resist Magic", "Lingering Damage Magicka", "Fortify Enchanting", "Fortify Barter"]],
  ["Hagraven Feathers", ["Damage Magicka", "Fortify Conjuration", "Frenzy", "Weakness to Shock"]],
  ["Hanging Moss", ["Damage Magicka", "Fortify Health", "Damage Magicka Regen", "Fortify One-handed"]],
  ["Hawk Beak", ["Restore Stamina", "Resist Frost", "Fortify Carry Weight", "Resist Shock"]],
  ["Hawk Feathers", ["Cure Disease", "Fortify Light Armor", "Fortify One-handed", "Fortify Sneak"]],
  ["Histcarp", ["Restore Stamina", "Fortify Magicka", "Damage Stamina Regen", "Waterbreathing"]],
  ["Honeycomb", ["Restore Stamina", "Fortify Block", "Fortify Light Armor", "Ravage Stamina"]],
  ["Human Flesh", ["Damage Health", "Paralysis", "Restore Magicka", "Fortify Sneak"]],
  ["Human Heart", ["Damage Health", "Damage Magicka", "Damage Magicka Regen", "Frenzy"]],
  ["Ice Wraith Teeth", ["Weakness to Frost", "Fortify Heavy Armor", "Invisibility", "Weakness to Fire"]],
  ["Imp Stool", ["Damage Health", "Lingering Damage Health", "Paralysis", "Restore Health"]],
  ["Jazbay Grapes", ["Weakness to Magic", "Fortify Magicka", "Regenerate Magicka", "Ravage Health"]],
  ["Juniper Berries", ["Weakness to Fire", "Fortify Marksman", "Regenerate Health", "Damage Stamina Regen"]],
  ["Large Antlers", ["Restore Stamina", "Fortify Stamina", "Slow", "Damage Stamina Regen"]],
  ["Lavender", ["Resist Magic", "Fortify Stamina", "Ravage Magicka", "Fortify Conjuration"]],
  ["Luna Moth Wing", ["Damage Magicka", "Fortify Light Armor", "Regenerate Health", "Invisibility"]],
  ["Moon Sugar", ["Weakness to Fire", "Resist Frost", "Restore Magicka", "Regenerate Magicka"]],
  ["Mora Tapinella", ["Restore Magicka", "Lingering Damage Health", "Regenerate Stamina", "Fortify Illusion"]],
  ["Mudcrab Chitin", ["Restore Stamina", "Cure Disease", "Resist Poison", "Resist Fire"]],
  ["Namira's Rot", ["Damage Magicka", "Fortify Lockpicking", "Fear", "Regenerate Health"]],
  ["Nightshade", ["Damage Health", "Damage Magicka Regen", "Lingering Damage Stamina", "Fortify Destruction"]],
  ["Nirnroot", ["Damage Health", "Damage Stamina", "Invisibility", "Resist Magic"]],
  ["Nordic Barnacle", ["Damage Magicka", "Waterbreathing", "Regenerate Health", "Fortify Pickpocket"]],
  ["Orange Dartwing", ["Restore Stamina", "Ravage Magicka", "Fortify Pickpocket", "Lingering Damage Health"]],
  ["Pearl", ["Restore Stamina", "Fortify Block", "Restore Magicka", "Resist Shock"]],
  ["Pine Thrush Egg", ["Restore Stamina", "Fortify Lockpicking", "Weakness to Poison", "Resist Shock"]],
  ["Poison Bloom", ["Damage Health", "Slow", "Fortify Carry Weight", "Fear"], "DG"],
  ["Powdered Mammoth Tusk", ["Restore Stamina", "Fortify Sneak", "Weakness to Fire", "Fear"]],
  ["Purple Mountain Flower", ["Restore Stamina", "Fortify Sneak", "Lingering Damage Magicka", "Resist Frost"]],
  ["Red Mountain Flower", ["Restore Magicka", "Ravage Magicka", "Fortify Magicka", "Damage Health"]],
  ["River Betty", ["Damage Health", "Fortify Alteration", "Slow", "Fortify Carry Weight"]],
  ["Rock Warbler Egg", ["Restore Health", "Fortify One-handed", "Damage Stamina", "Weakness to Magic"]],
  ["Sabre Cat Tooth", ["Restore Stamina", "Fortify Heavy Armor", "Fortify Smithing", "Weakness to Poison"]],
  ["Salmon Roe", ["Restore Stamina", "Waterbreathing", "Fortify Magicka", "Regenerate Magicka"], "HF"],
  ["Salt Pile", ["Weakness to Magic", "Fortify Restoration", "Slow", "Regenerate Magicka"]],
  ["Scaly Pholiota", ["Weakness to Magic", "Fortify Illusion", "Regenerate Stamina", "Fortify Carry Weight"]],
  ["Silverside Perch", ["Restore Stamina", "Damage Stamina Regen", "Ravage Health", "Resist Frost"]],
  ["Skeever Tail", ["Damage Stamina Regen", "Ravage Health", "Damage Health", "Fortify Light Armor"]],
  ["Slaughterfish Egg", ["Resist Poison", "Fortify Pickpocket", "Lingering Damage Health", "Fortify Stamina"]],
  ["Slaughterfish Scales", ["Resist Frost", "Lingering Damage Health", "Fortify Heavy Armor", "Fortify Block"]],
  ["Small Antlers", ["Weakness to Poison", "Fortify Restoration", "Lingering Damage Stamina", "Damage Health"]],
  ["Small Pearl", ["Restore Stamina", "Fortify One-handed", "Fortify Restoration", "Resist Frost"]],
  ["Snowberries", ["Resist Fire", "Fortify Enchanting", "Resist Frost", "Resist Shock"]],
  ["Spider Egg", ["Damage Stamina", "Damage Magicka Regen", "Fortify Lockpicking", "Fortify Marksman"]],
  ["Spriggan Sap", ["Damage Magicka Regen", "Fortify Enchanting", "Fortify Smithing", "Fortify Alteration"]],
  ["Swamp Fungal Pod", ["Resist Shock", "Lingering Damage Magicka", "Paralysis", "Restore Health"]],
  ["Taproot", ["Weakness to Magic", "Fortify Illusion", "Regenerate Magicka", "Restore Magicka"]],
  ["Thistle Branch", ["Resist Frost", "Ravage Stamina", "Resist Poison", "Fortify Heavy Armor"]],
  ["Torchbug Thorax", ["Restore Stamina", "Lingering Damage Magicka", "Weakness to Magic", "Fortify Stamina"]],
  ["Troll Fat", ["Resist Poison", "Fortify Two-handed", "Frenzy", "Damage Health"]],
  ["Tundra Cotton", ["Resist Magic", "Fortify Magicka", "Fortify Block", "Fortify Barter"]],
  ["Vampire Dust", ["Invisibility", "Restore Magicka", "Regenerate Health", "Cure Disease"]],
  ["Void Salts", ["Weakness to Shock", "Resist Magic", "Damage Health", "Fortify Magicka"]],
  ["Wheat", ["Restore Health", "Fortify Health", "Damage Stamina Regen", "Lingering Damage Magicka"]],
  ["White Cap", ["Weakness to Frost", "Fortify Heavy Armor", "Restore Magicka", "Ravage Magicka"]],
  ["Wisp Wrappings", ["Restore Stamina", "Fortify Destruction", "Fortify Carry Weight", "Resist Magic"]],
  ["Yellow Mountain Flower", ["Resist Poison", "Fortify Restoration", "Fortify Health", "Damage Stamina Regen"], "DG"],
];

const INGREDIENTS = RAW_INGREDIENTS.map(([name, effects, dlc], id) => {
  let lo = 0, hi = 0;
  for (const e of effects) {
    const i = EFFECT_INDEX[e];
    if (i < 32) lo |= 1 << i; else hi |= 1 << (i - 32);
  }
  const specials = effects
    .map((e) => [EFFECT_INDEX[e], SPECIAL[`${name}|${e}`]])
    .filter(([, m]) => m);
  return { id, name, effects, dlc, lo: lo >>> 0, hi: hi >>> 0, specials };
});

/* ---------- value math ---------- */
function effectValue(effectIdx, power) {
  const [cost, mag, dur] = FX[EFFECT_NAMES[effectIdx]];
  let magTerm, durTerm;
  if (mag > 0) {
    magTerm = Math.pow(Math.max(mag * power, 1), 1.1);
    durTerm = dur > 0 ? Math.pow(dur / 10, 1.1) : 1;
  } else {
    magTerm = 1;
    durTerm = Math.pow(Math.max((dur * power) / 10, 0.1), 1.1);
  }
  return cost * magTerm * durTerm;
}

function bitsToIndices(lo, hi) {
  const out = [];
  let b = lo;
  while (b) { const low = b & -b; out.push(31 - Math.clz32(low)); b &= b - 1; }
  b = hi;
  while (b) { const low = b & -b; out.push(32 + 31 - Math.clz32(low)); b &= b - 1; }
  return out;
}

/* Evaluate a combo of ingredient objects. Returns null if nothing activates. */
function evaluateCombo(ings, effVals) {
  let lo = 0, hi = 0;
  for (let i = 0; i < ings.length; i++) {
    for (let j = i + 1; j < ings.length; j++) {
      lo |= ings[i].lo & ings[j].lo;
      hi |= ings[i].hi & ings[j].hi;
    }
  }
  if (!lo && !hi) return null;
  const idxs = bitsToIndices(lo >>> 0, hi >>> 0);
  const effects = idxs.map((ei) => {
    let mult = 1;
    for (const ing of ings) {
      for (const [si, m] of ing.specials) if (si === ei && m > mult) mult = m;
    }
    return { idx: ei, name: EFFECT_NAMES[ei], value: effVals[ei] * mult, harmful: FX[EFFECT_NAMES[ei]][3], boosted: mult > 1 };
  });
  effects.sort((a, b) => b.value - a.value);
  const total = effects.reduce((s, e) => s + e.value, 0);
  return { effects, total, isPoison: effects[0].harmful, strongest: effects[0].name };
}

/* ============================================================ */
export default function AlchemyLab() {
  const [tab, setTab] = useState("brews");
  const [missing, setMissing] = useState(() => new Set());
  const [power, setPower] = useState(4);
  const [selected, setSelected] = useState([]);
  const [search, setSearch] = useState("");
  const [invSearch, setInvSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all"); // all | potion | poison
  const [sizeFilter, setSizeFilter] = useState("all"); // all | 2 | 3
  const [sortBy, setSortBy] = useState("perIng"); // total | perIng
  const [showCount, setShowCount] = useState(25);
  const [loaded, setLoaded] = useState(false);

  /* persist the blacklist across sessions */
  useEffect(() => {
    (async () => {
      try {
        const r = await window.storage.get("alchemy-missing");
        if (r?.value) setMissing(new Set(JSON.parse(r.value)));
      } catch (e) { /* first run — nothing saved yet */ }
      setLoaded(true);
    })();
  }, []);
  useEffect(() => {
    if (!loaded) return;
    (async () => {
      try { await window.storage.set("alchemy-missing", JSON.stringify([...missing])); } catch (e) {}
    })();
  }, [missing, loaded]);

  const effVals = useMemo(() => EFFECT_NAMES.map((_, i) => effectValue(i, power)), [power]);

  const available = useMemo(
    () => INGREDIENTS.filter((ing) => !missing.has(ing.name)),
    [missing]
  );

  /* ---------- best combos ---------- */
  const combos = useMemo(() => {
    const list = available;
    const results = [];
    // all pairs
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        if (!((a.lo & b.lo) || (a.hi & b.hi))) continue;
        const r = evaluateCombo([a, b], effVals);
        if (r) results.push({ ings: [a, b], ...r });
      }
    }
    // triples: keep only ones where every ingredient contributes
    const topPo = [], topPn = []; // potions, poisons
    const KEEP = 300;
    let minPo = 0, minPn = 0;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        const abLo = a.lo & b.lo, abHi = a.hi & b.hi;
        for (let k = j + 1; k < list.length; k++) {
          const c = list[k];
          const acLo = a.lo & c.lo, acHi = a.hi & c.hi;
          const bcLo = b.lo & c.lo, bcHi = b.hi & c.hi;
          // every ingredient must share something with another
          if (!((abLo | abHi) || (acLo | acHi))) continue;      // a contributes
          if (!((abLo | abHi) || (bcLo | bcHi))) continue;      // b contributes
          if (!((acLo | acHi) || (bcLo | bcHi))) continue;      // c contributes
          const r = evaluateCombo([a, b, c], effVals);
          if (!r) continue;
          const bucket = r.isPoison ? topPn : topPo;
          const min = r.isPoison ? minPn : minPo;
          if (bucket.length < KEEP || r.total > min) {
            bucket.push({ ings: [a, b, c], ...r });
            if (bucket.length > KEEP * 1.5) {
              bucket.sort((x, y) => y.total - x.total);
              bucket.length = KEEP;
              if (r.isPoison) minPn = bucket[bucket.length - 1].total;
              else minPo = bucket[bucket.length - 1].total;
            }
          }
        }
      }
    }
    return [...results, ...topPo, ...topPn];
  }, [available, effVals]);

  const shownCombos = useMemo(() => {
    let list = combos;
    if (typeFilter === "potion") list = list.filter((c) => !c.isPoison);
    if (typeFilter === "poison") list = list.filter((c) => c.isPoison);
    if (sizeFilter !== "all") list = list.filter((c) => c.ings.length === +sizeFilter);
    const key = sortBy === "total" ? (c) => c.total : (c) => c.total / c.ings.length;
    return [...list].sort((a, b) => key(b) - key(a)).slice(0, showCount);
  }, [combos, typeFilter, sizeFilter, sortBy, showCount]);

  /* ---------- mixing lab ---------- */
  const selIngs = selected.map((n) => INGREDIENTS.find((i) => i.name === n));
  const brew = selIngs.length >= 2 ? evaluateCombo(selIngs, effVals) : null;
  const wasted = brew
    ? selIngs.filter((ing) => {
        const activated = new Set(brew.effects.map((e) => e.idx));
        return !ing.effects.some((e) => activated.has(EFFECT_INDEX[e]));
      })
    : [];

  const toggleSelect = (name) =>
    setSelected((s) =>
      s.includes(name) ? s.filter((n) => n !== name) : s.length < 3 ? [...s, name] : s
    );

  const toggleHave = (name) =>
    setMissing((m) => {
      const n = new Set(m);
      n.has(name) ? n.delete(name) : n.add(name);
      return n;
    });

  const g = (v) => Math.round(v).toLocaleString();

  const labList = available.filter((i) => i.name.toLowerCase().includes(search.toLowerCase()));
  const invList = INGREDIENTS.filter((i) => i.name.toLowerCase().includes(invSearch.toLowerCase()));

  return (
    <div className="root">
      <style>{CSS}</style>

      <header className="hdr">
        <div className="hdr-rule" />
        <h1>The Alchemist&rsquo;s Ledger</h1>
        <p className="sub">A Skyrim brewing planner &mdash; maximize septims per ingredient</p>
        <div className="hdr-rule" />
      </header>

      <div className="powerRow">
        <label htmlFor="pw">Alchemy power <span className="pwv">&times;{power}</span></label>
        <input id="pw" type="range" min="1" max="15" value={power}
          onChange={(e) => setPower(+e.target.value)} />
        <span className="hint">skill, perks &amp; Fortify Alchemy gear &mdash; values are approximate; rankings hold</span>
      </div>

      <nav className="tabs">
        {[["brews", "Best Brews"], ["lab", "Mixing Lab"], ["pantry", "My Ingredients"]].map(([k, label]) => (
          <button key={k} className={tab === k ? "tab on" : "tab"} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </nav>

      {/* ================= BEST BREWS ================= */}
      {tab === "brews" && (
        <section>
          <div className="filters">
            <div className="fgroup">
              <span className="flabel">Rank by</span>
              <button className={sortBy === "perIng" ? "pill on" : "pill"} onClick={() => setSortBy("perIng")}>gold / ingredient</button>
              <button className={sortBy === "total" ? "pill on" : "pill"} onClick={() => setSortBy("total")}>total gold</button>
            </div>
            <div className="fgroup">
              <span className="flabel">Type</span>
              {[["all", "All"], ["potion", "Potions"], ["poison", "Poisons"]].map(([k, l]) => (
                <button key={k} className={typeFilter === k ? "pill on" : "pill"} onClick={() => setTypeFilter(k)}>{l}</button>
              ))}
            </div>
            <div className="fgroup">
              <span className="flabel">Size</span>
              {[["all", "2 & 3"], ["2", "Pairs"], ["3", "Triples"]].map(([k, l]) => (
                <button key={k} className={sizeFilter === k ? "pill on" : "pill"} onClick={() => setSizeFilter(k)}>{l}</button>
              ))}
            </div>
          </div>

          <p className="meta">
            {available.length} of {INGREDIENTS.length} ingredients in stock
            {missing.size > 0 && <> &middot; {missing.size} marked unavailable</>}
          </p>

          {shownCombos.length === 0 && (
            <div className="empty">No brews possible. Mark more ingredients as owned in <b>My Ingredients</b>.</div>
          )}

          <ol className="comboList">
            {shownCombos.map((c, i) => (
              <li key={c.ings.map((x) => x.name).join("+")} className="combo">
                <div className="comboTop">
                  <span className="rank">{i + 1}</span>
                  <span className={c.isPoison ? "brewName poison" : "brewName"}>
                    {c.isPoison ? "Poison" : "Potion"} of {c.strongest}
                  </span>
                  <span className="gold">
                    {g(c.total)} <em>gold</em>
                    <small>{g(c.total / c.ings.length)}/ing.</small>
                  </span>
                </div>
                <div className="ingRow">
                  {c.ings.map((ing) => (
                    <span key={ing.name} className="ingTag">
                      {ing.name}{ing.dlc && <sup>{ing.dlc}</sup>}
                      <button className="ban" title={`I don't have ${ing.name}`}
                        onClick={() => toggleHave(ing.name)}>&times;</button>
                    </span>
                  ))}
                </div>
                <div className="fxRow">
                  {c.effects.map((e) => (
                    <span key={e.name} className={e.harmful ? "fx bad" : "fx"}>
                      {e.name}{e.boosted && " ★"} <b>{g(e.value)}</b>
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ol>

          {shownCombos.length >= showCount && (
            <button className="more" onClick={() => setShowCount((n) => n + 25)}>Show more</button>
          )}
          <p className="tip">Tip: tap the &times; on any ingredient to mark it as one you don&rsquo;t have &mdash; the list re-ranks instantly. ★ marks an ingredient-boosted effect (e.g. Giant&rsquo;s Toe).</p>
        </section>
      )}

      {/* ================= MIXING LAB ================= */}
      {tab === "lab" && (
        <section>
          <div className="benchCard">
            <div className="benchSlots">
              {[0, 1, 2].map((i) => (
                <div key={i} className={selIngs[i] ? "slot filled" : "slot"}>
                  {selIngs[i] ? (
                    <button onClick={() => toggleSelect(selIngs[i].name)}>
                      {selIngs[i].name} &times;
                    </button>
                  ) : (
                    <span>{i === 2 ? "optional" : "ingredient"}</span>
                  )}
                </div>
              ))}
            </div>

            {brew ? (
              <div className="result">
                <div className={brew.isPoison ? "resultName poison" : "resultName"}>
                  {brew.isPoison ? "☠ Poison" : "⚗ Potion"} of {brew.strongest}
                </div>
                <ul className="resultFx">
                  {brew.effects.map((e) => (
                    <li key={e.name} className={e.harmful ? "bad" : ""}>
                      {e.name}{e.boosted && " ★"} <b>{g(e.value)} g</b>
                    </li>
                  ))}
                </ul>
                <div className="resultGold">{g(brew.total)} gold &middot; {g(brew.total / selIngs.length)} per ingredient</div>
                {wasted.length > 0 && (
                  <div className="waste">Wasted: {wasted.map((w) => w.name).join(", ")} adds no effect here.</div>
                )}
              </div>
            ) : selIngs.length >= 2 ? (
              <div className="result fizzle">The mixture fizzles &mdash; these ingredients share no effects.</div>
            ) : (
              <div className="result fizzle">Choose 2&ndash;3 ingredients below.</div>
            )}
          </div>

          <input className="search" placeholder="Search your ingredients…" value={search}
            onChange={(e) => setSearch(e.target.value)} />
          <div className="chips">
            {labList.map((ing) => (
              <button key={ing.name}
                className={selected.includes(ing.name) ? "chip on" : "chip"}
                onClick={() => toggleSelect(ing.name)}
                title={ing.effects.join(" · ")}>
                {ing.name}
              </button>
            ))}
            {labList.length === 0 && <span className="empty">Nothing in stock matches.</span>}
          </div>
        </section>
      )}

      {/* ================= PANTRY ================= */}
      {tab === "pantry" && (
        <section>
          <div className="invBar">
            <input className="search" placeholder="Search all ingredients…" value={invSearch}
              onChange={(e) => setInvSearch(e.target.value)} />
            <button className="pill" onClick={() => setMissing(new Set())}>Have all</button>
            <button className="pill" onClick={() => setMissing(new Set(INGREDIENTS.map((i) => i.name)))}>Have none</button>
          </div>
          <p className="meta">Unchecked ingredients are excluded from every brew and ranking. Saved automatically.</p>
          <ul className="invList">
            {invList.map((ing) => {
              const have = !missing.has(ing.name);
              return (
                <li key={ing.name} className={have ? "invItem" : "invItem off"}>
                  <label>
                    <input type="checkbox" checked={have} onChange={() => toggleHave(ing.name)} />
                    <span className="invName">{ing.name}{ing.dlc && <sup>{ing.dlc}</sup>}</span>
                  </label>
                  <span className="invFx">{ing.effects.join(" · ")}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <footer className="foot">
        Potion value &asymp; sum of shared effects; alchemy XP scales with value, so the richest brew is also the best training. DG = Dawnguard, HF = Hearthfire.
      </footer>
    </div>
  );
}

/* ============================================================ */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@500;700&family=Alegreya+Sans:ital,wght@0,400;0,500;0,700;1,400&display=swap');

:root {
  --ink:#131519; --panel:#1c1f25; --panel2:#22262e; --line:#3a3f49;
  --parchment:#d8cbaa; --dim:#9a917c; --gold:#d4a94f; --gold-dk:#8a6d2f;
  --poison:#9fbf6b; --harm:#c97b5f; --focus:#e6c979;
}
* { box-sizing:border-box; margin:0; }
.root {
  min-height:100vh; background:
    radial-gradient(1200px 500px at 50% -10%, #232732 0%, transparent 60%),
    var(--ink);
  color:var(--parchment);
  font-family:'Alegreya Sans', system-ui, sans-serif;
  font-size:15px; line-height:1.45;
  padding:20px 14px 60px; max-width:760px; margin:0 auto;
}
button { font:inherit; cursor:pointer; }
button:focus-visible, input:focus-visible { outline:2px solid var(--focus); outline-offset:2px; }

.hdr { text-align:center; margin-bottom:18px; }
.hdr h1 { font-family:'Cinzel', serif; font-weight:700; font-size:clamp(24px,5.5vw,34px);
  letter-spacing:.06em; color:var(--gold); margin:10px 0 2px; }
.sub { color:var(--dim); font-style:italic; }
.hdr-rule { height:1px; background:linear-gradient(90deg, transparent, var(--gold-dk) 20%, var(--gold) 50%, var(--gold-dk) 80%, transparent); position:relative; }
.hdr-rule::after { content:'◆'; position:absolute; left:50%; top:-8px; transform:translateX(-50%);
  color:var(--gold); font-size:10px; background:var(--ink); padding:0 8px; }

.powerRow { display:flex; flex-wrap:wrap; align-items:center; gap:8px 12px;
  background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:10px 14px; margin-bottom:14px; }
.powerRow label { font-weight:700; letter-spacing:.02em; }
.pwv { color:var(--gold); }
.powerRow input[type=range] { flex:1; min-width:140px; accent-color:var(--gold); }
.hint { flex-basis:100%; color:var(--dim); font-size:12.5px; }

.tabs { display:flex; gap:6px; margin-bottom:16px; }
.tab { flex:1; padding:10px 4px; background:var(--panel); color:var(--dim);
  border:1px solid var(--line); border-radius:8px; font-family:'Cinzel', serif; font-weight:500; font-size:13px; letter-spacing:.04em; }
.tab.on { color:var(--gold); border-color:var(--gold-dk); background:var(--panel2);
  box-shadow:inset 0 -2px 0 var(--gold); }

.filters { display:flex; flex-direction:column; gap:8px; margin-bottom:10px; }
.fgroup { display:flex; align-items:center; flex-wrap:wrap; gap:6px; }
.flabel { color:var(--dim); font-size:12.5px; width:56px; }
.pill { background:var(--panel); border:1px solid var(--line); color:var(--parchment);
  border-radius:999px; padding:4px 12px; font-size:13px; }
.pill.on { border-color:var(--gold); color:var(--gold); background:var(--panel2); }

.meta { color:var(--dim); font-size:13px; margin:6px 0 12px; }
.empty { color:var(--dim); padding:24px 0; text-align:center; }

.comboList { list-style:none; padding:0; display:flex; flex-direction:column; gap:10px; }
.combo { background:var(--panel); border:1px solid var(--line); border-left:3px solid var(--gold-dk);
  border-radius:8px; padding:10px 12px; }
.comboTop { display:flex; align-items:baseline; gap:10px; flex-wrap:wrap; }
.rank { font-family:'Cinzel', serif; color:var(--dim); font-size:13px; min-width:20px; }
.brewName { font-family:'Cinzel', serif; font-weight:700; font-size:15px; flex:1; }
.brewName.poison { color:var(--poison); }
.gold { color:var(--gold); font-weight:700; white-space:nowrap; }
.gold em { font-style:normal; font-weight:400; color:var(--dim); font-size:12px; }
.gold small { display:block; text-align:right; color:var(--dim); font-weight:400; font-size:11.5px; }
.ingRow { display:flex; flex-wrap:wrap; gap:6px; margin:8px 0 6px; }
.ingTag { background:var(--panel2); border:1px solid var(--line); border-radius:6px;
  padding:2px 4px 2px 8px; font-size:13px; display:inline-flex; align-items:center; gap:4px; }
.ingTag sup { color:var(--dim); font-size:9px; }
.ban { background:none; border:none; color:var(--dim); font-size:14px; padding:0 4px; border-radius:4px; }
.ban:hover { color:var(--harm); }
.fxRow { display:flex; flex-wrap:wrap; gap:4px 10px; font-size:12.5px; color:var(--dim); }
.fx b { color:var(--parchment); font-weight:500; }
.fx.bad { color:#a8846f; }
.more { display:block; margin:16px auto 0; background:var(--panel2); color:var(--gold);
  border:1px solid var(--gold-dk); border-radius:8px; padding:8px 22px; font-family:'Cinzel', serif; }
.tip { color:var(--dim); font-size:12.5px; margin-top:14px; font-style:italic; }

.benchCard { background:var(--panel); border:1px solid var(--gold-dk); border-radius:10px;
  padding:14px; margin-bottom:14px; box-shadow:0 0 0 4px var(--panel), 0 0 0 5px var(--line); }
.benchSlots { display:flex; gap:8px; margin-bottom:12px; }
.slot { flex:1; border:1px dashed var(--line); border-radius:8px; min-height:44px;
  display:flex; align-items:center; justify-content:center; color:var(--dim); font-size:13px; padding:4px; text-align:center; }
.slot.filled { border-style:solid; border-color:var(--gold-dk); }
.slot button { background:none; border:none; color:var(--parchment); font-size:13px; }
.result { border-top:1px solid var(--line); padding-top:12px; }
.result.fizzle { color:var(--dim); font-style:italic; }
.resultName { font-family:'Cinzel', serif; font-weight:700; font-size:17px; color:var(--gold); margin-bottom:6px; }
.resultName.poison { color:var(--poison); }
.resultFx { list-style:none; padding:0; display:flex; flex-direction:column; gap:3px; font-size:14px; }
.resultFx b { color:var(--gold); font-weight:500; }
.resultFx .bad { color:var(--harm); }
.resultGold { margin-top:10px; font-weight:700; color:var(--gold); font-size:16px; }
.waste { margin-top:8px; color:var(--harm); font-size:13px; }

.search { width:100%; background:var(--panel); border:1px solid var(--line); color:var(--parchment);
  border-radius:8px; padding:9px 12px; margin-bottom:10px; }
.search::placeholder { color:var(--dim); }
.chips { display:flex; flex-wrap:wrap; gap:6px; }
.chip { background:var(--panel); border:1px solid var(--line); color:var(--parchment);
  border-radius:6px; padding:6px 10px; font-size:13px; }
.chip.on { border-color:var(--gold); color:var(--gold); background:var(--panel2); }

.invBar { display:flex; gap:6px; align-items:center; }
.invBar .search { margin-bottom:0; flex:1; }
.invList { list-style:none; padding:0; margin-top:12px; display:flex; flex-direction:column; gap:2px; }
.invItem { display:flex; flex-direction:column; padding:8px 10px; border-radius:6px; background:var(--panel); border:1px solid transparent; }
.invItem.off { opacity:.45; }
.invItem label { display:flex; align-items:center; gap:10px; cursor:pointer; }
.invItem input { accent-color:var(--gold); width:16px; height:16px; }
.invName { font-weight:700; }
.invName sup { color:var(--dim); font-size:9px; }
.invFx { color:var(--dim); font-size:12px; margin-left:26px; }

.foot { margin-top:36px; color:var(--dim); font-size:12.5px; text-align:center;
  border-top:1px solid var(--line); padding-top:14px; }

@media (prefers-reduced-motion:no-preference) {
  .combo, .result { animation:rise .25s ease both; }
  @keyframes rise { from { opacity:0; transform:translateY(4px);} to { opacity:1; transform:none;} }
}
@media (min-width:560px) {
  .filters { flex-direction:row; flex-wrap:wrap; gap:8px 20px; }
  .flabel { width:auto; }
}
`;
