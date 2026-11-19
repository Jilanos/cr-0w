## req_066_panel_visualization_and_shared_hub_terminal - Panel visualization and shared hub terminal
> From version: 1.0.0
> Schema version: 1.0
> Status: In progress
> Understanding: 90%
> Confidence: 85%
> Complexity: Medium
> Theme: General
> Reminder: Update status/understanding/confidence and linked backlog/task references when you edit this doc.
> Owner: panel
> Indicators reviewed: 2026-11-19 14:45:10

# AI Context
- Summary: Keep hub requests in the terminal; make the portable panel a visualisation and feedback surface.
- Keywords: panel, terminal, tmux, Outlook COM, deterministic filing
- Use when: Maintaining the panel and its shared hub session.
- Skip when: Designing Nest's future manager views.

# Needs
- The panel shows the existing hub terminal and routes topic context there without submitting it.
- Remove panel chat and autonomous model-backed reads and filing suggestions.
- Preserve local feedback, settled history, dossiers, runs, accounts, agenda, filing/undo, routines and notifications.

# Context
- Owner decision, 2026-11-19: hub requests stay in the terminal; Nest will later own visualisation.
- This replaces the chat-as-hub direction of req_063. Stored conversations remain readable.
- Reuse crow term headless, crow-screen and Nest ANSI/key helpers. No new terminal backend.
- Owner explicitly requests implementation, tests, local commits and panel restart in this session; no push or merge.

# Acceptance criteria
- AC1: Terminal displays and controls the shared tmux hub, offers startup and shows its attach command.
- AC2: Every pending/dossier/mail/run topic offers context insertion with an optional note and no automatic Enter.
- AC3: Chat writes and queued legacy model jobs are disabled; old conversations remain read-only.
- AC4: Mail and agenda sync use COM only; filing uses rules/history and unresolved mail has no proposal.
- AC5: Feedback/history, dossiers, live run logs, accounts/limits, agenda, filing/undo, routines and notifications remain.
- AC6: Python and UI checks pass; guides are current; commits stay on panel and the server restarts detached.

# Definition of Ready (DoR)
- [x] Owner decision and operator impact are explicit.
- [x] Scope and exclusions are explicit.
- [x] Acceptance criteria are testable.
- [x] Dependencies: tmux, existing Crow launcher, classic Outlook; model composition remains explicit on worka.

# Delivery plan
1. Shared terminal backend and tab. Reuse upstream transport, keys, ANSI and startup; verify real tmux with a non-model shell.
2. Topic handoff and read-only history. Depend on step 1; remove chat pane, routes, policy and resumed queued chat jobs.
3. Deterministic sync. Remove mail/calendar connector-model fallback and proposal stages; retain COM drafts, moves and undo.
4. Update guides and regression tests, inspect the diff, commit locally, restart under setsid and verify the served UI.

# Companion docs
- Product brief(s): (none required; owner-scoped correction to the panel)
- Architecture decision(s): (none; upstream terminal transport is reused)

# References
- `runbooks/panel.md`
- `runbooks/core-service.md`
- `bin/crow-screen`
- `tools/nest/src/ui/ansi.ts`

# Backlog
- `item_260_panel_visualization_and_shared_hub_terminal`

# Executions
| When | Runner | Run id | Title | State | PR | Notes |
| --- | --- | --- | --- | --- | --- | --- |


# Delivery evidence
- AC1: `tests/test_panel_terminal.py` exercises capture, keys, resize, startup reuse, stale targets and dry-run refusal with a real tmux shell, without a model.
- AC2: Terminal handoff tests cover pending source/line and mail/dossier/run context. UI checks verify no Enter on insertion and explicit key forwarding.
- AC3: Removed routes return 404; legacy queued model jobs fail before launch. Settled-topic and read-only-history regression tests preserve stored conversations.
- AC4: Native mail/calendar sync has no proposal-model stage. Rules, history, snapshot preservation and stale model-suggestion removal are covered.
- AC5: The existing feedback, dossier, notifications, native move/undo, draft proof, routines and account-admission tests remain green.
- AC6: `python -m pytest -q tests`: 895 passed, 3 skipped. Final affected regression suite: 190 passed. Browser fixtures and disposable-server checks cover the complete retained flows.
- Documentation: `runbooks/panel.md`, `bin/panel_ui/README.md`, `docs/panel-api.md` and the example configuration describe the final behavior.
- Corpus-wide lint/audit still report pre-existing findings in other documents. Scoped validation of this request has no finding.
