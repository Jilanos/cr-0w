## item_212_nest_hero_holotable_with_detailed_3d_planets_and_table_options_next_to_the_current_one - Nest hero holotable with detailed 3D planets and table, options next to the current one
> From version: 1.0.0
> Schema version: 1.0
> Status: Ready
> Understanding: 85%
> Confidence: 75%
> Progress: 55%
> Complexity: High
> Theme: General
> Reminder: Update status/understanding/confidence/progress and linked request/task references when you edit this doc.
> Indicators reviewed: 2026-11-17 10:44:07

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
- Request: req_062 (execution split into item_214-218).
- Related: item_162 (holotable), item_197/199/200/201 (planets), item_159 (budgets), item_166 (boot flag pattern), item_207 (reel waits on this).

# Priority
- Priority: Medium
- Rationale: owner request 2026-11-16; the reel waits for it.

# Notes
- 2026-11-16: owner request. Keep the current table as an option.
- 2026-11-16 sketch rounds (vault `CR-0W/Research/nest-design/item_212/`, one compare page per folder):
  - Owner wants A and B as two separate final designs, more retro-futuristic, built as real ASCII prototypes, cyber theme first.
  - Readability before style: base is R1 (bigger pieces, quiet table). Pieces bigger still on laptop/web. Retro style is re-applied on top later.
  - Outline (halo plus bright rim) only on the selected or hovered planet.
  - Labels: phone shows the front planet's label only; laptop/web shows 3 (most urgent first: failed, needs you, working); hover shows its own.
  - Rejected for B: obelisk (soft and faceted), dais/crystal/ziggurat/cube, war-table markers/outpost/banner/starship. Pieces stay planets.
  - Technique kept: flat tone per face plus slope-aware edge glyphs gives sharp definition; edge depth bias z-.08.
  - Planets (folders planets/, star-system/, planet-types/): ray-cast lit spheres. Banded gas giant liked most (P1). Holo globe and faceted rejected.
  - Star system: each project gets its own planet type, fixed per project (banded giant, terrain world with little water, cratered rock, ice world). No hybrid styles on one planet.
  - Types locked after 8 rounds (planet-types-8, source `planet-types-source.html`):
    - Features big and few at about 24x13 cells per planet; small detail turns to noise.
    - Banded giant: bands plus one storm (unchanged since P1).
    - Terrain world: smooth domain-warped relief, little water, '^' peaks, noisy polar cap. No hard edges.
    - Cratered rock: five big craters fixed on the surface, two or three in view, turning with the spin. Bowl wall facing the light glows, the other side stays dim. 'O' rims.
    - Ice world: long wind-swept '/' streaks along latitude.
    - Light: wrap lighting with an ambient floor, faint rim, small highlight. Nothing goes black: bowls, seas and dark bands use dim glyphs, never blank cells. The night ':' limb is dropped.
  - Run ring: bolder than R1 but narrow and flat so it hides no other planet. Weight approved.
  - Colour: one colour per state. Quiet planets all use soft violet #a88cff instead of grey.
  - Planet type rule (owner 2026-11-16): by project kind, not by size or age.
    - Work projects: banded giant.
    - Personal tools: cratered rock.
    - Personal setups and creative work: terrain world.
    - Personal notes: ice world.
    - Per-project list: `local/nest-planet-kinds.md`.
    - New `kind` field in local/projects.yaml (work, tool, world, notes) picks the type; optional `planet:` overrides it. A project without either: tool.
    - System planet (item_200): takes the type of its most urgent member.
    - Size/age rule rejected: almost every personal repo committed this month, so recency does not spread them.
  - Next: the board under the planets, planned in req_062 (items 214-218). This item stays the design record.
- 2026-11-17 board picked (item_215, renders in vault `item_212/board-real/`): C2, hex grid plus radar centre.
  - Hex grid etched in ':' glyphs, faint, fading with distance; planets sit on hex centres.
  - Rim, spokes and rotating sweep from the A projector table; detailed edge with neutral ticks, no per-project colours.
  - Centre: radar rings with '+' marks every 30 degrees, crosshair, sweep wedge, one blip per project at half radius.
  - Under each planet: thin stem plus outline shadow ring, no cone; failed planets get a broken stem; needs-you adds a ring at 1.7r.
  - Planet size by type (banded .44, terrain .34, ice .30, rock .26), quiet planets violet #a88cff. No raised 3D hex tiles.
  - The head's projection beam stays visible down to the lens.
  - Earlier next: detailed lit planets (A sphere base: terminator, bands, rings for runs, moons for sessions) at R1 size, then the B board under them.

# Executions
| When | Runner | Run id | Title | State | PR | Notes |
| --- | --- | --- | --- | --- | --- | --- |
