## item_238_pending_items_and_follow_ups_as_one_schema - Pending items and follow-ups as one schema read by brief, routines and Inbox
> From version: 1.0.0
> Schema version: 1.0
> Status: In progress
> Understanding: 85
> Confidence: 80
> Progress: 10%
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

# Tasks
- `task_025_pending_items_and_follow_ups_as_one_schema_read_by_brief_routines_and_inbox`
