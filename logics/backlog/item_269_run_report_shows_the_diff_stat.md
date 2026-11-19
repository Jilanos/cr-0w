## item_269_run_report_shows_the_diff_stat - Run report shows the diff stat
> From version: 1.0.0
> Schema version: 1.0
> Status: Ready
> Understanding: 80
> Confidence: 80
> Progress: 0%
> Complexity: Small
> Theme: General
> Reminder: Update status/understanding/confidence/progress and linked request/task references when you edit this doc.

# AI Context
- Summary: When a background run finishes, crow-runs saves the diff stat of its branch against its base on the ledger row; `GET /api/runs/{id}` returns it and the Nest run report shows files and lines changed.
- Keywords: crow-runs, diff stat, run report, ops, nest
- Use when: showing what a run changed.
- Skip when: runs with no worktree.

# Problem
- The run report (item_257) shows text only. The worktree may be gone when the owner reads it.

# Scope
- In:
  - crow-runs: on finish, `git diff --stat <base>...HEAD` in the run's cwd, stored on the row (files, insertions, deletions, per-file list capped at 50).
  - Core `/api/runs/{id}` passes it through; contract schema and fixture updated.
- Out:
  - Nest rendering (Ops page, item_190).

# Acceptance criteria
- AC1: A finished run in a test repo has the stat on its row; removing the worktree keeps it.
- AC2: `/api/runs/{id}` returns it; contract test passes.
- AC3: A run with no git cwd has no stat and no error.

# AC Traceability
- req_063_nest_pages_and_inbox_as_the_home_for_everything_that_waits-AC1 -> This backlog slice. Proof: run report shows what changed.

# Dependencies
- `item_257_core_serves_the_ops_timeline_lanes_and_run_history`.

# Links
- Request: `req_063_nest_pages_and_inbox_as_the_home_for_everything_that_waits`

# Priority
- Priority: Low
- Rationale: Nice to have on the Ops page.

# Executions
| When | Runner | Run id | Title | State | PR | Notes |
| --- | --- | --- | --- | --- | --- | --- |
