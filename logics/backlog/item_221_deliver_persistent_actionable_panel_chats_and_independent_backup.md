## item_221_deliver_persistent_actionable_panel_chats_and_independent_backup - Deliver persistent actionable panel chats and independent backup
> From version: 1.0.0
> Schema version: 1.0
> Status: Done
> Understanding: 100%
> Confidence: 95%
> Progress: 100%
> Complexity: High
> Theme: Panel
> Reminder: Update status/understanding/confidence/progress and linked request/task references when you edit this doc.
> Indicators reviewed: 2026-11-19 11:59:48

# AI Context
- Summary: Preserve topic identity after completion and selection changes; expose Crow actions and independent maintenance routines.
- Keywords: deliver, persistent, actionable, panel, chats, independent, backup
- Use when: Changing panel topic persistence, chat admission, run presentation or maintenance controls.
- Skip when: Working on the separate Nest session terminal or unrelated hub routines.

# Problem
- Selection changes redirect chat and completed rows lose their thread link; read-only policy prevents requested actions.

# Scope
- In:
  - Topic persistence, pinned chat and recent/new conversations
  - Live action profile and classic Outlook draft pipeline access
  - Run labels, navigation and refresh
  - Separate backup routine and private script modes
  - Hub handoff regression validation
- Out:
  - Mail sending
  - Branch push or merge

# Acceptance criteria
- AC1: Settling a row preserves its topic and history; completed rows and global search reopen conversations, including existing stored topics.
- AC2: Chat stays pinned across list navigation and settling; the topic banner is visible and the composer regains focus after answers without firing row shortcuts.
- AC3: Live Claude chats can use Crow actions, files, jobs and classic Outlook reply-all drafts; sending mail remains forbidden and trial chats remain read-only.
- AC4: Chat runs have readable topic labels and reopen links in Runs and Jobs, with fresh data after chat launches and completions.
- AC5: New free-title or dossier chats and recent persisted conversations are accessible.
- AC6: Machine updates and OneDrive backup have separate routines; the private script has backed-up no-backup and backup-only modes.
- AC7: Hub handoff regression is fixed or documented with validation; tests pass, local commits exist and the live server is restarted.

# AC Traceability
- request-AC1 -> This backlog slice. Proof: AC1: Settling a row preserves its topic and history; completed rows and global search reopen conversations, including existing stored topics.
- request-AC2 -> This backlog slice. Proof: AC2: Chat stays pinned across list navigation and settling; the topic banner is visible and the composer regains focus after answers without firing row shortcuts.
- request-AC3 -> This backlog slice. Proof: AC3: Live Claude chats can use Crow actions, files, jobs and classic Outlook reply-all drafts; sending mail remains forbidden and trial chats remain read-only.
- request-AC4 -> This backlog slice. Proof: AC4: Chat runs have readable topic labels and reopen links in Runs and Jobs, with fresh data after chat launches and completions.
- request-AC5 -> This backlog slice. Proof: AC5: New free-title or dossier chats and recent persisted conversations are accessible.
- request-AC6 -> This backlog slice. Proof: AC6: Machine updates and OneDrive backup have separate routines; the private script has backed-up no-backup and backup-only modes.
- request-AC7 -> This backlog slice. Proof: AC7: Hub handoff regression is fixed or documented with validation; tests pass, local commits exist and the live server is restarted.

# Decision framing
- Product framing: Not needed
- Architecture framing: Not needed

# Links
- Product brief(s): `prod_010_panel_conversation_continuity_and_actions`
- Architecture decision(s): (none yet)
- Request: `req_063_panel_persistent_actionable_conversations_and_separate_backup_routine`
- Primary task(s): `task_024_deliver_panel_conversation_continuity_and_actions`

# Priority
- Priority: High
- Rationale: Prevent accidental settlement and messages reaching the wrong topic during daily panel use.

# Executions
| When | Runner | Run id | Title | State | PR | Notes |
| --- | --- | --- | --- | --- | --- | --- |

# Tasks
- `task_024_deliver_panel_conversation_continuity_and_actions`

# Notes
- Task `task_024_deliver_panel_conversation_continuity_and_actions` was finished via `logics-manager flow finish task` on 2026-11-19.
