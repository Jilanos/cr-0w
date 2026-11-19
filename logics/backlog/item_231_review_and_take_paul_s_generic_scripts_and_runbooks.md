## item_231_review_and_take_paul_s_generic_scripts_and_runbooks - Review and take Paul's generic scripts and runbooks
> From version: 1.0.0
> Schema version: 1.0
> Status: Ready
> Understanding: 85
> Confidence: 80
> Progress: 0%
> Complexity: Medium
> Theme: General
> Reminder: Update status/understanding/confidence/progress and linked request/task references when you edit this doc.

# AI Context
- Summary: Decide each of Paul's new generic files (crow-board, crow-mailtxt, crow-maj, crow-docx-redline, simpledoc, runbooks office-documents, can-log-audit, android-adb-from-wsl, maj-routine): take as is, take into a module, or leave with Paul.
- Keywords: paul, scripts, runbooks, docx, redline, mail text, board, modules
- Use when: triaging Paul's §3 files.
- Skip when: his §2 changes (own item).

# Problem
- Paul proposes 10 generic files (feedback §3). Some fit the core, some a module (office docs, mail), some are his domain only (CAN logs).

# Scope
- In:
  - One table in this item: file, decision (core / module <name> / leave), reason.
  - Take the kept files with tests where they parse input (mailtxt, docx-redline).
  - crow-board: compare with the Inbox `followup`/pending model before taking it; likely replaced by Nest Inbox.
- Out:
  - His private maj skill.

# Acceptance criteria
- AC1: Each file has a decision with a one-line reason.
- AC2: Kept files pass `bin/crow-check` and have no personal data.
- AC3: Runbooks index updated.

# AC Traceability
- req_064_paul_s_feedback_and_a_modular_public_crow-AC -> This backlog slice. Proof: Each file has a decision with a one-line reason.

# Dependencies
- Module design item (for the module column).

# Links
- Request: req_064_paul_s_feedback_and_a_modular_public_crow.

# Priority
- Priority: Medium
- Rationale: Free value, but placement depends on the module design.

# Executions
| When | Runner | Run id | Title | State | PR | Notes |
| --- | --- | --- | --- | --- | --- | --- |
