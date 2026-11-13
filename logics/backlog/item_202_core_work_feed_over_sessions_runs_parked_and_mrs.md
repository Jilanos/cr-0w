## item_202_core_work_feed_over_sessions_runs_parked_and_mrs - Core work feed over sessions runs parked and MRs
> From version: 1.0.0
> Schema version: 1.0
> Status: Done
> Understanding: 95%
> Confidence: 90%
> Progress: 100%
> Complexity: Medium
> Theme: Nest
> Reminder: Update status/understanding/confidence/progress and linked request/task references when you edit this doc.

# AI Context
- Summary: Add a `work` section to crow-core that normalises dispatch agents, crow runs/jobs, parked sessions, MRs/PRs (with pipeline and review state) and missions into one list of work items.
- Keywords: crow-core, work section, dispatch, runs, jobs, sessions, mrs, missions, contract
- Use when: building or changing the work feed.
- Skip when: consumer UI work (items 204, 205).

# Problem
- Each surface joins the feeds itself, with its own project matching and states. Counts differ between Nest, the deck and the hero.

# Scope
- In:
  - `contract/` type for a work item: id, kind (session, run, parked, mr, mission), project (registry match by cwd incl. `<path>.wt/`, then project field), state (failed, needs, working, sleeping, queued, done), title, since, wait_s, mission id (optional), source ref.
  - Section `work` built in the tick from existing sections; contract tests on fixtures.
  - Port the project matching and state rules from `tools/nest/src/hero/model.ts` (item_199) into Go as the single source.
- Out:
  - New collectors (the feeds already exist). Mission creation (203). UI.

# Acceptance criteria
- AC1: `/api/state/work` lists every item of the five kinds from the live core, with project matched like item_199.
- AC2: Waiting session, review waiting on the owner and red pipeline map to needs; parked maps to sleeping with resets_at.
- AC3: Contract tests cover each kind and the project match (worktree path, hub, share fallback).
- AC4: `go test ./...` passes in tools/crow-core.

# Delivery
- Implemented in 692c453: contract `WorkItem` (work-item.schema.json, records/work.json), `internal/work` builder, `GET /api/state/work`.
- AC1: live core after restart lists sessions, runs and MRs with projects by cwd (checked 2026-11-13).
- AC2/AC3: `internal/work` tests (TestItems, TestEveryKind, TestProjectOfCwd).
- AC4: `go test ./...` passes.

# Priority
- Priority: High
- Rationale: Every other item reads this feed.

# Links
- Product brief(s): (none yet)
- Architecture decision(s): (none yet)
- Request: req_060_nest_deck_track_all_work
- Primary task(s): (none yet)

# Notes
- Owner decision 2026-11-13: work = live sessions, background runs, parked sessions, MRs/PRs with CI, plus missions. Missions are an automatic optional grouping (goal, end state, delegation contract), never created by hand, never a separate list.
- Read `local/owner-prefs.md` before building. Visual changes need rendered options first.

# Executions
| When | Runner | Run id | Title | State | PR | Notes |
| --- | --- | --- | --- | --- | --- | --- |
