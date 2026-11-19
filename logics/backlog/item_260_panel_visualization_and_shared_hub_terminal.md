## item_260_panel_visualization_and_shared_hub_terminal - Panel visualization and shared hub terminal
> From version: 1.0.0
> Schema version: 1.0
> Status: Done
> Understanding: 90%
> Confidence: 85%
> Progress: 100%
> Complexity: High
> Theme: Operator workflow and runtime integration
> Reminder: Update status/understanding/confidence/progress and linked request/task references when you edit this doc.
> Indicators reviewed: 2026-11-19 14:48:44

# AI Context
- Summary: Shared hub Terminal, read-only history and deterministic Outlook sync.
- Keywords: panel, visualization, shared, hub, terminal
- Use when: Maintaining panel runtime, topic handoff and model admission.
- Skip when: Building Nest or changing the interactive hub itself.

# Problem
The panel shows the existing hub terminal and routes topic context there without submitting it.
Remove panel chat and autonomous model-backed reads and filing suggestions.
Preserve local feedback, settled history, dossiers, runs, accounts, agenda, filing/undo, routines and notifications.

# Scope
- In:
  - Reuse upstream terminal capture/keys/resize and headless startup.
  - Route topics without automatic Enter; retain stored conversation history.
  - Remove autonomous model reads/triage and retain COM mailbox operations.
- Out:
  - Nest redesign, mailbox sending, push or merge.

# Acceptance criteria
- AC1: Terminal displays and controls the shared tmux hub, offers startup and shows its attach command.
- AC2: Every pending/dossier/mail/run topic offers context insertion with an optional note and no automatic Enter.
- AC3: Chat writes and queued legacy model jobs are disabled; old conversations remain read-only.
- AC4: Mail and agenda sync use COM only; filing uses rules/history and unresolved mail has no proposal.
- AC5: Feedback/history, dossiers, live run logs, accounts/limits, agenda, filing/undo, routines and notifications remain.
- AC6: Python and UI checks pass; guides are current; commits stay on panel and the server restarts detached.

# AC Traceability
- request-AC1 -> This backlog slice. Proof: AC1: Terminal displays and controls the shared tmux hub, offers startup and shows its attach command.
- request-AC2 -> This backlog slice. Proof: AC2: Every pending/dossier/mail/run topic offers context insertion with an optional note and no automatic Enter.
- request-AC3 -> This backlog slice. Proof: AC3: Chat writes and queued legacy model jobs are disabled; old conversations remain read-only.
- request-AC4 -> This backlog slice. Proof: AC4: Mail and agenda sync use COM only; filing uses rules/history and unresolved mail has no proposal.
- request-AC5 -> This backlog slice. Proof: AC5: Feedback/history, dossiers, live run logs, accounts/limits, agenda, filing/undo, routines and notifications remain.
- request-AC6 -> This backlog slice. Proof: AC6: Python and UI checks pass; guides are current; commits stay on panel and the server restarts detached.

# Decision framing
- Product framing: Not needed
- Product signals: (none detected)
- Product follow-up: No product brief follow-up is expected based on current signals.
- Architecture framing: Not needed
- Architecture signals: (none detected)
- Architecture follow-up: No architecture decision follow-up is expected based on current signals.

# Links
- Product brief(s): (none yet)
- Architecture decision(s): (none yet)
- Request: `req_066_panel_visualization_and_shared_hub_terminal`
- Primary task(s): `task_025_panel_visualization_and_shared_hub_terminal`

# Priority
- Priority: High
- Rationale: Apply the owner’s current workflow decision and stop costly sync fallback calls.

# Notes
- Hybrid rationale: Derived from request `req_066_panel_visualization_and_shared_hub_terminal` and kept bounded to one coherent delivery slice.
- Source file: `logics/request/req_066_panel_visualization_and_shared_hub_terminal.md`.
- Generated locally by logics-manager.
- Task `task_025_panel_visualization_and_shared_hub_terminal` was finished via `logics-manager flow finish task` on 2026-11-19.

# Executions
| When | Runner | Run id | Title | State | PR | Notes |
| --- | --- | --- | --- | --- | --- | --- |


# Tasks
- `task_025_panel_visualization_and_shared_hub_terminal`
