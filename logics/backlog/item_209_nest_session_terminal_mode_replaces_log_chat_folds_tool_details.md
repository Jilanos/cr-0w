## item_209_nest_session_terminal_mode_replaces_log_chat_folds_tool_details - Nest session Terminal mode replaces Log, Chat folds tool details
> From version: 1.0.0
> Schema version: 1.0
> Status: Ready
> Understanding: 85
> Confidence: 75
> Progress: 0%
> Complexity: Medium
> Theme: General
> Reminder: Update status/understanding/confidence/progress and linked request/task references when you edit this doc.

# AI Context
- Summary: a session's Chat and Log tabs in Nest show the same transcript twice. Log becomes Terminal, a live read-only mirror of the session's terminal screen; Chat keeps text and gets expandable tool details.
- Keywords: nest, terminal, mirror, kitty get-text, tmux capture-pane, ansi, xterm, chat, log, tools
- Use when: seeing exactly what a session's terminal shows from Nest.
- Skip when: typing keys straight into the terminal (later step).

# Problem
- Chat (text, folded tools) and Log (Desk Timeline of the same events) read the same transcript. The owner gets little new from Log (2026-11-16).
- Nothing in Nest shows what only the terminal shows: permission prompts, the AskUserQuestion picker, slash command output, compaction, hook messages, the status line, the live screen.

# Scope
- In:
  - Core: `GET /api/sessions/<pid>/screen` returns the current screen with ANSI colours, from kitty (`get-text --ansi`) or tmux (`capture-pane -e -p`), the same backends crow-prompt uses (CROW_TERMINAL). Scrollback limited (e.g. last 500 lines). 404 with a reason when the session has no known terminal.
  - Nest: the Log tab becomes Terminal. It renders the screen with a terminal renderer (pick xterm.js or ANSI to HTML in the spike) in the terminal theme, polls every 1 to 2 s while visible, follows the bottom unless the owner scrolled up.
  - Chat: each tool call folds open to its input and output (what Log offered).
  - Layouts: laptop and inner at a small monospace size; cover scrolls sideways or shows the last screen only (owner picks).
  - Mockups first: board options for the Terminal tab on laptop, inner and cover, owner picks, then build.
- Out:
  - Sending keys from the Terminal tab (input stays in the send box, item_208). A later item can forward keys.
  - Sessions outside kitty or tmux (they show "no terminal").

# Acceptance criteria
- AC1: The owner approves a rendered board of the Terminal tab (laptop, inner, cover) first.
- AC2: Terminal shows the same screen as the real terminal (colours, prompts, picker, status line) within 2 s.
- AC3: Chat tool calls expand to their input and output; nothing Log showed is lost.
- AC4: Polling stops when the tab is hidden; core reads stay cheap (one capture per poll).
- AC5: A session with no kitty or tmux terminal shows a clear "no terminal" state.
- AC6: Live test on a hidden tmux session; tsc, vitest, go test, pytest pass.

# Links
- Builds on item_187 (session chat in the laptop Desk), item_193 (ask buttons), item_208 (chat fixes).

# Priority
- Priority: Medium
- Rationale: after the reel path (item_204, item_166, item_207) and item_208.

# Notes
- Raised by the owner 2026-11-16: "would be nice to have a terminal mode too to really see everything in the session as if i was in the terminal".

# Executions
| When | Runner | Run id | Title | State | PR | Notes |
| --- | --- | --- | --- | --- | --- | --- |
