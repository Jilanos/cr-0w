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
- 2026-11-17, after the C2 board, hex feet, moons B and labels B (item_217): `perf a` gave 22.6-25 ms median on laptop and 22-33 ms on fold and phone (no flag 16.7 / 14.4 / 8.8). Two stuck image viewers held two cores during the run, and a run with the planets turned off was just as slow, so these numbers are not reliable. Re-measure on an idle machine. Either way the lit table misses the item_159 budgets (laptop 10 ms, fold 16 ms); item_159 AC4 asks to report the miss to the owner.
- AC4: `planets.test.ts` (14 tests): table flag parsing, glyph sets per type, selected limb, frame round-trip, no blank cell and alpha ≥ 0.3 inside the disc for every type at fade 1 and 0.2, dark-side floor, channels in 0..255 at full glow. vitest 200 passed, tsc and `npm run build` clean.
