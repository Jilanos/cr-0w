# Claude and Codex: set up, use, smoke-test

Crow runs Claude Code and Codex accounts side by side through cdx. Limits and capabilities:
[`docs/cdx-compatibility.md`](../docs/cdx-compatibility.md).

## Set up
1. `cdx --version` must be 0.21.4 or newer. `cdx` lists every account with its provider.
2. Declare the accounts crow may use in `local/accounts.yaml`. `provider:` is optional and checked
   against cdx. An account missing from the file is never used.

Claude only (unchanged):
```yaml
default: main
accounts:
  - {name: main, policy: use, memory: permanent}
```

Codex only:
```yaml
default: codex-main
accounts:
  - {name: codex-main, provider: codex, policy: use}
```
The hub session (`crow`) needs Claude. Briefs run in a sandbox without network.

Mixed:
```yaml
default: main
accounts:
  - {name: main,       provider: claude, policy: use,       memory: permanent}
  - {name: codex-main, provider: codex,  policy: use}
  - {name: codex-team, provider: codex,  policy: ask-first}
```

3. `crow-accounts providers` shows what crow sees; `crow-accounts resolve --provider codex`
   shows which account a Codex launch would use.

## Use
- Pick the account for one launch: `crow [--account A | --provider claude|codex] <command>`.
  `--provider` alone uses the default when it matches, else the first `use` account of that
  provider. It never picks an `ask-first` account: name it, then confirm (typed `yes`, or
  `--confirm-account <name>`).
- Project session on Codex: `crow --provider codex open <project> "task"`.
- Background run on Codex: `crow --provider codex dispatch <project> "<label>" --prompt-file F`.
  `CROW_MAX_RUNS` counts runs of both providers. A second writer in the same folder is refused:
  give it a worktree (`--cwd <repo>.wt/<name>`) or `--read-only`.
- Board: `crow watch` and both widgets name each account's provider once more than Claude is in use.
  Unknown cost shows `$?` (widgets `–`); unknown context shows nothing.

## Move interrupted work
- `crow sessions` lists stopped sessions of both providers with their exact id.
- `crow relaunch <id> <account>`: the same account resumes that exact conversation natively;
  another account, same provider or not, gets a transfer (a new conversation linked to the old one).
- `crow relaunch <id> auto --source <account>` picks the recommended account (what `R` in
  `crow watch` and a click in the widget run). Every path prints the exact target and asks first.

## Live smoke (owner-run, needs one Claude and one Codex account)
Automated tests use a fake cdx. This check uses real accounts and costs a little usage.
1. Register a throwaway repo as `demo` in `local/projects.yaml`, then make two worktrees: `git worktree add ../demo.wt/claude`, `git worktree add ../demo.wt/codex`.
2. `crow --provider claude dispatch demo "smoke claude" --cwd ../demo.wt/claude --prompt "List the files, write nothing."`
3. `crow --provider codex dispatch demo "smoke codex" --cwd ../demo.wt/codex --prompt "List the files, write nothing."`
4. `crow runs`: both run at once in 2 of 2 slots. A third dispatch is refused.
5. `crow-runs wait <id1> <id2>`, then `crow-runs report <id>` for each: both print a final message.
6. `crow usage`: today shows a `claude` and a `codex` line.
7. Handoff: open a Codex session in the demo repo, stop it, then
   `crow relaunch <codex id> <claude account> --dry-run`, then without `--dry-run`; confirm,
   and check the Claude session starts from the Codex transcript in the same folder.
8. Record the date, cdx version and result in the task's Report.
