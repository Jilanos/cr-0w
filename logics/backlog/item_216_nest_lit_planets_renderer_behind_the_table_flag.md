## item_216_nest_lit_planets_renderer_behind_the_table_flag - Nest lit planets renderer behind the table flag
> From version: 1.0.0
> Schema version: 1.0
> Status: Ready
> Understanding: 85%
> Confidence: 75%
> Progress: 0%
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
