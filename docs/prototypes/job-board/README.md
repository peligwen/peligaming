# Job Board UX prototypes

Three click-through prototypes for revamping the Flip Desk's Job Board, built
against one shared mock dataset so the comparison is about layout and
interaction rather than content. `BRIEF.md` carries the diagnosis of the
current board, the OSRS interface principles the redesign follows, and the
spec each prototype was built from.

| File | Direction | One line |
| --- | --- | --- |
| `a-notice-board.html` | Notice Board | Parchment notices pinned to a board; click one to read its contract |
| `b-skill-guide.html` | Skill Guide | Two panes: a quest-list-coloured job list beside a journal for the selected job |
| `c-ledger.html` | Ledger | A sortable table like the Market Board; a row expands in place into its plan |

`jobs-mock.js` holds 27 plausible jobs (20 paying, 7 training-only), the
sample sheet (Peli: Smithing 62, Crafting 71, Fletching 84, Cooking 88,
Herblore 55, Magic 74, members, two of five quests done) and the batch
arithmetic every prototype shares.

To open them locally:

```sh
python3 -m http.server -d docs/prototypes/job-board 8080
# then http://localhost:8080/a-notice-board.html (or b-, c-)
```

Opening the files directly (`file://`) also works.

These are prototypes, not the tool: none of them talk to the exchange or the
hiscores, and the Hiscores button simply fills in the sample sheet.
