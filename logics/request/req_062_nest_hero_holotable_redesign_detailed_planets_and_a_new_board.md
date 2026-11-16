## req_062_nest_hero_holotable_redesign_detailed_planets_and_a_new_board - Nest hero holotable redesign: detailed planets and a new board
> From version: 1.0.0
> Schema version: 1.0
> Status: Ready
> Understanding: 85
> Confidence: 75
> Complexity: High
> Theme: General
> Reminder: Update status/understanding/confidence and linked backlog/task references when you edit this doc.

# AI Context
- Summary: Give the Nest hero holotable detailed lit planets (locked) and a redesigned board under them, as options behind `?table=` next to the current table.
- Keywords: nest, hero, holotable, planets, board, war table, table flag
- Use when: planning or building the holotable redesign.
- Skip when: the CR-0W head (approved, unchanged), the planet data mapping of item_199/200.

# Needs
- Owner 2026-11-16: the droid is very good; the holotable and planets lack detail.
- Planets: done in design. Four locked types, lit in 3D, one colour per state (item_212 notes).
- Board: the table under the planets needs the same level of detail. Retro-futuristic, readable first.
- Each project gets a planet type from its kind.

# Context
- Design record: item_212 (sketch rounds, decisions, lessons). Renders and compare pages: vault `CR-0W/Research/nest-design/item_212/`.
- Planet reference renderer: `planet-types-8/planet-types-source.html` (shadePlanet, wrap light, ring, moons, spin).
- Current table: `tools/nest/src/hero/scene.ts` (2D canvas splat). Head: `tools/nest/src/hero/gl/head.ts` (WebGL2 ASCII shader).
- Flag pattern: item_166. Budgets: item_159. Planet data: item_199/200.
- Owner decisions: A and B become two separate final designs; cyber theme first; pieces stay planets on both; phone shows one label, laptop/web three.

# Acceptance criteria
- AC1: The current table stays the default and is unchanged.
- AC2: Every planet shows its locked type, picked by the project kind rule.
- AC3: The board redesign is picked from annotated sketches before any build.
- AC4: The options hold the item_159 budget or fall back to the current table.
- AC5: The owner picks A, B or none from recordings on one compare page.

# Out
- Head changes, Home layout, sound, the marketing reel (item_207 waits on this).
- Option C (galaxy map) from item_212: parked since the owner asked for A and B. Reopen only on request.

# Definition of Ready (DoR)
- [x] Problem statement is explicit and user impact is clear.
- [x] Scope boundaries (in/out) are explicit.
- [x] Acceptance criteria are testable.
- [x] Dependencies and known risks are listed.

# Companion docs
- Product brief(s): (none yet)
- Architecture decision(s): (none yet)

# References
- `tools/nest/src/hero/scene.ts`
- `tools/nest/src/hero/gl/head.ts`
- `tools/nest/src/hero/model.ts`
- `tools/nest/src/data/live.ts`
- `bin/crow-registry`

# Backlog
Execution order (one fresh session per item):
1. `item_214_nest_planet_type_per_project_kind` (independent, can run any time)
2. `item_215_nest_holotable_board_redesign_sketches` (design, owner gate)
3. `item_216_nest_lit_planets_renderer_behind_the_table_flag` (needs 214)
4. `item_217_nest_holotable_board_build_behind_the_table_flag` (needs 215 approved, 216)
5. `item_218_nest_holotable_options_budget_fallback_and_recordings` (needs 217)
- Design record: `item_212_nest_hero_holotable_with_detailed_3d_planets_and_table_options_next_to_the_current_one`

# Executions
| When | Runner | Run id | Title | State | PR | Notes |
| --- | --- | --- | --- | --- | --- | --- |
