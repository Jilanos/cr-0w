# Interrupted sessions: find them, relaunch them on another account

When an account hits its 5-hour or weekly limit, the sessions running on it stop on a limit
message. They can continue natively on the same account after the reset, or on another allowed
account of either provider through a checked cdx handoff.

## Find
- `crow sessions`: one line per Claude or Codex session whose last turn is a limit error (retros, titles and the
  /brief, /daily, /weekly one-shots are left out). Cheap to rerun: transcripts are cached by mtime and size.
  An entry is its provider, account and conversation id: the same id under two accounts is two entries
  (`--source <account>` picks one).
- `crow sessions show <id-prefix>`: the full entry (transcript path, workspace, first and last prompt).
- Registry: `<state>/interrupted-sessions.json`; relaunches are logged in `<state>/relaunches.jsonl`
  and drop out of the list.

## Pick a target
- `crow relaunch status`: allowed accounts, which are blocked, and the recommended target
  (`use` accounts first, then `ask-first`). `never` accounts are not shown and are always refused.

## Relaunch
1. `crow relaunch <id> <account> --dry-run`: runs only the read-only checks and prints the exact target and mode.
   Nothing is prepared or launched. `auto` in place of the account takes the recommended one.
   - same account: **native resume**, only when `cdx can-resume` names this exact conversation.
   - another account, same provider or not: **transfer** to a new conversation, linked to the old one.
2. `crow relaunch <id> <account>`: asks first. A `use` account takes `y` (or `--yes`); an `ask-first`
   account needs a typed `yes` on a terminal every time, and `--yes` does not count for it.
3. After the confirmation a transfer runs `cdx handoff <source> <target> --source-native-transcript <path> --json`
   from the session's workspace and checks the entry names this conversation, workspace, source and target.
   Then a new kitty window (detached, real HOME, no inherited Claude/cdx variables) launches the target on
   the entry's recovery prompt. `--here` runs it in the current terminal instead.
   Never call `cdx handoff` without an explicit source: cdx then offers its own candidates, which
   once included an automatic retro instead of the real session.
4. `relaunches.jsonl` gets `prepared`, then `launched` or `failed`. Only `launched` takes the session off the list.
   `R` in `crow watch` and a click on a stopped session in the widget run `crow relaunch <id> auto --source <account> --here`
   in a new window, with the same checks and questions.

## Gotchas
- cdx only hands off a transcript with exactly one workspace (cwd). A session that changed
  directory (worktrees, subfolders) is flagged `[N workspaces: cdx cannot hand off]` in the list,
  and the relaunch refuses it. No folder trick works: cdx counts every cwd in the transcript, so
  relaunching from the last folder or the worktree root is still refused. The fix is a cdx change
  (accept the launch folder when it is one of the transcript's workspaces), prepared as a local
  patch and PR text under `local/state/afk/shots/`; nothing is posted upstream.
- Check `crow runs` before relaunching a background run: a later run may already have resumed it.
- Claude accounts with memory mode `session` get `local/memory` linked for the relaunched session through a lease,
  unlinked and committed when the last session on the account ends.
