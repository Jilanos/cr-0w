## task_024_deliver_panel_conversation_continuity_and_actions - Deliver panel conversation continuity and actions
> From version: 1.0.0
> Schema version: 1.0
> Status: In progress
> Understanding: 100%
> Confidence: 95%
> Progress: 80%
> Complexity: Medium
> Theme: Implementation delivery
> Reminder: Update status/understanding/confidence/progress and linked request/backlog references when you edit this doc.
> Owner: Codex
> Indicators reviewed: 2026-11-19 11:41:16

# AI Context
- Summary: Preserve topic identity after completion and selection changes; expose Crow actions and independent maintenance routines.
- Keywords: deliver, panel, conversation, continuity, actions
- Use when: Changing panel topic persistence, chat admission, run presentation or maintenance controls.
- Skip when: Working on the separate Nest session terminal or unrelated hub routines.

# Context
- Orchestrate the scaffolded request chain and keep sibling implementation slices linked.

# Plan
- [ ] 1. 1. Preserve settled topics, pin chat and restore focus; add creation, recents and search.
- [ ] 2. 2. Enable live Crow actions, expose existing draft pipeline and improve run visibility.
- [ ] 3. 3. Separate backup routine, validate regressions, document and restart live server.
- [ ] ADR 009 checkpoint: update affected Logics docs during each meaningful wave and leave the repo commit-ready.
- [ ] Keep commit creation under operator control; do not force one commit per micro-step.
- [ ] GATE: do not close until lint, audit, and scaffold validation pass.

# Backlog
- `item_221_deliver_persistent_actionable_panel_chats_and_independent_backup`

# Definition of Done (DoD)
- [ ] Generated request, product, backlog, and task docs are present.
- [ ] Context-pack handoff is available when requested.
- [ ] Validation passes.
- [ ] Meaningful waves followed ADR 009: affected docs updated and the repo left commit-ready without automatic commits.

# AC Traceability
- request-AC1 -> `item_221_deliver_persistent_actionable_panel_chats_and_independent_backup`. Proof deferred to slice closeout.
- request-AC2 -> `item_221_deliver_persistent_actionable_panel_chats_and_independent_backup`. Proof deferred to slice closeout.
- request-AC3 -> `item_221_deliver_persistent_actionable_panel_chats_and_independent_backup`. Proof deferred to slice closeout.
- request-AC4 -> `item_221_deliver_persistent_actionable_panel_chats_and_independent_backup`. Proof deferred to slice closeout.
- request-AC5 -> `item_221_deliver_persistent_actionable_panel_chats_and_independent_backup`. Proof deferred to slice closeout.
- request-AC6 -> `item_221_deliver_persistent_actionable_panel_chats_and_independent_backup`. Proof deferred to slice closeout.
- request-AC7 -> `item_221_deliver_persistent_actionable_panel_chats_and_independent_backup`. Proof deferred to slice closeout.

# Validation
- (no validation recorded yet)

# Report
- Settled rows retain their topic and transcript; exact completion evidence recovers legacy links without rewriting the pending document.
- Chat pins its topic, restores composer focus and offers free-title/dossier creation, recents and transcript search.
- Live action turns use fresh guards, existing classic Outlook draft pipelines and a local authenticated API helper. Trial turns remain read-only. Direct send/forward tools are denied; shell actions obey owner no-send instructions.
- Chat run labels and provenance survive cdx metadata; launch/completion and periodic refresh update Runs and Jobs.
- Backup is an independent routine; the private external script/config have dated backups and separate flags, verified against disposable roots.
- Hub handoff was already supported in this checkout; corrected the stale runbook and passed the existing regression.
- Targeted panel and project suite: 197 tests passed. Desktop/mobile continuity scenarios and initial smoke scenarios passed. Full checks pending.
- General release checks exposed existing placeholder-path leak false positives; converted those fixtures to the allowed generic user root.

# Links
- Request: `req_063_panel_persistent_actionable_conversations_and_separate_backup_routine`
- Product brief(s): `prod_010_panel_conversation_continuity_and_actions`
- Architecture decision(s): (none yet)

# Executions
| When | Runner | Run id | Title | State | PR | Notes |
| --- | --- | --- | --- | --- | --- | --- |
