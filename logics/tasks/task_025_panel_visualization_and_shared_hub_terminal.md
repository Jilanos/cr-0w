## task_025_panel_visualization_and_shared_hub_terminal - Panel visualization and shared hub terminal
> From version: 1.0.0
> Schema version: 1.0
> Status: Done
> Understanding: 90%
> Confidence: 85%
> Progress: 100%
> Complexity: Medium
> Theme: Implementation delivery
> Reminder: Update status/understanding/confidence/progress and linked request/backlog references when you edit this doc.
> Owner: panel
> Indicators reviewed: 2026-11-19 14:48:44

# AI Context
- Summary: Deliver the panel as visualisation plus a shared interactive hub terminal.
- Keywords: panel, visualization, shared, hub, terminal
- Use when: Verifying the panel recentring delivery and its terminal/sync boundaries.
- Skip when: Changing Nest or the hub conversation workflow.

# Definition of Done (DoD)
- [x] The backlog scope is implemented.
- [x] Acceptance criteria are covered.
- [x] Validation passes.
- [x] Meaningful waves followed ADR 009: affected docs updated and the repo left commit-ready without automatic commits.

# Backlog
- `item_260_panel_visualization_and_shared_hub_terminal`

# Acceptance criteria
- AC1: Terminal displays and controls the shared tmux hub, offers startup and shows its attach command.
- AC2: Every pending/dossier/mail/run topic offers context insertion with an optional note and no automatic Enter.
- AC3: Chat writes and queued legacy model jobs are disabled; old conversations remain read-only.
- AC4: Mail and agenda sync use COM only; filing uses rules/history and unresolved mail has no proposal.
- AC5: Feedback/history, dossiers, live run logs, accounts/limits, agenda, filing/undo, routines and notifications remain.
- AC6: Python and UI checks pass; guides are current; commits stay on panel and the server restarts detached.

# Plan
- [x] Reuse upstream crow-screen, headless crow term and Nest ANSI/key mappings.
- [x] Add topic context insertion and retain read-only conversation history.
- [x] Remove chat writes, legacy queued model jobs and mail/calendar model fallback.
- [x] Preserve deterministic feedback, COM drafts/filing/undo, routines and notifications.
- [x] Update guides and verify Python, fixtures and disposable-server flows.
- [x] Commit locally, restart the panel detached and verify the served runtime.

# AC Traceability
- request-AC1 -> This task. Proof: `tests/test_panel_terminal.py` tests real tmux capture, keys, resize, startup reuse and exact target checks; browser Terminal flows cover startup and attach display.
- request-AC2 -> This task. Proof: terminal handoff tests cover pending file/line, mail links, dossier paths and run sources; browser tests assert no Enter during insertion.
- request-AC3 -> This task. Proof: removed mutation routes and legacy job refusal are covered in `tests/test_panel_terminal.py`; settled history tests and browser read-only dialogs preserve conversations.
- request-AC4 -> This task. Proof: native sync tests cover mail/calendar without model stages, rule/history proposals and cached model-suggestion removal.
- request-AC5 -> This task. Proof: retained panel suites cover feedback/undo, dossiers, notifications, native move/undo, draft verification, routines and shared account limits.
- request-AC6 -> This task. Proof: Python suite and browser evidence recorded below; implementation commit `5af218f`; detached-runtime verification recorded below.

# Validation
- 2026-11-19: `uv run --with pytest --with pyyaml --with markdown python -m pytest -q tests`: 895 passed, 3 environment-dependent skips.
- 2026-11-19: final affected regression (`tests/test_panel*.py tests/test_run_limits.py`): 190 passed; final source/capability regression: 53 passed.
- 2026-11-19: `node bin/panel_ui/dev/integration.mjs` on a disposable dry-run server: 16/16 checks passed, no model/remote mailbox write.
- 2026-11-19: fixture browser checks: 61/61 individual flows passed; Terminal/layout checks: 8/8 passed; exhaustive scenario/view sweep: 144 combinations passed (62/62 fixture scenarios in total).
- 2026-11-19: `git diff --check` passed.
- 2026-11-19: live runtime probe passed after detached restart; browser Terminal probe: zero console errors. Session mode is live and the server has an independent session id.
- Global Logics lint/audit report existing findings in older docs; delivery-chain validation is scoped to this request, item and task.
- Python: 895 passed, 3 skipped; affected regression: 190 passed; UI: 62 fixture scenarios and 16 integration checks passed; live detached panel and browser Terminal verified.
- Finish workflow executed on 2026-11-19.
- Linked backlog/request close verification passed.

# Report
- Implemented shared Terminal and explicit topic insertion with no Enter.
- Removed panel chat and automatic model-backed mail/calendar workflows.
- Only Maj and explicit worka draft composition call a model; interactive terminal requests belong to the hub.
- Documentation and retained workflow tests updated. Commit `5af218f` stays on branch `panel`.
- Panel restarted with setsid. Live API confirms Terminal, no chat configuration and four readable stored conversations. A fresh browser opens Terminal with zero console errors and the hub startup button. No hub or model was started as a smoke test.
- Finished on 2026-11-19.
- Linked backlog item(s): `item_260_panel_visualization_and_shared_hub_terminal`
- Related request(s): `req_066_panel_visualization_and_shared_hub_terminal`

# Links
- Request: `req_066_panel_visualization_and_shared_hub_terminal`
- Product brief(s): (none yet)
- Architecture decision(s): (none yet)

# Executions
| When | Runner | Run id | Title | State | PR | Notes |
| --- | --- | --- | --- | --- | --- | --- |
