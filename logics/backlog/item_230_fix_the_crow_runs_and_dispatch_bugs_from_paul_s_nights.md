## item_230_fix_the_crow_runs_and_dispatch_bugs_from_paul_s_nights - Fix the crow-runs and dispatch bugs from Paul's nights
> From version: 1.0.0
> Schema version: 1.0
> Status: In progress
> Understanding: 85
> Confidence: 80
> Progress: 15%
> Complexity: Medium
> Theme: General
> Reminder: Update status/understanding/confidence/progress and linked request/task references when you edit this doc.
> Indicators reviewed: 2026-11-17 16:25:45

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

# Dependencies
- None.

# Links
- Request: req_064_paul_s_feedback_and_a_modular_public_crow.

# Priority
- Priority: High
- Rationale: Small, hit every night.

# Executions
| When | Runner | Run id | Title | State | PR | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11-17T15:29:13.517330+00:00 | cdx | 7bf24edac4d349d1b7516c5c8bc853c1 | item_230 run/dispatch bugs | succeeded |  |  |

# Tasks
- `task_024_fix_the_crow_runs_and_dispatch_bugs_from_paul_s_nights`
