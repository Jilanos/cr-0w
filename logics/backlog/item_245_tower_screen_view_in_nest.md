## item_245_tower_screen_view_in_nest - Tower screen view in Nest
> From version: 1.0.0
> Schema version: 1.0
> Status: Ready
> Understanding: 90%
> Confidence: 85%
> Progress: 0%
> Complexity: Medium
> Theme: Hosts
> Reminder: Update status/understanding/confidence/progress and linked request/task references when you edit this doc.

# AI Context
- Summary: Nest shows a screenshot of the tower on demand and a stop button while a desktop mission runs.
- Keywords: nest, screen, screenshot, tower, stop
- Use when: Watching or stopping what a desktop mission does.
- Skip when: Full remote desktop (RustDesk is the fallback).

# Problem
- The owner needs to see what the agent sees on the tower without opening RustDesk.

# Scope
- In:
  - core endpoint that takes a screenshot through windows-mcp and returns a downscaled image.
  - Nest view: refresh on tap, auto refresh while a desktop mission runs, stop button wired to the mission stop action.
- Out:
  - Clicking from Nest (RustDesk covers that).

# Acceptance criteria
- AC1: From Nest, the owner sees the tower screen within 5 seconds of a tap.
- AC2: Stop from that view ends the running desktop mission.

# AC Traceability
- request-AC3 to AC6 -> This backlog slice. Proof: the acceptance criteria above.

# Decision framing
- Product framing: Not needed
- Architecture framing: Not needed

# Links
- Product brief(s): `prod_008_crow_on_the_tower`
- Architecture decision(s): (none yet)
- Request: `req_056_crow_on_the_windows_tower`
- Primary task(s): `task_022_orchestrate_crow_on_the_windows_tower`

# Priority
- Priority: Low
- Rationale: Comfort on top of item_244.

# Notes
- (none)

# Executions
| When | Runner | Run id | Title | State | PR | Notes |
| --- | --- | --- | --- | --- | --- | --- |
