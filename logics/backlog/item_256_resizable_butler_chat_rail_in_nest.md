## item_256_resizable_butler_chat_rail_in_nest - Resizable butler chat rail in Nest
> From version: 1.0.0
> Schema version: 1.0
> Status: Ready
> Understanding: 90%
> Confidence: 85%
> Progress: 0%
> Complexity: Medium
> Theme: General
> Reminder: Update status/understanding/confidence/progress and linked request/task references when you edit this doc.

# AI Context
- Summary: The butler rail on laptop Nest (Home and every screen that shows it) gets a drag handle on its left edge; the width is kept per device.
- Keywords: nest, butler rail, resize, width, b-rail, laptop
- Use when: the butler chat is too thin to read.
- Skip when: the phone chat sheet.

# Problem
- `.b-rail` is fixed at 320px (tools/nest/src/theme.css). Long answers, tables and code wrap into a thin column that is hard to read (owner, 2026-11-19).

# Scope
- In:
  - A vertical drag handle on the rail's left edge (pointer and keyboard: left and right arrows by 24px), min 280px, max 60% of the window; double-click resets to 320px.
  - Width stored in localStorage (wrapped in try/catch) and applied as a CSS variable used by `.b-rail` and the grid.
  - The hero and the left column reflow; nothing overflows at 1200px.
  - Folded rail (56px) unchanged.
- Out: phone and Fold sheet; detaching the chat to its own window.

# Acceptance criteria
- AC1: Dragging the handle on Home widens the chat to 600px; a reload keeps 600px.
- AC2: At a 1280px window the rail cannot pass 60% and the hero stays visible.
- AC3: Double-click resets to 320px; keyboard arrows move it.
- AC4: Screenshots at 320, 480 and 640px reviewed before done (zoom crops, owner prefs design).

# AC Traceability
- Owner ask 2026-11-19 -> AC1 to AC4. Proof: unit test for the clamp and storage; screenshots in the vault Research folder.

# Decision framing
- Product framing: Not needed
- Architecture framing: Not needed

# Links
- Request: `req_065_nest_butler_is_the_cr_0w_hub_and_queued_missions_start_on_their_own`
- Architecture decision(s): `adr_001_core_missions_and_inbox_architecture`
- Primary task(s): (none yet)

# Priority
- Priority: Medium
- Rationale: small, independent; can ship before the butler work.

# Notes
- Generated locally by logics-manager.

# Executions
| When | Runner | Run id | Title | State | PR | Notes |
| --- | --- | --- | --- | --- | --- | --- |

