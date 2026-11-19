## item_257_core_serves_the_ops_timeline_lanes_and_run_history - Core serves the Ops timeline lanes and run history
> From version: 1.0.0
> Schema version: 1.0
> Status: Done
> Understanding: 95%
> Confidence: 95%
> Progress: 100%
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
- AC1 -> `tools/crow-core/lanes` (shared with the deck) and `internal/ops`. Proof: `TestPastDayMatchesDeckLanes` in `internal/ops/ops_test.go` builds a past day from the same buckets as the deck and compares spans and states; the state log (`internal/ops/statelog.go`) only replaces spans inside its logged window (`TestMergeOverPastDay`), and days without lines keep the derived spans.
- AC2 -> `GET /api/runs/{id}` (`internal/api/runreport.go`). Proof: `TestRunReport` (ledger record, prefix match, final message, mission fallback, ambiguous prefix 400) and the `run-report`, `run-report-mission`, `error-no-run` response fixtures.
- AC3 -> `ops.Totals`. Proof: `TestWeekTotalsAddUp` and the week fixture `state-ops-week.json`; `TestMergeOverPastDay` checks totals after a merge.
- AC4 -> `tools/crow-deck` maps its rows to `lanes.Session` and `lanes.Agent`. Proof: deck and core `go test ./...` green.

# Decision framing
- Product framing: Not needed
- Architecture framing: Not needed (shared Go package, same pattern as the existing state sections)

# Links
- Request: `req_063_nest_pages_and_inbox_as_the_home_for_everything_that_waits`
- Used by: `item_190_laptop_missions_from_the_approved_missions_board` (Ops page)
- Follow-up: `item_264_recover_past_owner_waits_from_session_transcripts` (owner waits on past days)

# Priority
- Priority: High
- Rationale: Ops is the first page in the req_063 order and needs this data. Background run.

# Notes
- Build as a background run; no UI choice inside.
- Built in branch `item-257-ops`: shared lanes package, ops day and week answer, serve tick state log, run report.
- The run report has no diff stat yet: core runs no git. The commits list covers AC2.
- If serve is down, the last logged state of a live lane runs until serve restarts and writes the closing line.

# Executions
| When | Runner | Run id | Title | State | PR | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11-19T14:15:50.832182+00:00 | cdx | 2866cbe5305b46ba9d09b6387757907d | item-257-ops-3 | succeeded |  | steps 3-6: f7f8183 state log, d8e2434 run report, aba0c93 item_260, renumbered item_264 |
| 2026-11-19T11:29:56.791066+00:00 | cdx | 0252b0dd039b4254b0415f3a09c8bc13 | item-257-ops-2 | failed |  | limit |
| 2026-11-19T11:26:32.177194+00:00 | cdx | 1127c9d50f1c41318bf0a85090970bef | item-257-ops-2 | failed |  | limit |
| 2026-11-19T10:15:21.543277+00:00 | cdx | 2c99eeef8098407e9f6de81c299f9b38 | item-257-ops | succeeded |  |  |
