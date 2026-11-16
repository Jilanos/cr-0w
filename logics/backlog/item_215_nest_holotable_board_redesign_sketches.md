## item_215_nest_holotable_board_redesign_sketches - Nest holotable board redesign sketches
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
- Summary: Design the board under the locked planets for options A and B: annotated 2D sketches first, then static ASCII renders at hero size, owner picks on a compare page.
- Keywords: nest, holotable, board, war table, sketches, design
- Use when: designing the table surface under the planets.
- Skip when: planet looks (locked), the build (item_217).

# Problem
- Planets are now detailed and lit; the board under them is still faint rings, spokes and a wedge sweep. It must read as a real holographic table with the same detail, without stealing focus from the planets.

# Directions to sketch
- A, projector table: engraved grid on a round lens, depth fog, a volumetric projector cone under each planet, light pooling on the surface.
- B, war table: raised hex or terrain-relief board, scan beams, edge glow; planets hover over their tile; tiles rise or flicker by state.
- One more if the sketches suggest it. Mood references only, no franchise look.

# Data each board must carry (from scene.ts and item_212)
- Priority height: stem or column from board to planet.
- State: base ring or tile colour, one colour per state (quiet violet #a88cff).
- Ping: beam pulse from the lens to the planet.
- Hover and select: outline only on that planet; its tile or base lights.
- Labels: phone 1 (front planet), laptop/web 3 (failed, needs you, working); hover shows its own.

# Rules (owner, item_212)
- Annotated 2D sketch per option, every element mapped to the data it shows, approved before any render (project memory: design renders need wow; ascii head render lessons).
- Readability first: R1 base (big planets, quiet table), then retro style on top. Cyber theme first.
- Keep features big and few at hero cell size (CW 4.6, CH 8.05); nothing goes black.
- Compare pages via `bin/crow-compare` in vault `CR-0W/Research/nest-design/item_212/``board-*/`; open with xdg-open; ask with AskUserQuestion; zoom crops checked before showing.
- Renderer: extend `planet-types-8/planet-types-source.html` (copy to scratch); planets stay as locked.

# Acceptance criteria
- AC1: Annotated sketches for A and B approved by the owner (item_212 AC5).
- AC2: Static renders of the approved sketches with the locked planets, cyan and quiet violet, on one compare page; owner picks the board for each option.
- AC3: Decisions recorded in item_212 notes and this item, renders in the vault.

# Dependencies
- None to start. Gates item_217.

# Links
- Request: req_062. Design record: item_212.

# Executions
| When | Runner | Run id | Title | State | PR | Notes |
| --- | --- | --- | --- | --- | --- | --- |
