# Live-test a hook or key press on a real Claude session

Use when a feature reacts to a live Claude Code session (hooks, permission prompts, key presses) and unit tests are not enough.

1. Make a scratch folder in the session scratchpad (never /tmp, never a repo).
2. Start a hidden session there: `tmux new-session -d -s <name> -c <dir> 'claude --model haiku --permission-mode default'`. No visible window.
3. Accept the folder trust dialog: `tmux send-keys -t <name> Down Enter`, then wait for `for shortcuts` in `tmux capture-pane -p -t <name>`.
4. Type the prompt with `tmux send-keys -t <name> -l '<text>'` then `tmux send-keys -t <name> Enter`. Ask for one exact harmless command (`date +%s > stamp.txt`).
5. Wait on a condition, not a fixed sleep: `timeout 40 bash -c 'until <check>; do sleep 1; done'`.
6. Check the result through the feature's own CLI, then on disk (the stamp file).
7. Scripts that pick a terminal backend default to kitty and fall back to tmux when kitty does not hold the session, so core and Nest reach a hidden tmux session too. Use this to test from the phone.
8. Clean up: `tmux kill-session -t <name>` and remove state files the test wrote.

Notes
- Permission menu: 1 Yes, 2 always allow, 3 auto mode, 4 No. `1` allows once; Escape denies and ends the turn.
- AskUserQuestion: ask the session to call it with given headers and options. Its status file shows `input needed`. Keys: see `bin/crow-prompt --help` (digits, Other row N+1, Down to Next, review step "1"). Answer through `crow-prompt answer --answers` or core `POST /api/sessions/<pid>/answer`.
- After `bin/crow core restart` the dispatch view answers 409 "stale" for a few seconds: wait until `/api/state/dispatch` lists the prompt id.
- Nest shots on fixtures need the vite dev server (`npx vite --port N`): `vite preview` serves the production build, which reads the real core API.
- Claude's own status file `<HOME>/.claude/sessions/<pid>.json` shows `waiting` / `permission prompt` while the dialog is up.
- Never `pkill -f` a pattern that matches your own command line.

Test a Nest/core branch live (without touching the running core)
- Build the branch app: `npm run build` in `<worktree>/tools/nest`.
- Scratch config (`CROW_CORE_CONFIG`): `store:` a copy of `local/state/core.db`, `serve.listen` another port, `serve.socket` a short path (unix sockets cap at ~108 chars; scratchpad paths are too long).
- Start: `CROW_HOME=<main repo> CROW_ENGINE=<worktree> CROW_CORE_CONFIG=<yaml> crow-core serve`. Engine = worktree, so core runs the branch's `bin/` scripts and serves its `tools/nest/dist`.
- Drive with headless playwright-core on the TCP port, `extraHTTPHeaders` holding the owner identity header; the socket needs none. Chat route: `/desk/<pid>`.
- The test session is a real session on the account: it shows in the live Nest Desk until it is killed. Kill it and the branch core when done.
