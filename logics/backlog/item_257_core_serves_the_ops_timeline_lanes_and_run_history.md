## item_257_core_serves_the_ops_timeline_lanes_and_run_history - Core serves the Ops timeline lanes and run history
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
- Summary: Core serves the data behind the Nest Ops page: day and week lanes for every session and run, time spent, waits on the owner, stuck and failed spans, the queue, and the full report of one run.
- Keywords: core, ops, timeline, lanes, runs, history, queue, api
- Use when: building the Ops data in crow-core, or the Ops page needs a field.
- Skip when: the Ops page layout (item_190), quota and tokens (item_227).

# Problem
- The deck Agents tab builds its lanes in Go inside the deck (tools/crow-deck/agents_data.go, 10-minute buckets from crow-usage). Nest has no API for them.
- Run history and run reports are files under local/state; Nest cannot list or open them.

# Scope
- In:
  - `GET /api/state/ops?day=YYYY-MM-DD` and `?week=YYYY-Www`: one lane per session or run with project, account, kind (interactive, run, mission, routine), spans by state (working, waiting on owner, idle, stuck, failed, done), cost, tokens, commits.
  - Move the deck lane builder into a shared Go package so deck and core use the same code. The deck keeps working.
  - Queue in the same answer: queued missions, routines with their next start, AFK jobs waiting.
  - `GET /api/runs/<id>`: run report, commits, diff stat, cost, end state, links to the worktree and the item.
  - Week totals per project and per kind: hours, wait hours, stuck count, cost.
  - Contract and schema updated, contract test covers the new section.
- Out:
  - The page itself (item_190). Quota gauges (item_227).

# Acceptance criteria
- AC1: The ops answer for a past day matches the deck Agents lanes for that day (same spans, same states).
- AC2: A run id returns its report, commits and cost, or 404 when unknown.
- AC3: Week totals add up to the sum of the day lanes.
- AC4: Deck Agents tab still renders from the shared package; deck and core tests pass.

# AC Traceability
- `req_063_nest_pages_and_inbox_as_the_home_for_everything_that_waits` AC2 -> This backlog slice. Proof: Ops reads live data, no placeholder.

# Decision framing
- Product framing: Not needed
- Architecture framing: Not needed (shared Go package, same pattern as the existing state sections)

# Links
- Request: `req_063_nest_pages_and_inbox_as_the_home_for_everything_that_waits`
- Used by: `item_190_laptop_missions_from_the_approved_missions_board` (Ops page)

# Priority
- Priority: High
- Rationale: Ops is the first page in the req_063 order and needs this data. Background run.

# Notes
- Build as a background run; no UI choice inside.

# Executions
| When | Runner | Run id | Title | State | PR | Notes |
| --- | --- | --- | --- | --- | --- | --- |
