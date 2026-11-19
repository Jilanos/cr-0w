## req_063_panel_persistent_actionable_conversations_and_separate_backup_routine - Panel persistent actionable conversations and separate backup routine
> From version: 1.0.0
> Schema version: 1.0
> Status: Done
> Understanding: 100%
> Confidence: 95%
> Complexity: High
> Theme: Panel
> Reminder: Update status/understanding/confidence and linked backlog/task references when you edit this doc.
> Indicators reviewed: 2026-11-19 11:59:47

# AI Context
- Summary: Preserve topic identity after completion and selection changes; expose Crow actions and independent maintenance routines.
- Keywords: panel, persistent, actionable, conversations, separate, backup, routine
- Use when: Changing panel topic persistence, chat admission, run presentation or maintenance controls.
- Skip when: Working on the separate Nest session terminal or unrelated hub routines.

# Needs
- Keep settled conversations reachable and prevent accidental topic switches.
- Allow the owner to operate Crow from chat and observe its runs.
- Separate expensive backups from tool updates.

# Context
- Cause spans topic persistence, selection, run registry and action policy; requires a workflow chain under ADR 030.

# Acceptance criteria
- AC1: Settling a row preserves its topic and history; completed rows and global search reopen conversations, including existing stored topics.
- AC2: Chat stays pinned across list navigation and settling; the topic banner is visible and the composer regains focus after answers without firing row shortcuts.
- AC3: Live Claude chats can use Crow actions, files, jobs and classic Outlook reply-all drafts; sending mail remains forbidden and trial chats remain read-only.
- AC4: Chat runs have readable topic labels and reopen links in Runs and Jobs, with fresh data after chat launches and completions.
- AC5: New free-title or dossier chats and recent persisted conversations are accessible.
- AC6: Machine updates and OneDrive backup have separate routines; the private script has backed-up no-backup and backup-only modes.
- AC7: Hub handoff regression is fixed or documented with validation; tests pass, local commits exist and the live server is restarted.

# Definition of Ready (DoR)
- [x] Problem statement is explicit and user impact is clear.
- [x] Scope boundaries (in/out) are explicit.
- [x] Acceptance criteria are testable.
- [x] Dependencies and known risks are listed.

# Companion docs
- Product brief(s): `prod_010_panel_conversation_continuity_and_actions`
- Architecture decision(s): (none yet)

# References
- bin/crow_panel/launcher.py
- bin/crow_panel/pending.py
- bin/panel_ui/js/app.js
- runbooks/panel.md

# Backlog
- `item_221_deliver_persistent_actionable_panel_chats_and_independent_backup`

# Executions
| When | Runner | Run id | Title | State | PR | Notes |
| --- | --- | --- | --- | --- | --- | --- |
