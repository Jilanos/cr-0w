## item_238_pending_items_and_follow_ups_as_one_schema - Pending items and follow-ups as one schema read by brief, routines and Inbox
> From version: 1.0.0
> Schema version: 1.0
> Status: In progress
> Understanding: 95
> Confidence: 85
> Progress: 90%
> Complexity: Medium
> Theme: General
> Reminder: Update status/understanding/confidence/progress and linked request/task references when you edit this doc.
> Indicators reviewed: 2026-11-19 18:10:58

# AI Context
- Summary: Define the 'pending items' schema Paul uses (decisions, follow-ups with due/priority/who/expected, recently settled purged after 14 days) as a crow concept stored as Markdown with a minimal schema, read by brief, routines and the Inbox `followup` kind.
- Keywords: pending items, follow-ups, waiting, schema, brief, inbox
- Use when: touching follow-ups or the waiting list.
- Skip when: Inbox UI.

# Problem
- Paul tracks everything in one EN_ATTENTE file rendered by crow-board (§4.3). The owner's equivalent is the Waiting section of Open Threads. Two formats, no shared reader.

# Owner decisions (2026-11-19)
- The second user builds the pending items schema on a branch from main and sends a patch; review it here like item_229.

# Scope
- In:
  - Schema (Markdown table with fixed columns, or front matter list), parser in bin/ with tests.
  - Open Threads Waiting section and Paul's file both readable through it.
  - brief and Inbox `followup` read it; purge of settled rows after N days configurable.
- Out:
  - Changing the owner's Open Threads format beyond what the parser needs.

# Acceptance criteria
- AC1: Both files parse without loss.
- AC2: A follow-up past due shows in brief and in Inbox Waiting on others.
- AC3: Settled rows older than N days are purged by the tidy step.

# AC Traceability
- req_064_paul_s_feedback_and_a_modular_public_crow-AC -> This backlog slice. Proof: Both files parse without loss.
- AC1 -> `bin/crow-pending check` on the real files (read only, counts only, checksums unchanged). Second user's pending file: lossless, 217 lines, 7 sections, 7 blocks, 11 tables (48 rows, rows before a separator kept), 74 bullets, 122 items (draft 3, waiting 6, decision 21, file 14, paused 5, note 11, settled 53, intro 9); a grep count of pipe and bullet lines per section matches. Second user's Open Threads note (free-form bullets): lossless, 43 lines, 2 sections, 30 items. Owner's Open Threads format: `tests/fixtures/pending/threads.md` (runbook format) in `tests/test_crow_pending.py`. Commit 06e7975.
- AC2 -> brief: `crow-gather brief` returns `pending.overdue` and the brief skill lists it (`test_gather_brief_shows_the_overdue_followup`, commits 1fe0040, fe04fa9). Inbox: `crow-pending inbox` emits `followup` rows in group `waiting`, most overdue first (`test_cli_inbox_lists_overdue_followups_first`). Open: core Inbox has no kind model yet (item_223), so no core adapter reads these rows yet.
- AC3 -> `crow-tidy --apply` purges settled rows older than `pending_settled_days` (default 14), dry run without `--apply`, undated rows kept (`test_tidy_step_purges_with_apply`, `test_settled_days_is_configurable`). Dry run on the second user's file: 1 row due. Commits 06e7975, 1fe0040.

# Dependencies
- Inbox kind model item.

# Links
- Request: req_064_paul_s_feedback_and_a_modular_public_crow.

# Priority
- Priority: Medium
- Rationale: Shared need between both users.

# Executions
| When | Runner | Run id | Title | State | PR | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11-19T17:21:04+00:00 | second user | - | item-238-pending | succeeded |  | fork branch item-238-pending, 4 commits e800aeb..fe04fa9; patch sent; Inbox core adapter left to item_223 |

# Delivery (2026-11-19)
- Branch `item-238-pending` from main 1569e72, sent as a patch for review here.
- `bin/crow_pending.py` (schema, parser, loss check, purge), `bin/crow-pending` (list, check, inbox, brief, purge), `runbooks/pending-items.md`.
- Config in the core brick: `pending_files`, `pending_settled_days` (14), `pending_sections`, `pending_columns`. English defaults only; another language sets its aliases in crow.yaml.
- Open Threads gains one optional marker, `📅 YYYY-MM-DD` (Obsidian Tasks due date). Nothing else changes in its format.
- Left: the core Inbox `followup` adapter (item_223 owns the kind model).
- Full suite: 764 passed, 4 failed; the same 4 fail on origin/main 1569e72 (isolation and sandbox tests need `pasta` and the default permission on this machine; `bin/crow-routine` is in no module manifest).

# Questions for the owner
- Inbox: should item_223's `followup` source run `crow-pending inbox` (JSON rows), or should core get a Go port of the parser?
- Purge: `crow-gather brief` runs `crow-tidy --apply`, so the morning brief now edits pending files and Open Threads (`- [x]` lines only). Keep it there, or purge only on an explicit `crow-tidy --apply`?
- Config: keep the `pending_*` keys in the core brick, or move them to a brick of their own?
- Open Threads: is the optional `📅` due date acceptable?

# Tasks
- `task_025_pending_items_and_follow_ups_as_one_schema_read_by_brief_routines_and_inbox`
