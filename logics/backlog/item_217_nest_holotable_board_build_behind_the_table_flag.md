## item_217_nest_holotable_board_build_behind_the_table_flag - Nest holotable board build behind the table flag
> From version: 1.0.0
> Schema version: 1.0
> Status: In progress
> Understanding: 90%
> Confidence: 85%
> Progress: 85%
> Complexity: High
> Theme: General
> Reminder: Update status/understanding/confidence/progress and linked request/task references when you edit this doc.

# AI Context
- Summary: Build the approved A and B boards under the lit planets behind `?table=a` and `?table=b`.
- Keywords: nest, holotable, board, war table, build, table flag
- Use when: building the boards after item_215 is approved.
- Skip when: the sketches are not approved yet.

# Problem
- The boards picked in item_215 need to run live with every data cue of the current table.

# Scope
- In:
  - Board A and board B as approved in item_215, beside scene.ts, sharing the planets module of item_216.
  - Every cue of the current table: priority height, state colour, ping beam, hover and select, labels (phone 1, laptop/web 3).
  - Build one board at a time; show it against the approved render and wait for an OK before the next (owner rule: UI rebuild one screen at a time).
- Out:
  - other themes until cyber is approved.

# Acceptance criteria
- AC1: `?table=a` and `?table=b` show the approved boards; default unchanged.
- AC2: Each data cue listed above works on both boards (checked against scene.ts behaviour).
- AC3: Owner OK on each board against its approved render.

# Dependencies
- item_215 approved; item_216 done.

# Links
- Request: req_062. Design: item_212, item_215.

# Executions
| When | Runner | Run id | Title | State | PR | Notes |
| --- | --- | --- | --- | --- | --- | --- |

# Outcome
- item_215 picked one board, C2 (hex grid plus radar centre), so `?table=a` and `?table=b` show the same board for now.
- 1df192a: C2 board in `scene.ts` behind the flag: hex grid, radar centre and sweep, per-planet blip, type sizes, labels (phone 1, laptop 3).
- 973e41a, a9645a7: hex feet (filled cell, bright edge, dashed outer hex on needs, stem broken on failed) replace the round shadows. Planets sized per type (`TSIZE`, x1.8 laptop, x1.75 phone) and still shrink toward the back.
- b2262f1, a9645a7: session moons, owner pick B (round 2): 0.4r moons, each on its own dotted orbit lane, pale '@' rim, dark gap against the planet, short comet trail. Moons get no hex marker (owner rule: keeps the board clear).
- 331a733: labels, owner pick B: the name sits on the table, centred under the planet's hex foot, on laptop and phone (above the planet the head hid it on phone). Every drawn planet and session moon blocks labels in the declutter pass, labelled or not.
- Compare pages and real-app shots: vault `Research/nest-design/item_217/` (`moons/`, `labels/`).

## Acceptance
- AC1: done for C2 on both flags. No flag stays pixel-identical (`scripts/hero-table.mjs hash`, 1440x900, 707x691, 368x812) after every commit above.
- AC2: state colour, priority stalk height, needs outer hex, failed broken stem, radar blip and labels 1/3 checked on real-data shots with injected sessions. Hover, select and the ping beam not re-checked by hand since the board landed. tsc clean, vitest 200 passed.
- AC3: open. Owner OK'd moons (B) and labels (B) on 2026-11-17; a final OK on the whole board is pending.
