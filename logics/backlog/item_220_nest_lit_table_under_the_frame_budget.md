## item_220_nest_lit_table_under_the_frame_budget - Nest lit table under the frame budget
> From version: 1.0.0
> Schema version: 1.0
> Status: In progress
> Understanding: 90%
> Confidence: 70%
> Progress: 70%
> Complexity: Medium
> Theme: General
> Reminder: Update status/understanding/confidence/progress and linked request/task references when you edit this doc.
> Indicators reviewed: 2026-11-19 17:46:49

# AI Context
- Summary: Bring the lit holotable (`?table=a|b`) under the item_159 frame budget: 10 ms laptop, 16 ms fold, median, live path. Today 16.1 ms laptop, 15.2 ms fold.
- Keywords: nest, hero, holotable, frame time, perf, cache, table flag
- Note: the lit table is now the default (no flag); the budget applies to the live hero.
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
- AC5 (from item_218): when a device misses the budget, the hero falls back to the plain table; proven by a forced slow run.

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
- 2026-11-19: frame times with the lit table as default, before the table fit: laptop 7.4/18.0 ms, inner 20.1/32.5 ms, phone 8.4/12.4 ms (drawScene median/max). Inner was the worst; the item_259 fit (c292f40) shrinks its planets, so measure again on an idle machine first. Top self time on inner: fillText 15.7%, fillRect 5.7%, draw 4.2%, castPlanets 3.2%.
- 2026-11-19: `hero-table.mjs bench a` measures under load (frame/calib ratio + exact canvas call counts). Baseline, 3 runs on a loaded machine (load avg 8), frame now includes the raster flush: laptop ratio 5.7-7.0 (p10 4.3-5.0), inner 6.3-6.7 (p10 4.2-4.9), cover 4.2-4.4 (p10 3.2-3.3). Per frame: laptop 3674 fillText / 879 fillRect / 6024 chars, inner 4826 / 1828 / 7308, cover 3237 / 1057 / 5105. Use these to judge each change; AC1 absolute ms still needs one idle run.
- 2026-11-19 change: in the lit table, each pass draws its planet cell backgrounds as one cols x rows image, scaled up without smoothing, instead of one fillRect per cell. Their glyphs then join the text runs. Per frame: fillRect 879/1828/1057 → 0, fillText 3674/4826/3237 → 3518/4367/3032. Bench p10 ratio (load avg 10): laptop 4.2-4.9, inner 3.7-3.8, cover 2.6-2.8. Pixel diff: 0.16-0.40% of pixels, on planet rims only; identical at 3x zoom. Default hash unchanged.
- Tried, reverted: 16-step alpha for text runs. It cut fillText by another 15% but changed 2.5-3.5% of pixels (a look change).
- Remaining lever: about 3000-4400 fillText calls per frame, mostly single glyphs (distinct alpha per cell). Only a WebGL cell-grid renderer (glyph atlas, the gl/head.ts pipeline) removes them. Owner chose WebGL: item_270.
- Next in order: item_220, then item_259 (mockups first), then item_221 (owner 2026-11-19).

# Outcome (2026-11-17)
- Profile (`hero-table.mjs prof a`, new mode): fillText and the canvas flush (drawImage) were ~40% of the lit frame. With no glyph drawing at all the frame was 6.4 ms.
- Changes, lit table only, pixel-identical (lit hash and pixel diff unchanged, default hash unchanged):
  - `paint`: neighbour ASCII glyphs of one style go out as one fillText, letter-spaced to the cell width (avg run 1.8 cells).
  - `hexOnPlane`: corners projected once, samples lerp x*z, y*z, z (feet fill was the top JS cost).
- Tried, no gain, reverted: glyph atlas (drawImage per cell, slower), per-row batched sphere backdrops.
- `perf a`, median/max ms, back to back on the same machine:

| Size | Before | After | Budget | Default |
|---|---|---|---|---|
| 1440x900 | 16.3/42 | 12.4/21 | 10 | 7.5 |
| 707x691 | 14.6/30 | 11.3/23 | 16 | 6.9 |
| 368x812 | 14.6/32 | 11.3/24 | 16 | 7.0 |

- AC1: fold passes, laptop misses by 2.4 ms (reported to the owner, item_159 AC4). Bench spins every frame (drag worst case); at rest spin is fixed.
- Left to reach 10 ms: cache the board and feet per spin value (helps rest, not drag), or look trims (owner pick).
- AC3: drawScene frames are bit-identical to before, so the real app look is unchanged. AC4: tsc clean, vitest 200 green.

# Executions
| When | Runner | Run id | Title | State | PR | Notes |
| --- | --- | --- | --- | --- | --- | --- |
