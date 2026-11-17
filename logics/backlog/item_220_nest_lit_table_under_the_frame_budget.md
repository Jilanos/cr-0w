## item_220_nest_lit_table_under_the_frame_budget - Nest lit table under the frame budget
> From version: 1.0.0
> Schema version: 1.0
> Status: Ready
> Understanding: 80%
> Confidence: 70%
> Progress: 0%
> Complexity: Medium
> Theme: General
> Reminder: Update status/understanding/confidence/progress and linked request/task references when you edit this doc.

# AI Context
- Summary: Bring the lit holotable (`?table=a|b`) under the item_159 frame budget: 10 ms laptop, 16 ms fold, median, live path. Today 16.1 ms laptop, 15.2 ms fold.
- Keywords: nest, hero, holotable, frame time, perf, cache, table flag
- Use when: speeding up the lit table in `tools/nest/src/hero/scene.ts` and `planets.ts`.
- Skip when: changing the look (owner picks in item_217 are locked: C2 board, moons B, labels B).

# Problem
- The lit table adds about 9 ms per frame over the default table (item_216 Outcome, 2026-11-17 idle run): planets ~3.5 ms, hex foot fill ~1.5 ms, rest of the board (hex grid, radar, stalks, moons) ~4 ms. Laptop misses its 10 ms budget; fold is 0.8 ms under 16 ms; maxes miss everywhere.

# Scope
- In:
  - Profile one live frame first (Chrome performance trace via `scripts/hero-table.mjs` or a `?bench=N` run) and record the top costs before changing code.
  - Cache what does not change between frames: the hex grid and foot fills only move with `spin`; draw them once per spin step (or into an offscreen grid) and reuse.
  - Cut splat counts where the look holds: hex fill step (`0.02 / e`), moon orbit dots and trail strands (`moonTrails`), stalk steps.
  - Planets: reuse the per-cell ray cast for cells outside every planet's screen box (skip them early), check the noise cache hit rate.
- Out:
  - Look changes. Any visible change goes to the owner as before/after shots first (crow-compare).
  - The default table (no flag): stays pixel-identical.

# Acceptance criteria
- AC1: `scripts/hero-table.mjs perf a` on an idle machine: median under 10 ms at 1440x900 and under 16 ms at 707x691, recorded in this item with before/after.
- AC2: No flag stays pixel-identical (`scripts/hero-table.mjs hash` vs baseline).
- AC3: Real-app shots of `?table=a` (laptop, phone, with injected sessions) match the current look; any difference shown to the owner before commit.
- AC4: tsc clean, vitest green.

# Dependencies
- item_216, item_217 (built). Budget: item_159.

# Links
- Request: req_062. Budget: item_159. Numbers: item_216 Outcome (2026-11-17).

# Priority
- Priority: Medium
- Rationale: The lit table is behind a flag; the budget gates making it the default.

# Notes
- Measure on an idle machine: check `ps -eo pcpu,args --sort=-pcpu | head` first. Stuck image viewers once doubled the numbers.
- Headless scripts need `PLAYWRIGHT_BROWSERS_PATH` set to the local Playwright browser cache.

# Executions
| When | Runner | Run id | Title | State | PR | Notes |
| --- | --- | --- | --- | --- | --- | --- |
