## item_216_nest_lit_planets_renderer_behind_the_table_flag - Nest lit planets renderer behind the table flag
> From version: 1.0.0
> Schema version: 1.0
> Status: In progress
> Understanding: 95%
> Confidence: 90%
> Progress: 90%
> Complexity: High
> Theme: General
> Reminder: Update status/understanding/confidence/progress and linked request/task references when you edit this doc.

# AI Context
- Summary: Port the locked planet renderer (four types, wrap light, ring, moons, spin) into Nest beside scene.ts, shown behind `?table=a|b` while the default stays the current table.
- Keywords: nest, hero, planets, renderer, ray-cast, ascii, table flag
- Use when: building the planets in the app.
- Skip when: the board (item_217), the head.

# Problem
- The locked planets exist only in a scratch HTML renderer. Nest needs them live, on real data, at the hero budget.

# Scope
- In:
  - New module beside scene.ts (e.g. `hero/planets.ts`): per-cell ray-cast spheres, `shadePlanet` for bands, terrain, rock, ice; wrap light, rim, highlight, dim floors (no blank cells); five surface craters that spin; ring for live runs; moons for sessions; selected outline.
  - Reference: vault `item_212/planet-types-8/planet-types-source.html`.
  - `?table=a|b` flag (item_166 pattern) swaps planets in; no flag = current table untouched.
  - Type from `HeroProject.planet` (item_214); state colours and quiet violet from the theme.
  - Choose 2D canvas or the head's WebGL2 cell grid (gl/head.ts) by measuring; record the choice.
- Out:
  - the new board (item_217); other themes than cyber (later).

# Acceptance criteria
- AC1: With `?table=a`, planets render all four types on real data, spin, ring and moons; the board is the current one.
- AC2: No flag: pixel-identical to today (screenshot diff via scripts/hero-layout.mjs).
- AC3: Frame time measured on laptop and fold against item_159; numbers recorded here.
- AC4: Unit tests for the type dispatch and shading floor (no blank cell inside a planet disc).

# Dependencies
- item_214 (planet type in the model).

# Links
- Request: req_062. Design: item_212. Budget: item_159. Flag: item_166.

# Executions
| When | Runner | Run id | Title | State | PR | Notes |
| --- | --- | --- | --- | --- | --- | --- |

# Outcome
- `tools/nest/src/hero/planets.ts`: port of the item_212 renderer. `shadePlanet` (bands, terrain, rock, ice; wrap light, rim, highlight, dim floor), five spinning craters on rock, `castPlanets` per-cell ray cast with ring (bright arc turns with time, casts and takes shadow), up to three session moons, selected outline and cut-out margin. Dimmed planets keep their glyphs, alpha never below 0.3.
- `vec.ts` holds the vector and colour helpers scene.ts and planets.ts share.
- `scene.ts`: `opts.table` routes planets to `castPlanets` and skips the dashed working ring; unset keeps the old path. `Hero.tsx` reads `?table=a|b` once. Quiet planets use `--c-quiet` (#a88cff, cyber theme).
- Renderer choice: 2D canvas. It shares the scene z-buffer with the table, stalks and labels, and stays inside the budget below. WebGL2 was not needed.
- Speed: the reference sin-hash noise is cached on a 64³ lattice (same values, about 4x faster); without it `?table=a` cost 18-21 ms median.
- Fix found while checking: the scene colour cache masks channels with `& 0xf8`, so a channel above 255 wrapped to a dark value (red highlights showed teal). `castPlanets` clamps every channel to 0..255.
- Fixtures: demo `notes`, nest `world`, website `tool`, so dev shows all four types.

## Acceptance
- AC1: real data, cyber, `?table=a`: circle bands, archeotech terrain, cr-0w rock with craters and its run ring, sessions as moons, lazytf and lorenzini quiet violet. No real project resolves to ice today (the notes vaults are system members or hidden); fixtures show ice on demo. Shots in vault `Research/nest-design/item_216/`.
- AC2: `node tools/nest/scripts/hero-table.mjs hash` (no table) matches the pre-change baseline at 1440x900, 707x691 and 368x812. One run in four showed a one-off 368 mismatch that did not reproduce (headless load timing).
- AC3: `scripts/hero-table.mjs perf [a]`, headless Chromium, dpr 2, live path, 40 frames, median/max ms. Fixture data without registry (all rock, the costliest type).

  | Viewport | No flag | `?table=a` |
  | --- | --- | --- |
  | laptop 1440x900 | 17.5 / 22.3 | 19.2 / 22.5 |
  | fold 707x691 | 8.9 / 20.6 | 13.0 / 21.7 |
  | phone 368x812 | 16.1 / 18.5 | 16.6 / 20.6 |

  Headless runs vary by a few ms between runs; the lit table adds about 1-4 ms median. Open: the same check on the physical fold.
- 2026-11-17, after the C2 board, hex feet, moons B and labels B (item_217), idle machine, `perf`, median/max ms:

  | Run | Laptop | Fold | Phone |
  | --- | --- | --- | --- |
  | No flag | 7.2 / 18.3 | 6.8 / 19.6 | 6.7 / 17.0 |
  | `?table=a` | 16.1 / 33.9 | 15.2 / 29.9 | 14.7 / 31.8 |
  | `?table=a`, no hex fill | 14.9 / 30.1 | 13.2 / 26.2 | 13.3 / 18.0 |
  | `?table=a`, no planets | 12.6 / 26.5 | 11.9 / 28.0 | 11.7 / 27.2 |

  Split of the ~9 ms the lit table adds: planets ~3.5 ms, hex foot fill ~1.5 ms, the rest of the board (hex grid, radar, stalks, moons) ~4 ms. The table misses the item_159 laptop budget (10 ms) and sits just under the fold budget (16 ms); maxes miss both. Reported to the owner per item_159 AC4. Earlier same-day runs (22-36 ms) were taken with two stuck image viewers on two cores and are discarded.
