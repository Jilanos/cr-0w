## item_250_core_runs_the_mission_tick_every_2_minutes - Core runs the mission tick every 2 minutes
> From version: 1.0.0
> Schema version: 1.0
> Status: Ready
> Understanding: 90%
> Confidence: 85%
> Progress: 0%
> Complexity: Medium
> Theme: Nest
> Reminder: Update status/understanding/confidence/progress and linked request/task references when you edit this doc.

# AI Context
- Summary: `crow-core serve` calls the mission tick every 2 minutes so queued missions start on their own; mission_new refuses kinds the tick will not start.
- Keywords: tick, serve, loop, queued, LivePhase, mission_new
- Use when: queued missions never start.
- Skip when: run summaries, autonomy dial.

# Problem
- Nothing calls `crow-core tick`. item_133 planned the 2-minute loop for slice 3 and no item built it. Queued missions wait forever and the butler promises they will start.

# Scope
- In:
  - A ticker in serve (2 min, CROW_TICK_INTERVAL to change, 0 turns it off) that runs the same Tick code as the CLI, never two at once, logs its TickReport and refreshes the missions and runs sections.
  - mission_new (CLI, API and MCP) refuses a kind above LivePhase with "kind X is phase N; not started by the tick yet" instead of queueing it.
  - Missions linked by `mission ensure` with no core run show a distinct state or flag (`linked`) in the missions section so readers do not take them for running work.
- Out: autonomy (item_151), new live kinds (item_152).

# Acceptance criteria
- AC1: With serve running and a free slot, a queued phase-1 mission reaches running within 2 minutes; the run shows in `crow runs`.
- AC2: Two serve ticks never overlap; a failing tick logs and the next one runs.
- AC3: mission_new with kind review-fix or build returns an error naming the phase.
- AC4: The missions section marks linked missions with no core run.

# AC Traceability
- request-AC1 -> AC1, AC3. Proof: serve test with a fake runner; MCP test for the refusal.

# Decision framing
- Product framing: Not needed
- Architecture framing: Not needed (adr_001: the tick calls no model)

# Links
- Request: `req_065_nest_butler_is_the_cr_0w_hub_and_queued_missions_start_on_their_own`
- Architecture decision(s): `adr_001_core_missions_and_inbox_architecture`
- Primary task(s): (none yet)

# Priority
- Priority: High
- Rationale: every mission from Nest is stuck without it.

# Notes
- Generated locally by logics-manager.

# Executions
| When | Runner | Run id | Title | State | PR | Notes |
| --- | --- | --- | --- | --- | --- | --- |

