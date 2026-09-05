# Job Board UX revamp — design brief

The Flip Desk's Job Board (`tools-src/runescape/flip-desk.jsx`, `JobBoard` /
`JobCard`) prices skilling work off the live exchange: buy the inputs, do the
work, sell the product. It has grown muddy. This brief diagnoses why, states
what an OSRS-feeling interface does instead, and specifies three prototypes.

## Diagnosis — why it reads as muddy

1. **The control panel is a form, not a board.** Mode buttons, a focus
   select, search, a toggle, six level inputs, a members box, a RuneScape
   name field, a Hiscores button and a row of quest checkboxes — all open,
   all the time, above the content. The sheet is set once a month; it should
   not sit on top of every visit.
2. **Every job is a full contract.** Thirty stacked stone panels of equal
   weight, each with a title, five to nine chips, a BUY/WORK/SELL ledger,
   five facts, batch buttons and up to two warnings. There is nothing to scan
   and no way to compare two jobs. A board should be a board; the contract
   is what you read after you pick one.
3. **Two vocabularies fight.** Trading-desk talk ("Take the market", "Quote &
   wait", "check the tape", "unusually rich", "you lay out") sits beside the
   game's words ("Smith 500× Cannonball", "Smithing 35", "Dwarf Cannon"). A
   RuneScape player reads the desk talk as noise.
4. **Two orthogonal modes both hide in the toolbar** (start now / full
   margin; best pay / train a skill) and each silently re-ranks the whole
   board with no visible change of shape.
5. **Warnings say everything twice** — a chip in the meta row and a note at
   the bottom of the card — and the footer is a 200-word wall.
6. **Requirements show ✓/✗ but can't be fixed where they are shown**; the
   sheet lives somewhere else on the page.

## What OSRS interfaces do — the principles this board should follow

- **One interface, one job.** Each OSRS panel does one thing and is dense
  but undecorated. The surface is a list; detail is on click or hover
  ("examine"). Nothing needs a hero.
- **The list is the unit.** Skill guide, quest list, collection log, music,
  the Sailing notice board: rows of icon + name + number, scrolling inside a
  bevelled stone panel, with a two-pane list/detail split when there is
  detail to show.
- **Colour is semantic and never decorative.** Orange (`#ff981f`) titles;
  yellow (`#ffff00`-ish) is hover/selected; green means can do / done and
  red means can't / not done (the quest list, requirement lines); white body
  text carries a 1px black shadow. There is no fourth accent.
- **Requirements are checklists.** A quest journal lists what you need as
  lines with a tick or a cross, in the game's own units ("Smithing 35",
  "Dwarf Cannon").
- **The player's stats are their own tab.** The skills tab is a grid of
  icons with a level; it is where you go to see yourself, not a form pasted
  onto every screen.
- **Left-click does the obvious thing; hover examines.** Right-click offers
  options. No control needs a paragraph beside it.
- **Fixed-mode discipline.** The classic client is 765×503: interfaces fit,
  scroll inside themselves, and never sprawl. Respect the player's time —
  the first screen already says what to do.

## Non-negotiables for every prototype

- **Same data.** Load `./jobs-mock.js` (it defines `window.JB`: `JOBS`,
  `SHEET`, `SKILLS`, `math()`, `canDo()`, `blocker()`, `rank()`, formats).
  Do the arithmetic through `JB.math(job, mode, n)` so all three agree.
- **Same palette and type**, lifted from `.ge-root` in `flip-desk.jsx`:
  stone `#3e3529` (hi `#554a38`, lo `#241f18`), edge `#0d0b08`, inset
  `#2b2620` / `#211d17`, page `#1b1712`; orange `#ff981f`, yellow `#ffe93f`,
  white `#f3ecdc`, tan `#b3a284`, dark tan `#8a7a5f`; good `#57d957`, warn
  `#e8b13c`, bad `#f26060`; members purple `#d0a0e8`. Display face Cinzel
  (Google Fonts), body `'Segoe UI', system-ui, sans-serif`, numbers in a
  monospace stack with `tabular-nums`. The bevelled stone panel
  (`inset 1px 1px 0 hi, inset -1px -1px 0 lo` on a 1px edge border) is the
  house style — reuse it.
- **Everything the board does today, kept:** the mode toggle; a training
  focus; search; "only what I can start"; the sheet (six levels, members,
  quests, RuneScape name + a Hiscores button — mock it by filling the sheet
  from `JB.SHEET`); the batch control (−/+/Max, with the capped note); the
  ledger (buy lines with fill clocks in full-margin mode, fees, work steps
  with time, the sell line less tax — or for alch jobs "coins straight to
  your pouch, no sell leg, no tax"); the facts (costs, pays, xp, return,
  takes about; gp per xp when training); the flags (≈N% crush, thin data,
  too good?, P2P, capped); an empty state.
- **Vocabulary — the game's words, not the desk's.** Mode is "Start now"
  (sub: insta-buy the inputs, insta-sell the product — thinner pay, done
  today) vs "Full margin" (sub: offers at the week's going rates — the whole
  margin, about a day per leg). "You lay out" → **Costs**. "The job pays" →
  **Pays**. "check the tape ⚠" → **thin data**. "unusually rich ⚠" → **too
  good?**. Keep Smelt / Smith / Cut / Mix / Cook / Enchant / High alch as the
  verbs, levels as "Smithing 74", quests by name.
- **Live.** Changing mode, focus, search, toggle or any sheet value re-ranks
  the board immediately. The sheet persists in `localStorage`.
- **Responsive.** Correct at the desk's 1120px max width and on a 390px
  phone. Wide things scroll inside their own container; the page never
  scrolls sideways.
- **Scales.** 27 jobs today; the real board shows up to 30 of 100+. The
  design must not get harder to scan with more rows.
- **Accessible.** Keyboard-navigable list, visible focus, ARIA roles for
  tabs/lists/dialogs, `prefers-reduced-motion` respected.
- **Plain.** One HTML file, vanilla JS and CSS, no framework, no external
  assets beyond Google Fonts. Icons as inline SVG or the glyphs in
  `JB.SKILL_GLYPH`. Dark-first single theme is fine (the desk is dark) but
  paint every colour explicitly.
- A small label in the masthead sub-line: "Prototype A · Notice Board" etc.

## The three directions

### A — Notice Board

The board is literally a board, like the Sailing port notice boards. A
compact toolbar (mode, train-a-skill, search, toggle), then a slim
**character strip** showing the six skills as glyph + level, P2P, quests
done; click it to unfold the sheet editor. Then the board: a dark wooden
ground with **notices** pinned in a responsive grid (about 250px minimum
each, three or four across at desk width). A notice carries only the
essentials: the job title ("Smith Cannonballs"), the pay in one big number,
one line of batch × time · costs, a requirement line of green/red chips and
any flag stamps. Notices you can't start are faded (or hidden by the
toggle). In training mode the big number becomes gp per xp and the second
line shows the xp. **Click a notice and it lifts into a contract** (a modal
stone panel): requirement checklist, the plan as numbered BUY/WORK/SELL
steps, the batch control, the facts, the warnings, Esc to close. The
aesthetic risk to take: the notices as light parchment with dark ink on the
dark site, so the board reads as paper on wood rather than more stone.

### B — Skill Guide (two-pane)

The Collection Log / Quest List pattern: a **list pane** on the left (about
360px) and a **journal pane** on the right. The list pane wears an OSRS
side-panel **tab strip with icons — Jobs · Skills · Quests**. Jobs: search,
toggle, the mode switch and skill picker in two compact rows, then a list
that scrolls inside the panel (OSRS-styled scrollbar): one row per job with
the skill glyph, "Smith Cannonballs", and the pay right-aligned (gp per xp
when training). **Row names take the quest-list colours**: green you can
start it, red you can't, yellow you can but it wears a flag. Selected row is
highlighted; ↑/↓ move the selection. Skills tab: the skills tab itself, a
two-column grid of tiles "glyph · Smithing · 62", click a tile to edit the
level inline, a members tile, RuneScape name + Hiscores below. Quests tab:
the gating quests as green/red rows with checkboxes. The journal pane shows
the selected job: title, an examine line, requirement lines with ✓/✗ and
what you have, the batch control, the plan as a ledger, the facts, the
warnings. Under about 760px the list fills the screen and a tap slides the
journal in with a "‹ Board" button. The risk: make it feel like a
fixed-mode interface — panels fixed to the viewport height, content
scrolling inside them.

### C — Ledger (table with expanding rows)

Consistency with the sibling Market Board tab: the board is a **sortable
table**, one row per job. Toolbar: the mode switch with its one-line hint, a
pill row for training (Best pay · ⚒ Smithing · ✂ Crafting · …), search, the
toggle, and a **Sheet button** with a compact summary ("Smithing 62 ·
Crafting 71 · … · P2P · 2 of 5 quests") that opens a **drawer** from the
right with the full sheet editor. Columns: Job (verb + item, P2P badge, flag
stamps), Needs (green/red chips; for a blocked job just the blocker), Pays,
Costs, Time, Xp, and gp/xp when training; sticky header; click a header to
re-rank. Rows you can't start are dimmed. **Click a row and it expands in
place** into the ledger — buy lines, work steps, sell line, batch control,
facts, warnings — and click again to fold it. Under 720px each row becomes
a labelled card so nothing is lost. The risk: it is the least
"OSRS-looking" of the three; earn the feel through the stone bevels, the
colour rules and the type, not through texture.

## How they will be judged

Open each with the same sheet (Peli: Smithing 62, Crafting 71, Fletching
84, Cooking 88, Herblore 55, Magic 74, members, Dwarf Cannon and The Tourist
Trap done). Ask: in three seconds, which job would I start? How many clicks
to see what to buy? Can I find out why a job is red and fix it? Does
"Train Smithing" change the board's shape, not just its order? Does it still
work on a phone?

## Research addendum — verified OSRS conventions to apply

Sourced from the OSRS Wiki (Quest List, Music Player, Choose Option, Text
color, Interface, Sailing notice board / Captain's Log pages) and Jagex's
2024–25 interface blogs.

- **Status colours are literal and fixed.** Quest list: red = not started,
  yellow = in progress, green = complete, grey = unavailable. Music list:
  green unlocked, red locked, grey never, blue playing. Use exactly this for
  job rows: green = you can start it, red = you can't, yellow = you can but
  it wears a flag, grey = not on this account (F2P).
- **Right-click menu colours by entity type**: items `#ff9040`, NPCs
  `#ffff00`, scenery `#00ffff`, spells `#00ff00`. Item names may take the
  item orange; spells (alch, enchant, Lunar casts) may take spell green.
- **Text carries a hard 1px black shadow, never a blur.** Default body text
  is warm off-white or yellow, never grey.
- **Hard edges.** Flat bevels (light top-left, dark bottom-right) on a
  stone ground; radius at most 2px; no soft shadows on panels (a modal's
  drop shadow is the one exception), no gradient fills on surfaces, no
  animated fills. Progress and offer states are plain green/yellow/red bars.
- **"Stone button style"** is Jagex's own name for the bevelled button —
  keep it as the button.
- **The Captain's Log** (the Sailing task list) sorts tasks by completion
  status, by area, and by *whether requirements are met* — the game's own
  precedent for "only what I can start" and for a requirements-met sort.
- **Fixed mode is ~765×503.** Interfaces fit and scroll inside themselves.
- **Fonts.** The real client uses bitmap fonts (fan clones "RuneScape UF" /
  "RuneScape Chat" are not on Google Fonts, so not loadable here). Keep
  Cinzel for titles and the system face for body; a pixel face from Google
  Fonts (Silkscreen or Pixelify Sans) may be tried for tab strips, stamps
  and small caps labels only if it stays legible at 11–12px.
- **What reads as fake** on fan sites: smooth gradients, blurred shadows,
  rounded corners, anti-aliased display type scaled down, card grids with
  imagery where a plain list would do. Detail lives behind hover or click.
- The notice board's own pixel layout could not be verified from text
  sources; "paper notices pinned to wood" is genre convention, not fact.
  Prototype A may use it, but the notices must still obey the rules above.
