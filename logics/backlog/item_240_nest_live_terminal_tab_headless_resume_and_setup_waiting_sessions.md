## item_240_nest_live_terminal_tab_headless_resume_and_setup_waiting_sessions - Nest live terminal tab, headless resume and setup-waiting sessions
> From version: 1.0.0
> Schema version: 1.0
> Status: Done
> Understanding: 100
> Confidence: 95
> Progress: 100%
> Complexity: Medium
> Theme: Nest
> Reminder: Update status/understanding/confidence/progress and linked request/task references when you edit this doc.

# AI Context
- Summary: Follow-ups of item_188 asked by the owner 2026-11-18. Resume from Nest runs headless; sessions stuck before a session id show as "setup"; the Desk chat pane's Log tab becomes a live Terminal tab on the session's tmux screen with keys sent through.
- Keywords: nest, terminal, tmux, capture-pane, send-keys, resume, headless, setup
- Use when: changing the Desk chat pane's Terminal tab or how Nest resumes sessions.
- Skip when: background runs or remote hosts.
- Built: core `routeTerminal` (terminal.go) over `bin/crow-screen`; Nest `ui/Terminal.tsx` + `ui/ansi.ts`; crow-runs `setup` state; crow-focus resumes with `cdx resume <account> --project <cwd> --conversation <id>` (the old `cdx <account> --dir --resume` form had stopped working). Log stays on rows without tmux; the attach route is kept with no button.

# Problem
- Resume from Nest still opens a kitty window.
- A headless session stuck on a first-run dialog has no session id, so crow-runs drops it and Nest never shows it.
- The owner wants the terminal inside Nest: the Chat | Log toggle becomes Chat | Terminal (decided 2026-11-18, live tab with keys).

# Scope
- In:
  - Core resume passes CROW_TERMINAL=headless; crow-focus prints a JSON result with tmux; Desk opens the resumed chat.
  - crow-runs lists headless claude sessions without a session id with state "setup".
  - Core GET /api/sessions/{pid}/screen (tmux capture-pane with ANSI) and POST /api/sessions/{pid}/keys (tmux send-keys); Nest Terminal tab polls the screen and sends keys typed in it. Log tab removed. Terminal tab only on sessions with tmux.
- Out:
  - Remote hosts; a full pty over websocket.

# Acceptance criteria
- AC1: Resume from Nest opens no window and the resumed session shows in Desk with tmux.
- AC2: A headless session waiting on a first-run dialog shows in Desk as "setup", and its Terminal tab answers the dialog.
- AC3: The Terminal tab shows the live tmux screen with colors, refreshed about every second, and keys typed in it (letters, Enter, arrows, Esc, Backspace, Ctrl-C) reach the session.
- AC4: Core and Nest tests cover screen, keys and headless resume.

# AC Traceability
- req_057-AC4 -> This backlog slice. Proof: sessions started or resumed from Nest are driven from Nest, terminal included.

# Decision framing
- Product framing: Not needed
- Architecture framing: Not needed

# Links
- Product brief(s): `prod_009_nest_laptop_parity`
- Architecture decision(s): (none yet)
- Request: `req_057_nest_on_the_laptop_replaces_the_owner_s_terminals`
- Primary task(s): `task_023_orchestrate_nest_laptop_parity`

# Priority
- Priority: High
- Rationale: Owner focus 2026-11-18 (app functionality).

# Executions
| When | Runner | Run id | Title | State | PR | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11-18 | hub session | - | Terminal tab, headless resume, setup state | Done | - | Live check on lazytf: start, screen, keys (pong), resize, resume headless, stop. Pytest 684, Go 221, vitest 211. |
