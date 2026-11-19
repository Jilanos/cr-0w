## item_243_tower_power_and_status_from_nest - Tower power and status from Nest
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
- Summary: Nest shows the tower's power state and wakes it, puts it to sleep, or power cycles it through the plug.
- Keywords: nest, core, tower, power, wake, sleep, smart plug
- Use when: Controlling the tower's power from the phone.
- Skip when: Mission dispatch (item_120), screen view (item_245).

# Problem
- The owner wants to start work on the tower from Nest at any time. Today the tower must already be awake.

# Scope
- In:
  - core endpoints over `crow host`: status, wake, sleep, power cycle. Power cycle asks for confirmation.
  - Nest host card: state (off, asleep, awake, gaming from plug power), last seen, actions.
  - Shelly Plug S MTR Gen3 on the tower: local API from core, power reading as a state signal. Hard reset only, after a failed wake.
  - Fallback when the laptop (core) sleeps: wake through the Bbox WOL proxy from a phone WOL app, then Remote Control. Written in the runbook.
- Out:
  - Core on an always-on server (item_181, server hardware decided in the homelab repo).

# Acceptance criteria
- AC1: From Nest, the owner wakes the sleeping tower and sees it awake within a minute.
- AC2: From Nest, the owner puts it to sleep.
- AC3: With the tower frozen, a confirmed power cycle from Nest brings it back to a logged-in desktop.

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
- Priority: Medium
- Rationale: Needed to start tower work from the phone.

# Notes
- Plug bought by the owner (decision pending purchase, 2026-11-18).

# Executions
| When | Runner | Run id | Title | State | PR | Notes |
| --- | --- | --- | --- | --- | --- | --- |
