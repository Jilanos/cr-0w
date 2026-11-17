## item_230_fix_the_crow_runs_and_dispatch_bugs_from_paul_s_nights - Fix the crow-runs and dispatch bugs from Paul's nights
> From version: 1.0.0
> Schema version: 1.0
> Status: Done
> Understanding: 85
> Confidence: 80
> Progress: 100%
> Complexity: Medium
> Theme: General
> Reminder: Update status/understanding/confidence/progress and linked request/task references when you edit this doc.
> Indicators reviewed: 2026-11-17 16:53:12

# AI Context
- Summary: Fix the small reproducible bugs: list/json crash on a removed worktree, Codex report keeps only the last line, `final` wants a path, `wait ""` hangs, unknown project gives no hint, out-of-policy accounts show as 401 errors.
- Keywords: crow-runs, dispatch, bugs, worktree, codex report, hub project, accounts
- Use when: fixing these run bugs.
- Skip when: new run features.

# Problem
- Paul's feedback §5 rows 1-4, 9, 10: each hit on every AFK night.

# Scope
- In:
  - 1: `crow-runs list/json` skip or mark 'worktree removed' when the cwd is gone.
  - 2: Codex `report` falls back to the last full `agent_message`, or points to the report file the job wrote.
  - 3: `crow-runs final <id>` accepts a run id.
  - 4: `crow-runs wait` refuses an empty id.
  - 9: `crow dispatch <unknown>` suggests the closest registered name; the hub is an implicit project `hub` (Paul §4.8).
  - 10: accounts absent from the policy are hidden or tagged 'not in policy' in status views, not shown as errors.
  - A regression test per bug using Paul's repro.
- Out:
  - Bugs 5-8 and 11-13 (folded into the module and AFK items).

# Acceptance criteria
- AC1: Each repro from §5 passes old-fails/new-passes in a test.
- AC2: `crow dispatch hub ...` runs in the hub repo.
- AC3: `bin/crow-check` green.

# AC Traceability
- req_064_paul_s_feedback_and_a_modular_public_crow-AC -> This backlog slice. Proof: Each repro from §5 passes old-fails/new-passes in a test.
- request-AC1 -> This backlog slice. Proof: Run and dispatch bugs 1-4, 9, 10 fixed with a regression test each (6f2f0cb, 0046d97, c2e49e9, 8567edf, 2576c09); bin/crow-check green, 672 passed. Source: `2576c09`
- request-AC2 -> This backlog slice. Proof: Not covered here; the brick split is item_235. Source: `2576c09`
- request-AC3 -> This backlog slice. Proof: Not covered here; forge off is item_236. Source: `2576c09`

# Dependencies
- None.

# Links
- Request: `req_064_paul_s_feedback_and_a_modular_public_crow`

- Primary task(s): `task_024_fix_the_crow_runs_and_dispatch_bugs_from_paul_s_nights`
# Priority
- Priority: High
- Rationale: Small, hit every night.

# Executions
| When | Runner | Run id | Title | State | PR | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11-17T15:36:48.384135+00:00 | cdx | 207be58c83c44578853f1eb8c8171d71 | item_230 run bugs steps 2-5 | running |  |  |
| 2026-11-17T15:29:13.517330+00:00 | cdx | 7bf24edac4d349d1b7516c5c8bc853c1 | item_230 run/dispatch bugs | succeeded |  |  |

# Tasks
- `task_024_fix_the_crow_runs_and_dispatch_bugs_from_paul_s_nights`

# Notes
- Task `task_024_fix_the_crow_runs_and_dispatch_bugs_from_paul_s_nights` was finished via `logics-manager flow finish task` on 2026-11-17.
