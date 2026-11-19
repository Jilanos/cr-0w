## task_024_fix_the_crow_runs_and_dispatch_bugs_from_paul_s_nights - Fix the crow-runs and dispatch bugs from Paul's nights
> From version: 1.0.0
> Schema version: 1.0
> Status: Done
> Understanding: 90%
> Confidence: 85%
> Progress: 100%
> Complexity: Medium
> Theme: Implementation delivery
> Reminder: Update status/understanding/confidence/progress and linked request/backlog references when you edit this doc.
> Owner: crow
> Indicators reviewed: 2026-11-17 16:53:12

# AI Context
- Summary: (unfilled: replace before this doc is used)
- Keywords: fix, crow, runs, dispatch, bugs, paul, nights
- Use when: (unfilled: replace before this doc is used)
- Skip when: (unfilled: replace before this doc is used)

# Definition of Done (DoD)
- [x] The backlog scope is implemented.
- [x] Acceptance criteria are covered.
- [x] Validation passes.
- [x] Meaningful waves followed ADR 009: affected docs updated and the repo left commit-ready without automatic commits.

# Backlog
- `item_230_fix_the_crow_runs_and_dispatch_bugs_from_paul_s_nights`

# Acceptance criteria
- AC1: Each repro from §5 passes old-fails/new-passes in a test.
- AC2: `crow dispatch hub ...` runs in the hub repo.
- AC3: `bin/crow-check` green.

# Plan
- [x] Use `python3 -m logics_manager flow progress task task_024_fix_the_crow_runs_and_dispatch_bugs_from_paul_s_nights.md --progress <n>%` during multi-wave work.
- [x] Run `python3 -m logics_manager flow finish task task_024_fix_the_crow_runs_and_dispatch_bugs_from_paul_s_nights.md` after implementation.

# Validation
- (no validation recorded yet)
- command: `bin/crow-check` | result: passed | date: 2026-11-17
- Finish workflow executed on 2026-11-17.
- Linked backlog/request close verification passed.

# Report
- Not started.
- Finished on 2026-11-17.
- Linked backlog item(s): `item_230_fix_the_crow_runs_and_dispatch_bugs_from_paul_s_nights`
- Related request(s): `req_064_paul_s_feedback_and_a_modular_public_crow`

# Links
- Request: `req_064_paul_s_feedback_and_a_modular_public_crow`
- Product brief(s): (none yet)
- Architecture decision(s): (none yet)

# Executions
| When | Runner | Run id | Title | State | PR | Notes |
| --- | --- | --- | --- | --- | --- | --- |

# AC Traceability
- request-AC1 -> This task. Proof: Run and dispatch bugs 1-4, 9, 10 fixed with a regression test each (6f2f0cb, 0046d97, c2e49e9, 8567edf, 2576c09); bin/crow-check green, 672 passed. Source: `2576c09`
- request-AC2 -> This task. Proof: Not covered here; the brick split is item_235. Source: `2576c09`
- request-AC3 -> This task. Proof: Not covered here; forge off is item_236. Source: `2576c09`
