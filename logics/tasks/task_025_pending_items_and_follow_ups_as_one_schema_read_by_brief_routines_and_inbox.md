## task_025_pending_items_and_follow_ups_as_one_schema_read_by_brief_routines_and_inbox - Pending items and follow-ups as one schema read by brief, routines and Inbox
> From version: 1.0.0
> Schema version: 1.0
> Status: In progress
> Understanding: 95%
> Confidence: 85%
> Progress: 90%
> Complexity: Medium
> Theme: Implementation delivery
> Reminder: Update status/understanding/confidence/progress and linked request/backlog references when you edit this doc.
> Owner: second user
> Indicators reviewed: 2026-11-19 18:10:58

# AI Context
- Summary: Build the pending items schema: parser and CLI in bin/, both formats read without loss, brief and Inbox followup rows, configurable purge of settled rows.
- Keywords: pending, items, follow, ups, schema, read, brief, routines, inbox
- Use when: touching crow-pending, the brief's pending key or the settled-row purge.
- Skip when: Inbox UI or the core Inbox kind model (item_223).

# Definition of Done (DoD)
- [ ] The backlog scope is implemented.
- [ ] Acceptance criteria are covered.
- [ ] Validation passes.
- [ ] Meaningful waves followed ADR 009: affected docs updated and the repo left commit-ready without automatic commits.

# Backlog
- `item_238_pending_items_and_follow_ups_as_one_schema`

# Acceptance criteria
- AC1: Both files parse without loss.
- AC2: A follow-up past due shows in brief and in Inbox Waiting on others.
- AC3: Settled rows older than N days are purged by the tidy step.

# Plan
- [ ] Use `python3 -m logics_manager flow progress task task_025_pending_items_and_follow_ups_as_one_schema_read_by_brief_routines_and_inbox.md --progress <n>%` during multi-wave work.
- [ ] Run `python3 -m logics_manager flow finish task task_025_pending_items_and_follow_ups_as_one_schema_read_by_brief_routines_and_inbox.md` after implementation.

# Validation
- `uv run --no-project --with pytest --with pyyaml --with markdown pytest -q tests/`: 764 passed, 4 failed (the same 4 fail on origin/main 1569e72, see the backlog item).
- `bin/crow-check --fast`: green. `ruff check .`: clean. `go test ./internal/config/` (shared module fixtures): ok.
- `bin/crow-pending check` on both real files: lossless, counts in the backlog AC traceability.

# Report
- Commits e800aeb (task), 06e7975 (schema, parser, CLI, tests, config), 1fe0040 (brief and tidy), fe04fa9 (runbook, Open Threads due marker, brief skill).
- Left: core Inbox adapter for `followup` rows, owned by item_223. Owner questions in the backlog item.

# Links
- Request: `req_064_paul_s_feedback_and_a_modular_public_crow`
- Product brief(s): (none yet)
- Architecture decision(s): (none yet)

# Executions
| When | Runner | Run id | Title | State | PR | Notes |
| --- | --- | --- | --- | --- | --- | --- |
