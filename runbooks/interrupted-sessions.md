# Interrupted sessions: find them, relaunch them on another account

When an account hits its 5-hour or weekly limit, the sessions running on it stop on a limit
message. They can continue on another allowed account through a cdx handoff.

## Find
- `crow sessions`: one line per session whose last turn is a limit error (retros and the
  /brief, /daily, /weekly one-shots are left out). Cheap to rerun: transcripts are cached by mtime and size.
- `crow sessions show <id-prefix>`: the full entry (transcript path, workspace, first and last prompt).
- Registry: `<state>/interrupted-sessions.json`; relaunches are logged in `<state>/relaunches.jsonl`
  and drop out of the list.

## Pick a target
- `crow relaunch status`: allowed accounts, which are blocked, and the recommended target
  (`use` accounts first, then `ask-first`). `never` accounts are not shown and are always refused.

## Relaunch
1. `crow relaunch <id> <account> --dry-run`: runs only the read-only cdx checks
   (`can-resume`, `status`) and prints the exact handoff. Nothing is prepared or launched.
2. `crow relaunch <id> <account>`: asks first. A `use` account takes `y` (or `--yes`); an `ask-first`
   account needs a typed `yes` on a terminal every time, and `--yes` does not count for it.
3. It runs `cdx handoff <source> <target> --source-conversation <id>` from the session's workspace.
   Never call `cdx handoff` without `--source-conversation`: cdx then offers its own candidates, which
   once included an automatic retro instead of the real session.

## Gotchas
- cdx only hands off a transcript with exactly one workspace (cwd). A session that changed
  directory (worktrees, subfolders) is flagged `[N workspaces: cdx cannot hand off]` in the list,
  and the relaunch refuses it.
- Check `crow runs` before relaunching a background run: a later run may already have resumed it.
- Accounts with memory mode `session` get `local/memory` linked for the relaunched session, then
  unlinked and committed when it ends.
