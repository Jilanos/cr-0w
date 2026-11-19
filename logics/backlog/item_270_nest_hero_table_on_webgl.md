## item_270_nest_hero_table_on_webgl - Nest hero table on WebGL
> From version: 1.0.0
> Schema version: 1.0
> Status: Ready
> Understanding: 90%
> Confidence: 85%
> Progress: 0
> Complexity: high
> Theme: nest
> Reminder: Update status/understanding/confidence/progress and linked request/task references when you edit this doc.
> Indicators reviewed: 2026-11-19 17:46:49

# AI Context
- Summary: Draw the hero's cell grid (table, planets, board, bloom) with WebGL2 instead of Canvas 2D, reusing the live head's glyph pipeline, with the same look.
- Keywords: nest, hero, table, webgl, glyph atlas, fillText, bloom, frame budget
- Use when: Building or reviewing the WebGL table renderer in tools/nest/src/hero.
- Skip when: Changing what the table shows (layout, planets, labels): item_259, item_221.

# Problem
- Only the live head is WebGL today (src/hero/gl/head.ts, its own canvas under the table canvas). The table, planets, board, the baked head layer and the bloom are Canvas 2D: `paint()` in src/hero/scene.ts.
- After item_220 the lit frame still makes 3000-4400 fillText calls (mostly one glyph each, since neighbour cells differ in alpha) plus the 2D blur bloom. A 2D frame with no glyphs at all cost 6.4 ms (item_220 Outcome), so the 2D path cannot reach the 10 ms laptop budget.

# Scope
- In:
  - `gl/grid.ts`: a WebGL2 renderer for a `Grid` (scene.ts). It uploads `ch` (as an atlas slot index), `col`, `a`, `bg` and `z` as textures per frame and draws one full-screen glyph pass per layer, like GLYPH_FS in head.ts. Glyph atlas: every glyph the scene uses (ASCII 32-126 plus the non-ASCII ones in scene.ts), rendered once per font size and dpr.
  - Layers in today's order: cells behind `zSplit`, the baked head grid (scale, lean, offset as `HeadLayer`), the front cells. Blank cells clear what is under them, as now.
  - Bloom: the same two blurs as `paint()` (14 px at 0.55 and 3 px at 0.6, quarter resolution, additive), using head.ts BLUR_FS/COMP_FS. Share the code with head.ts rather than copy it (extract the shaders and pass helpers into `gl/common.ts`).
  - Hero.tsx: use the GL table when `liveHeadOk()` passes and fall back to `paint()` otherwise and on context loss. Labels and the DOM overlay stay as they are.
  - Bench: `hero-table.mjs bench a` reports the GL path (ratio, plus a GPU flush via `readPixels` of one pixel); `shot` and `hash` work on both paths.
- Out:
  - Moving the scene maths (drawScene ray casts, splats) to the GPU. The grid is still built on the CPU; only the drawing moves.
  - Merging the live head canvas into the table canvas.
  - Look changes. Any visible change goes to the owner as before/after shots first.

# Acceptance criteria
- AC1: The GL frame matches the 2D lit frame: pixel diff under 1% of pixels at laptop, inner and cover, and the owner OKs a before/after crop.
- AC2: `hero-table.mjs bench a`: p10 frame/calib ratio at least 2x lower than the 2D path on every size (2D baseline 2026-11-19: laptop 4.2-4.9, inner 3.7-3.8, cover 2.6-2.8). Canvas 2D calls per frame drop to a few.
- AC3: No WebGL2 or a lost context falls back to `paint()` with no blank frame (forced with a flag in the bench).
- AC4: The default plain table hash is unchanged on the 2D path (`hero-table.mjs hash`).
- AC5: tsc clean, vitest green, Nest rebuilt and shots checked on cover, inner, laptop and laptop with the chat folded (`scripts/hero-fit.mjs`).

# Execution order
1. Extract the shared GL helpers (program, textures, framebuffers, blur, composite) from head.ts into gl/common.ts. The head must stay bit-identical (head shots before/after).
2. Glyph atlas and one-layer grid pass on a test page; check the glyph placement against `paint()` with a pixel diff.
3. Layers (behind, head grid, front), blank clears and backgrounds.
4. Bloom, then wire into Hero.tsx with the fallback.
5. Bench, shots, owner review, then item_220 AC1/AC5 close with these numbers.

# Decision framing
- Product framing: Not needed
- Architecture framing: Not needed (follows the head.ts pipeline already in place)

# Links
- Product brief(s): (none yet)
- Architecture decision(s): (none yet)
- Request: req_062
- Primary task(s): (none yet)
- Follows: item_220 (2D limit reached). Budget: item_159. Head pipeline: item_156.

# Priority
- Priority: High
- Rationale: Last perf lever for the lit table, which is now the default. Comes before item_259 and item_221 (owner order 2026-11-19).

# Notes
- Owner 2026-11-19: go for WebGL.
- Bench under load: `PLAYWRIGHT_BROWSERS_PATH=<playwright cache> node scripts/hero-table.mjs bench a`, 2-3 runs; compare ratios, not ms.
- glyph positions in `paint()`: runs are letter-spaced to the cell width and centred glyphs shift by half the spacing; the atlas pass must place glyphs at the cell centre plus `CH/2 + 0.5`.

# Executions
| When | Runner | Run id | Title | State | PR | Notes |
| --- | --- | --- | --- | --- | --- | --- |
