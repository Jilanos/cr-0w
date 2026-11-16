## item_212_nest_hero_holotable_with_detailed_3d_planets_and_table_options_next_to_the_current_one - Nest hero holotable with detailed 3D planets and table, options next to the current one
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
- Summary: Explore richer 3D looks for the hero holotable and its planets (holographic war table, holochess board, galaxy map table) as switchable options next to the current table, which stays as is.
- Keywords: nest, hero, holotable, planets, 3D, war table, galaxy map, options
- Use when: prototyping or picking the holotable look.
- Skip when: the CR-0W head (approved, unchanged), the planet data mapping (item_199/200).

# Problem
- Owner 2026-11-16: the droid is very good; the holotable and planets lack detail. Today they are flat ASCII cells on a 2D canvas (scene.ts: faint rings, spokes, rim, wedge sweep; planets as small discs) while the head is a lit WebGL2 ASCII shader. The table should read as a real holographic war table: depth, volume, detail.
- Mood references only, never copied: tabletop holo games, war-room tables, a galaxy map table that projects a 3D star map. No franchise look, names or assets.

# Scope
- In:
  - Three options behind `?table=a|b|c`, the current table the default and kept unchanged. Same data mapping (planet = project, colour = most urgent state, height = priority, spin, hover, beam ping), same cell size and density as the head so table and droid read as one image.
  - Option A, lit spheres: planets drawn through the head's WebGL2 ASCII shader as lit spheres (terminator, rim light, surface bands, rings for projects with live runs, small moons for sessions); table gets an engraved grid, depth fog and a volumetric projector cone.
  - Option B, war table: a raised hex or terrain-relief board with projects as holographic pieces on it, scan beams and edge glow; pieces rise or flicker by state.
  - Option C, galaxy map: a volumetric point-cloud star field over the table with orbit lines; planets as dense particle spheres orbiting the lens, the camera slowly tilting.
  - Recordings of each option in both themes on cover and laptop, on one compare page (bin/crow-compare), recorded from the hub.
- Out:
  - changing the head, the planet data model, Home layout; sound; the marketing reel (item_207).

# Acceptance criteria
- AC1: The current table stays the default and is unchanged.
- AC2: Each option keeps every data cue of the current table (state colour, priority height, spin, hover, ping, labels).
- AC3: Each option holds the hero budget of item_159 on laptop and fold, and falls back to the current table when it cannot.
- AC4: Recordings of A, B, C in both themes on one compare page; the owner picks one (or none).
- AC5: Plan first: one annotated sketch per option, mapping each visual element to the data it shows, approved before the prototype run.

# AC Traceability
- AC1-AC5 -> this item. Proof: to fill at closeout.

# Decision framing
- Product framing: owner picks from sketches, then from recordings.
- Architecture framing: reuse gl/head.ts (shader, cell grid) for any WebGL part; options live beside scene.ts, chosen by flag.

# Links
- Related: item_162 (holotable), item_197/199/200/201 (planets), item_159 (budgets), item_166 (boot flag pattern), item_207 (reel waits on this).

# Priority
- Priority: Medium
- Rationale: owner request 2026-11-16; the reel waits for it.

# Notes
- 2026-11-16: owner request. Keep the current table as an option.

# Executions
| When | Runner | Run id | Title | State | PR | Notes |
| --- | --- | --- | --- | --- | --- | --- |
