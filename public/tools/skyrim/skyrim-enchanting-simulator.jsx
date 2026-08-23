import { useState, useMemo } from "react";

/* ============================================================
   SKYRIM SE — ARCANE ENCHANTER (loadout planner)
   Baseline: 100 Enchanting, Enchanter 5/5, Insightful/Corpus/
   Fire/Frost/Storm Enchanter, Extra Effect, Grand souls.
   Magnitude = floor(base × 1.252941 × 2 × [1.25 if perk] × bonus)
   (UESP formula; skill mult at 100 = 1.252941)
   ============================================================ */

const SKILL_MULT = 1.252941; // 1 + (1)*(1-0.14)/3.4
const ENCH_MULT = 2; // Enchanter 5/5

// perk: which +25% enchanting perk applies at baseline
// insight = Insightful Enchanter, corpus = Corpus Enchanter, elem = Fire/Frost/Storm Enchanter
const ARMOR_EFFECTS = [
  // ---- Fortify Skill ----
  { id: "alchemy", name: "Fortify Alchemy", group: "Fortify Skill", base: 8, unit: "%", perk: true, slots: ["head", "neck", "hands", "finger"], fmt: (v) => `Potions +${v}% stronger` },
  { id: "alteration", name: "Fortify Alteration", group: "Fortify Skill", base: 8, unit: "%", perk: true, cap: 100, slots: ["head", "neck", "chest", "finger"], fmt: (v) => `Alteration cost −${v}%` },
  { id: "archery", name: "Fortify Archery", group: "Fortify Skill", base: 13, unit: "%", perk: true, slots: ["head", "neck", "hands", "finger"], fmt: (v) => `Bow damage +${v}%` },
  { id: "barter", name: "Fortify Barter", group: "Fortify Skill", base: 8, unit: "%", perk: true, slots: ["neck"], fmt: (v) => `Prices ${v}% better` },
  { id: "block", name: "Fortify Block", group: "Fortify Skill", base: 13, unit: "%", perk: true, slots: ["neck", "hands", "finger", "shield"], fmt: (v) => `Block +${v}%` },
  { id: "conjuration", name: "Fortify Conjuration", group: "Fortify Skill", base: 8, unit: "%", perk: true, cap: 100, slots: ["head", "neck", "chest", "finger"], fmt: (v) => `Conjuration cost −${v}%` },
  { id: "destruction", name: "Fortify Destruction", group: "Fortify Skill", base: 8, unit: "%", perk: true, cap: 100, slots: ["head", "neck", "chest", "finger"], fmt: (v) => `Destruction cost −${v}%` },
  { id: "heavyArmor", name: "Fortify Heavy Armor", group: "Fortify Skill", base: 8, unit: "", perk: true, slots: ["neck", "chest", "hands", "finger"], fmt: (v) => `Heavy Armor skill +${v}` },
  { id: "illusion", name: "Fortify Illusion", group: "Fortify Skill", base: 8, unit: "%", perk: true, cap: 100, slots: ["head", "neck", "chest", "finger"], fmt: (v) => `Illusion cost −${v}%` },
  { id: "lightArmor", name: "Fortify Light Armor", group: "Fortify Skill", base: 8, unit: "", perk: true, slots: ["neck", "chest", "hands", "finger"], fmt: (v) => `Light Armor skill +${v}` },
  { id: "lockpicking", name: "Fortify Lockpicking", group: "Fortify Skill", base: 13, unit: "%", perk: true, slots: ["head", "neck", "hands", "finger"], fmt: (v) => `Lockpicking +${v}%` },
  { id: "oneHanded", name: "Fortify One-Handed", group: "Fortify Skill", base: 13, unit: "%", perk: true, slots: ["neck", "hands", "finger", "feet"], fmt: (v) => `One-handed damage +${v}%` },
  { id: "pickpocket", name: "Fortify Pickpocket", group: "Fortify Skill", base: 13, unit: "%", perk: true, slots: ["neck", "hands", "finger", "feet"], fmt: (v) => `Pickpocket +${v}%` },
  { id: "restoration", name: "Fortify Restoration", group: "Fortify Skill", base: 8, unit: "%", perk: true, cap: 100, slots: ["head", "neck", "chest", "finger"], fmt: (v) => `Restoration cost −${v}%` },
  { id: "smithing", name: "Fortify Smithing", group: "Fortify Skill", base: 8, unit: "%", perk: true, slots: ["neck", "chest", "hands", "finger"], fmt: (v) => `Tempering +${v}% stronger` },
  { id: "sneak", name: "Fortify Sneak", group: "Fortify Skill", base: 13, unit: "%", perk: true, slots: ["neck", "hands", "finger", "feet"], fmt: (v) => `Sneak +${v}%` },
  { id: "twoHanded", name: "Fortify Two-Handed", group: "Fortify Skill", base: 13, unit: "%", perk: true, slots: ["neck", "hands", "finger", "feet"], fmt: (v) => `Two-handed damage +${v}%` },
  // ---- Fortify Attribute ----
  { id: "healingRate", name: "Fortify Healing Rate", group: "Attributes & Regen", base: 10, unit: "%", perk: true, slots: ["neck", "chest", "finger"], fmt: (v) => `Health regen +${v}%` },
  { id: "health", name: "Fortify Health", group: "Attributes & Regen", base: 20, unit: "", perk: true, slots: ["neck", "chest", "finger", "shield"], fmt: (v) => `Health +${v}` },
  { id: "magicka", name: "Fortify Magicka", group: "Attributes & Regen", base: 20, unit: "", perk: true, slots: ["head", "neck", "chest", "finger"], fmt: (v) => `Magicka +${v}` },
  { id: "magickaRegen", name: "Fortify Magicka Regen", group: "Attributes & Regen", base: 20, unit: "%", perk: true, slots: ["head", "neck", "chest"], fmt: (v) => `Magicka regen +${v}%` },
  { id: "stamina", name: "Fortify Stamina", group: "Attributes & Regen", base: 20, unit: "", perk: true, slots: ["neck", "chest", "finger", "feet"], fmt: (v) => `Stamina +${v}` },
  { id: "staminaRegen", name: "Fortify Stamina Regen", group: "Attributes & Regen", base: 10, unit: "%", perk: true, slots: ["neck", "chest", "feet"], fmt: (v) => `Stamina regen +${v}%`, note: "Rings with this exist as loot, but can't be player-enchanted" },
  { id: "carryWeight", name: "Fortify Carry Weight", group: "Attributes & Regen", base: 15, unit: "", perk: false, slots: ["neck", "hands", "finger", "feet"], fmt: (v) => `Carry weight +${v}` },
  { id: "unarmed", name: "Fortify Unarmed", group: "Attributes & Regen", base: 5, unit: "", perk: false, slots: ["hands", "finger"], fmt: (v) => `Unarmed damage +${v}` },
  // ---- Resist ----
  { id: "resDisease", name: "Resist Disease", group: "Resistances", base: 25, unit: "%", perk: false, cap: 100, slots: ["neck", "finger", "feet", "shield"], fmt: (v) => `Disease resist +${v}%` },
  { id: "resFire", name: "Resist Fire", group: "Resistances", base: 15, unit: "%", perk: true, cap: 85, slots: ["neck", "finger", "feet", "shield"], fmt: (v) => `Fire resist +${v}%` },
  { id: "resFrost", name: "Resist Frost", group: "Resistances", base: 15, unit: "%", perk: true, cap: 85, slots: ["neck", "finger", "feet", "shield"], fmt: (v) => `Frost resist +${v}%` },
  { id: "resMagic", name: "Resist Magic", group: "Resistances", base: 8, unit: "%", perk: false, cap: 85, slots: ["neck", "finger", "shield"], fmt: (v) => `Magic resist +${v}%` },
  { id: "resPoison", name: "Resist Poison", group: "Resistances", base: 15, unit: "%", perk: false, cap: 100, slots: ["neck", "finger", "feet", "shield"], fmt: (v) => `Poison resist +${v}%` },
  { id: "resShock", name: "Resist Shock", group: "Resistances", base: 15, unit: "%", perk: true, cap: 85, slots: ["neck", "finger", "feet", "shield"], fmt: (v) => `Shock resist +${v}%` },
  // ---- Other ----
  { id: "muffle", name: "Muffle", group: "Other", fixed: true, slots: ["feet"], fmt: () => `Muffled movement` },
  { id: "waterbreathing", name: "Waterbreathing", group: "Other", fixed: true, slots: ["head", "neck", "finger"], fmt: () => `Waterbreathing` },
];

// elems: element keywords on the effect itself (drives Fire/Frost/Storm Enchanter + Augmented perks)
const WEAPON_EFFECTS = [
  { id: "absHealth", name: "Absorb Health", group: "Absorb", base: 8, kind: "dmg", elems: [], fmt: (v) => `Absorb ${v} health` },
  { id: "absMagicka", name: "Absorb Magicka", group: "Absorb", base: 10, kind: "dmg", elems: [], fmt: (v) => `Absorb ${v} magicka` },
  { id: "absStamina", name: "Absorb Stamina", group: "Absorb", base: 10, kind: "dmg", elems: [], fmt: (v) => `Absorb ${v} stamina` },
  { id: "wFire", name: "Fire Damage", group: "Damage", base: 10, kind: "dmg", elems: ["fire"], fmt: (v) => `${v} fire damage; targets on fire take extra` },
  { id: "wFrost", name: "Frost Damage", group: "Damage", base: 10, kind: "dmg", elems: ["frost"], fmt: (v) => `${v} frost damage to health & stamina` },
  { id: "wShock", name: "Shock Damage", group: "Damage", base: 10, kind: "dmg", elems: ["shock"], fmt: (v) => `${v} shock damage, ${Math.floor(v / 2)} to magicka` },
  { id: "chaos", name: "Chaos Damage (DB)", group: "Damage", base: 10, kind: "dmg", elems: ["fire", "frost", "shock"], fmt: (v) => `50% chance each: ${v} fire, frost & shock` },
  { id: "dmgMagicka", name: "Damage Magicka", group: "Damage", base: 15, kind: "dmg", elems: [], fmt: (v) => `${v} magicka damage` },
  { id: "dmgStamina", name: "Damage Stamina", group: "Damage", base: 15, kind: "dmg", elems: ["fire"], fmt: (v) => `${v} stamina damage`, note: "Boosted by fire perks (vanilla keyword bug)" },
  { id: "banish", name: "Banish", group: "Repel", base: 10, kind: "lvl", elems: [], fmt: (v) => `Banish summons up to level ${v}` },
  { id: "fear", name: "Fear", group: "Repel", base: 10, kind: "lvl", elems: [], fmt: (v) => `Fear up to level ${v} for 30s` },
  { id: "turnUndead", name: "Turn Undead", group: "Repel", base: 10, kind: "lvl", elems: [], fmt: (v) => `Turn undead up to level ${v} for 30s` },
  { id: "paralyze", name: "Paralyze", group: "Utility", base: 2, kind: "dur", elems: [], fmt: (v) => `26% chance to paralyze for ${v}s` },
  { id: "soulTrap", name: "Soul Trap", group: "Utility", base: 4, kind: "dur", elems: [], fmt: (v) => `Soul trap for ${v}s` },
  { id: "fieryST", name: "Fiery Soul Trap", group: "Utility", base: 5, kind: "dur", elems: ["fire"], fmt: (v) => `Soul trap ${v}s + 10 fire (fixed)` },
  { id: "silentMoons", name: "Silent Moons Enchant", group: "Utility", base: 10, kind: "dmg", elems: [], fmt: (v) => `+${v} damage at night (9pm–5am)` },
  { id: "huntsman", name: "Huntsman's Prowess", group: "Utility", base: 3, kind: "dmg", elems: [], fmt: (v) => `+${v} damage vs animals` },
];

const ARMOR_SLOTS = [
  { id: "head", label: "Head", hint: "Helmet · Hood · Circlet" },
  { id: "neck", label: "Necklace", hint: "Amulet" },
  { id: "chest", label: "Chest", hint: "Armor · Robes" },
  { id: "hands", label: "Hands", hint: "Gauntlets · Gloves" },
  { id: "finger", label: "Ring", hint: "One ring in vanilla" },
  { id: "feet", label: "Feet", hint: "Boots · Shoes" },
];

const PRESETS = [
  { label: "No bonuses", v: 1.0 },
  { label: "Seeker of Sorcery", v: 1.1 },
  { label: "+32% potion", v: 1.32 },
  { label: "Potion + Seeker", v: 1.45 },
  { label: "+ Necromage vamp", v: 1.82 },
  { label: "Kitchen sink", v: 2.0 },
];

const armorMag = (fx, bonus) =>
  fx.fixed ? null : Math.floor(fx.base * SKILL_MULT * ENCH_MULT * (fx.perk ? 1.25 : 1) * bonus);

// Weapon: enchanter (+25%/element) uses the effect's OWN elements; Augmented
// (×1.5/element) uses ALL elements present on the weapon (perks hit both effects)
const weaponMag = (fx, weaponElems, bonus) => {
  const encB = 1 + 0.25 * fx.elems.length;
  const inner = Math.floor(fx.base * SKILL_MULT * ENCH_MULT * encB * bonus);
  return Math.floor(inner * Math.pow(1.5, weaponElems.size));
};

const byId = (list) => Object.fromEntries(list.map((e) => [e.id, e]));
const AFX = byId(ARMOR_EFFECTS);
const WFX = byId(WEAPON_EFFECTS);

const groupOptions = (effects) => {
  const groups = {};
  effects.forEach((e) => {
    (groups[e.group] = groups[e.group] || []).push(e);
  });
  return Object.entries(groups);
};

function EffectSelect({ value, onChange, options, placeholder, accent }) {
  return (
    <select
      value={value || ""}
      onChange={(e) => onChange(e.target.value || null)}
      className="w-full bg-transparent text-sm py-2 px-2 rounded-sm focus:outline-none"
      style={{
        border: "1px solid rgba(201,169,110,0.28)",
        color: value ? "#e8e3d3" : "#77797f",
        background: "#12151b",
        fontFamily: "'Jost', sans-serif",
        boxShadow: value && accent ? "inset 2px 0 0 #86b9e0" : "none",
      }}
    >
      <option value="">{placeholder}</option>
      {groupOptions(options).map(([g, list]) => (
        <optgroup key={g} label={g}>
          {list.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

function SlotCard({ label, hint, picks, setPicks, effects, bonus, isWeapon, weaponElems }) {
  const [a, b] = picks;
  const optsFor = (other) => effects.filter((e) => e.id !== other);
  const magOf = (id) => {
    if (!id) return null;
    const fx = isWeapon ? WFX[id] : AFX[id];
    if (!isWeapon && fx.fixed) return { text: fx.fmt(), fixed: true };
    const v = isWeapon ? weaponMag(fx, weaponElems, bonus) : armorMag(fx, bonus);
    return { text: fx.fmt(v), note: fx.note };
  };
  const mA = magOf(a);
  const mB = magOf(b);
  const clear = () => setPicks([null, null]);
  return (
    <div
      className="rounded-sm p-3"
      style={{ background: "#171b22", border: "1px solid rgba(201,169,110,0.18)" }}
    >
      <div className="flex items-baseline justify-between mb-2">
        <div>
          <span
            className="text-xs tracking-widest uppercase"
            style={{ color: "#c9a96e", fontFamily: "'Cinzel', serif", letterSpacing: "0.18em" }}
          >
            {label}
          </span>
          <span className="ml-2 text-xs" style={{ color: "#6b6e75" }}>
            {hint}
          </span>
        </div>
        {(a || b) && (
          <button
            onClick={clear}
            className="text-xs px-1"
            style={{ color: "#6b6e75" }}
            aria-label={`Clear ${label}`}
          >
            ✕ clear
          </button>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <EffectSelect
          value={a}
          onChange={(v) => setPicks([v, b])}
          options={optsFor(b)}
          placeholder="First enchantment…"
          accent
        />
        <EffectSelect
          value={b}
          onChange={(v) => setPicks([a, v])}
          options={optsFor(a)}
          placeholder="Second (Extra Effect)…"
          accent
        />
      </div>
      {(mA || mB) && (
        <div className="mt-2 text-sm leading-snug" style={{ color: "#86b9e0" }}>
          {mA && <div>◆ {mA.text}</div>}
          {mB && <div>◆ {mB.text}</div>}
          {(mA?.note || mB?.note) && (
            <div className="text-xs mt-1" style={{ color: "#8b8d93" }}>
              {mA?.note || mB?.note}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function EnchantingSimulator() {
  const [bonus, setBonus] = useState(1.0);
  const [offhand, setOffhand] = useState("shield"); // shield | weapon | none
  const [picks, setPicks] = useState({
    head: [null, null],
    neck: [null, null],
    chest: [null, null],
    hands: [null, null],
    finger: [null, null],
    feet: [null, null],
    shield: [null, null],
    main: [null, null],
    off: [null, null],
  });
  const setSlot = (id) => (p) => setPicks((s) => ({ ...s, [id]: p }));

  const weaponElemsOf = (slotId) => {
    const set = new Set();
    picks[slotId].forEach((id) => id && WFX[id].elems.forEach((el) => set.add(el)));
    return set;
  };

  const totals = useMemo(() => {
    const acc = {};
    const activeArmorSlots = [...ARMOR_SLOTS.map((s) => s.id), ...(offhand === "shield" ? ["shield"] : [])];
    activeArmorSlots.forEach((slotId) => {
      picks[slotId].forEach((id) => {
        if (!id) return;
        const fx = AFX[id];
        if (!acc[id]) acc[id] = { fx, sum: 0, count: 0 };
        acc[id].count += 1;
        if (!fx.fixed) acc[id].sum += armorMag(fx, bonus);
      });
    });
    const order = ["Fortify Skill", "Attributes & Regen", "Resistances", "Other"];
    return Object.values(acc).sort(
      (x, y) =>
        order.indexOf(x.fx.group) - order.indexOf(y.fx.group) ||
        x.fx.name.localeCompare(y.fx.name)
    );
  }, [picks, bonus, offhand]);

  const weaponSummary = (slotId, label) => {
    const elems = weaponElemsOf(slotId);
    const rows = picks[slotId]
      .filter(Boolean)
      .map((id) => WFX[id].fmt(weaponMag(WFX[id], elems, bonus)));
    return rows.length ? { label, rows, boosted: elems.size > 0 && picks[slotId].filter(Boolean).length > 1 } : null;
  };

  const wMain = weaponSummary("main", "Main hand");
  const wOff = offhand === "weapon" ? weaponSummary("off", "Off hand") : null;
  const pieceCount = useMemo(() => {
    const slots = [...ARMOR_SLOTS.map((s) => s.id), ...(offhand === "shield" ? ["shield"] : [])];
    return slots.reduce((n, s) => n + picks[s].filter(Boolean).length, 0);
  }, [picks, offhand]);

  return (
    <div
      className="min-h-screen w-full"
      style={{
        background: "radial-gradient(1200px 500px at 50% -10%, #1b2230 0%, #101318 55%)",
        color: "#e8e3d3",
        fontFamily: "'Jost', sans-serif",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@500;600&family=Jost:wght@300;400;500;600&display=swap');
        select option, select optgroup { background: #171b22; color: #e8e3d3; }
        input[type=range] { -webkit-appearance: none; appearance: none; height: 2px;
          background: linear-gradient(to right, #86b9e0, #c9a96e); outline: none; }
        input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; appearance: none;
          width: 18px; height: 18px; background: #101318; border: 2px solid #86b9e0;
          transform: rotate(45deg); cursor: pointer; }
        input[type=range]::-moz-range-thumb { width: 16px; height: 16px; background: #101318;
          border: 2px solid #86b9e0; transform: rotate(45deg); cursor: pointer; border-radius: 0; }
        button:focus-visible, select:focus-visible { outline: 2px solid #86b9e0; outline-offset: 1px; }
      `}</style>

      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* ---------- Header ---------- */}
        <header className="text-center mb-6">
          <div style={{ color: "#c9a96e", letterSpacing: "0.5em", fontSize: 11 }}>◆ ◆ ◆</div>
          <h1
            className="mt-2"
            style={{
              fontFamily: "'Cinzel', serif",
              fontWeight: 600,
              fontSize: "clamp(22px, 5vw, 34px)",
              letterSpacing: "0.22em",
              textTransform: "uppercase",
            }}
          >
            Arcane Enchanter
          </h1>
          <p className="text-xs mt-1" style={{ color: "#8b8d93", letterSpacing: "0.08em" }}>
            Skyrim Special Edition · full-loadout planner · two effects per item (Extra Effect)
          </p>
          <p className="text-xs mt-2 max-w-md mx-auto" style={{ color: "#6b6e75" }}>
            Baseline: 100 Enchanting, Enchanter 5/5, Insightful · Corpus · Fire/Frost/Storm
            Enchanter, grand souls. Vanilla slot rules (per UESP).
          </p>
        </header>

        {/* ---------- Scaling slider ---------- */}
        <section
          className="rounded-sm p-4 mb-6"
          style={{ background: "#171b22", border: "1px solid rgba(201,169,110,0.28)" }}
        >
          <div className="flex items-baseline justify-between">
            <span
              className="text-xs uppercase"
              style={{ color: "#c9a96e", fontFamily: "'Cinzel', serif", letterSpacing: "0.18em" }}
            >
              Enchanting Bonus
            </span>
            <span className="text-xl" style={{ color: "#86b9e0", fontWeight: 500 }}>
              ×{bonus.toFixed(2)}
            </span>
          </div>
          <input
            type="range"
            min="1"
            max="2"
            step="0.01"
            value={bonus}
            onChange={(e) => setBonus(parseFloat(e.target.value))}
            className="w-full mt-3"
            aria-label="Enchanting bonus multiplier"
          />
          <div className="flex flex-wrap gap-1.5 mt-3">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                onClick={() => setBonus(p.v)}
                className="text-xs px-2 py-1 rounded-sm"
                style={{
                  border: `1px solid ${Math.abs(bonus - p.v) < 0.005 ? "#86b9e0" : "rgba(201,169,110,0.25)"}`,
                  color: Math.abs(bonus - p.v) < 0.005 ? "#86b9e0" : "#a9a698",
                  background: "transparent",
                }}
              >
                {p.label} ×{p.v.toFixed(2)}
              </button>
            ))}
          </div>
          <p className="text-xs mt-2" style={{ color: "#6b6e75" }}>
            Covers Fortify Enchanting potions, Seeker of Sorcery (+10%), Ahzidal's Genius,
            Necromage as a vampire (+25%), Rare Curios potions, etc. — stacked multiplicatively
            on top of the natural max.
          </p>
        </section>

        {/* ---------- Off-hand style ---------- */}
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xs uppercase" style={{ color: "#8b8d93", letterSpacing: "0.12em" }}>
            Off-hand:
          </span>
          {[
            ["shield", "Shield"],
            ["weapon", "Weapon"],
            ["none", "None (2H / bow)"],
          ].map(([v, l]) => (
            <button
              key={v}
              onClick={() => setOffhand(v)}
              className="text-xs px-2.5 py-1 rounded-sm"
              style={{
                border: `1px solid ${offhand === v ? "#c9a96e" : "rgba(201,169,110,0.25)"}`,
                color: offhand === v ? "#c9a96e" : "#8b8d93",
              }}
            >
              {l}
            </button>
          ))}
        </div>

        {/* ---------- Apparel slots ---------- */}
        <div className="grid gap-3">
          {ARMOR_SLOTS.map((s) => (
            <SlotCard
              key={s.id}
              label={s.label}
              hint={s.hint}
              picks={picks[s.id]}
              setPicks={setSlot(s.id)}
              effects={ARMOR_EFFECTS.filter((e) => e.slots.includes(s.id))}
              bonus={bonus}
            />
          ))}
          {offhand === "shield" && (
            <SlotCard
              label="Shield"
              hint="Any shield"
              picks={picks.shield}
              setPicks={setSlot("shield")}
              effects={ARMOR_EFFECTS.filter((e) => e.slots.includes("shield"))}
              bonus={bonus}
            />
          )}
          <SlotCard
            label="Main Hand"
            hint="Weapon · per-hit effects"
            picks={picks.main}
            setPicks={setSlot("main")}
            effects={WEAPON_EFFECTS}
            bonus={bonus}
            isWeapon
            weaponElems={weaponElemsOf("main")}
          />
          {offhand === "weapon" && (
            <SlotCard
              label="Off Hand"
              hint="Dual-wield weapon"
              picks={picks.off}
              setPicks={setSlot("off")}
              effects={WEAPON_EFFECTS}
              bonus={bonus}
              isWeapon
              weaponElems={weaponElemsOf("off")}
            />
          )}
        </div>

        {/* ---------- Totals ---------- */}
        <section
          className="mt-6 rounded-sm p-4"
          style={{ background: "#0d1015", border: "1px solid rgba(201,169,110,0.35)" }}
        >
          <div className="flex items-baseline justify-between mb-3">
            <h2
              style={{
                fontFamily: "'Cinzel', serif",
                letterSpacing: "0.2em",
                fontSize: 14,
                color: "#c9a96e",
                textTransform: "uppercase",
              }}
            >
              Active Effects
            </h2>
            <span className="text-xs" style={{ color: "#6b6e75" }}>
              {pieceCount} apparel enchantments
            </span>
          </div>

          {totals.length === 0 && !wMain && !wOff ? (
            <p className="text-sm" style={{ color: "#6b6e75" }}>
              Pick enchantments above — stacked totals appear here, like the in-game Active
              Effects list.
            </p>
          ) : (
            <div className="grid gap-1.5">
              {totals.map(({ fx, sum, count }) => {
                const capped = fx.cap != null && sum > fx.cap;
                const shown = fx.fixed ? null : capped ? fx.cap : sum;
                return (
                  <div
                    key={fx.id}
                    className="flex items-baseline justify-between text-sm py-1"
                    style={{ borderBottom: "1px solid rgba(201,169,110,0.12)" }}
                  >
                    <span>
                      {fx.fixed ? fx.fmt() : fx.fmt(shown)}
                      <span className="ml-2 text-xs" style={{ color: "#6b6e75" }}>
                        ×{count}
                      </span>
                    </span>
                    {capped && (
                      <span className="text-xs" style={{ color: "#c9a96e" }}>
                        cap {fx.cap}% (raw {sum}%)
                      </span>
                    )}
                    {!capped && fx.cap === 100 && sum >= 100 && (
                      <span className="text-xs" style={{ color: "#86b9e0" }}>
                        free casting
                      </span>
                    )}
                  </div>
                );
              })}
              {[wMain, wOff].filter(Boolean).map((w) => (
                <div key={w.label} className="mt-2">
                  <div
                    className="text-xs uppercase mb-1"
                    style={{ color: "#c9a96e", letterSpacing: "0.15em" }}
                  >
                    {w.label} · per hit
                  </div>
                  {w.rows.map((r, i) => (
                    <div key={i} className="text-sm" style={{ color: "#86b9e0" }}>
                      ◆ {r}
                    </div>
                  ))}
                  {w.boosted && (
                    <div className="text-xs mt-0.5" style={{ color: "#8b8d93" }}>
                      Paired effects share elemental perk boosts (Augmented ×1.5 per element on
                      the weapon)
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        <footer className="text-xs mt-4 leading-relaxed" style={{ color: "#5b5e64" }}>
          Magnitudes use UESP's formula, floored: base × 1.2529 (skill 100) × 2 (Enchanter 5/5)
          × 1.25 (matching perk) × bonus. Elemental resists & Resist Magic cap at 85%; spell
          cost reduction is fully effective at 100%. Muffle & Waterbreathing are fixed and
          ignore the slider. Chaos is Dragonborn; second copies of Absorb Magicka/Stamina and
          Shield-of-Solitude Resist Magic variants aren't modeled.
        </footer>
      </div>
    </div>
  );
}
