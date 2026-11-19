## item_188_start_an_interactive_session_that_lives_in_nest - Start an interactive session that lives in Nest
> From version: 1.0.0
> Schema version: 1.0
> Status: Done
> Understanding: 100%
> Confidence: 95%
> Progress: 100%
> Complexity: Medium
> Theme: Nest
> Reminder: Update status/understanding/confidence/progress and linked request/task references when you edit this doc.

# AI Context
- Summary: POST /api/sessions runs `crow term` with CROW_TERMINAL=headless: a detached tmux session (own systemd scope under the core service). crow-runs sets `tmux` on the agent row; Desk opens the new session's chat when it shows up; the chat Terminal button calls POST /api/sessions/{pid}/attach (`crow-focus --attach`, kitty running `tmux attach`).
- Keywords: start, interactive, session, nest, headless, tmux, attach
- Use when: changing how Nest starts or attaches to interactive sessions.
- Skip when: background runs (crow dispatch) or remote hosts.

# Problem
- POST /api/sessions runs `crow term`, which opens a kitty window on the desktop. A session started from Nest should run without a window and be driven from Nest.

# Scope
- In:
  - Core starts Nest sessions on a headless backend (detached tmux) so send, answers and stop work with no desktop window.
  - Nest new-session form on the laptop: project, account (picker default), optional first prompt; the new session opens in its chat.
  - An 'open in terminal' action that attaches a terminal to the same session when the owner wants one.
- Out:
  - Remote hosts (item_120, item_181).

# Acceptance criteria
- Starting a session from Nest opens no window on the desktop; it shows in the Desk within one poll and its chat accepts a message.
- The account picker rules of crow term apply (allowed account, quota left).
- Open in terminal attaches to the same session; closing that terminal leaves the session running.
- Core tests cover the headless start; live test on a real project.

# AC Traceability
- request-AC4 -> This backlog slice. Proof: Starting a session from Nest opens no window on the desktop; it shows in the Desk within one poll and its chat accepts a message.

# Decision framing
- Product framing: Not needed
- Architecture framing: Not needed

# Links
- Product brief(s): `prod_009_nest_laptop_parity`
- Architecture decision(s): (none yet)
- Request: `req_057_nest_on_the_laptop_replaces_the_owner_s_terminals`
- Primary task(s): `task_023_orchestrate_nest_laptop_parity`

# Priority
- Priority: Medium
- Rationale: Set by scaffold input or defaulted for grooming.

# Executions
| When | Runner | Run id | Title | State | PR | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11-18 | hub session | - | Headless start, attach, Desk open | Done | - | Live on lazytf/rk1: no window, row with tmux, send got "pong", stop closed the tmux session. First start in a project can show the external CLAUDE.md imports dialog; it blocks the row until answered (attach). Attach not tested live. |

