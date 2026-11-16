# Dispatch background runs

Use when the user wants work done in project repos without opening a session there.

## Before dispatching
1. Check slots: `crow runs`. The default limit is 2 parallel runs (`CROW_MAX_RUNS`).
2. For each repo: `git config user.email` must match the scope identity in the registry,
   and `git status --short` must be checked. Uncommitted owner files get named in the prompt
   as "do not stage, commit, revert or stash".
3. Pick the work from open threads or the repo's Logics backlog (`logics/backlog/item_*`).
4. **One scope per run.** One bug or one acceptance-criteria group per run. Six bugs in one run read 15M tokens
   (2026-11-16): each call re-reads everything the run has seen so far.
5. **Capture the failure live first.** For a bug, the hub reproduces it and puts the failing state in the prompt:
   log lines, API output, a zoom crop. A run that starts from evidence does not hunt.
6. **Batch review rounds.** Collect every decision on the previous result in one AskUserQuestion round, then
   dispatch once. Each new round is a fresh run that re-reads the same context.
7. **Pick the kind (it picks the model).** `mech` (Sonnet, $8, 60 min) for mechanical edits: cleanup, delete,
   rename, wiring, a flag, recordings. `task` (Opus, $25) for design and debugging. `review` for read-only review.
   `--model` overrides one run. The dispatch line prints the kind and model.

## Prompt template (write it to the scratchpad, then pass it with --prompt-file)
- One line of context: repo, scope, "identity is already correct".
- Protected files (if any).
- Numbered steps. Keep each step to a single commit, smallest first (e.g. a build fix before a feature).
- Use `/implement-task`, and create the Logics task first if it is missing.
- Quality gate: tests or build green before every commit. Commit on the branch the autonomy table allows; push when green.
- No AI attribution.
- "Stop and report if something needs a product decision", naming the likely one.
- The stop-and-report budget is added by dispatch: task and mech prompts get a footer (`crow_lib.run_brief`) that
  stops the run after the kind's `call_cap` tool calls (task 60, mech 40) without a confirmed cause or a passing step.
- End with: report commits, what is left, open questions.

## Dispatch
`crow dispatch <project> "<short label>" --prompt-file <file> [--kind task|mech|review] [--power medium]`
This records the run in `<state>/runs.jsonl` so `crow runs` can show its label and commits.
When relaunching an interrupted run, add `--resumes <run_id>` so the old run is folded into the new one.

## Track
- **Never forgotten (2026-10-29):** `crow dispatch` starts a detached desktop notifier, and a UserPromptSubmit + SessionStart hook runs `crow-runs inbox --hook`, which lists finished runs not reported yet (`<state>/runs-seen.json`; `report` also marks a run seen). When the hook prints "UNREPORTED BACKGROUND RUNS", report them first. The `wait` below is still required: it is the only thing that wakes an idle session.
- **Get notified:** right after dispatching, start `bin/crow-runs wait <run_id>` as a *background* Bash command (one per run).
  It exits when the run finishes, and that exit wakes the session, so there's no need to ask the owner "tell me when it's done".
  The waiter only lives as long as the session. A run that finishes while no session is open shows up in `crow runs` / `crow watch`.
- `crow deck` (alias `crow watch`): the live deck (Go + Bubble Tea in `tools/crow-deck`, rebuilt on demand; reads `crow-runs json`). The Agents tab lists every run with its state, project, task, last activity, context and commits; the detail pane shows the selected run's timeline, commits and final report. `crow runs stop <run_id>` stops one running run.
- `crow runs`: the same view, printed once. `crow-runs json` gives the same data as JSON for widgets.
- States: ● working / ◌ quiet (a run with no transcript writes for 20s or more) / ◆ waiting (a session whose last message is text, i.e. it is waiting on the user) / ○ idle.
  Finished: ✓ done / ✗ failed / ⏸ usage limit / $ budget cap / ! stuck (killed by the watchdog or its timeout) / ? lost.
- Data sources: `<home>/.claude/sessions/<pid>.json` (current session id and busy/idle status; the id changes on /clear),
  then the transcript at `<home>/.claude/projects/<cwd with non-alphanumerics replaced by ->/<session>.jsonl`, and the ledger `<state>/runs.jsonl`.
- `cdx runs` lists finished runs only. A run's final report is the `result` field in its `stdout_path`.

## Recover
- **⏸ usage limit** (the stdout says "You've hit your session limit · resets HH:MM"): partial work stays
  in the tree. The run's notifier requeues it without the owner: a fresh run with a "RESUME NOTE" (`--resumes <id>`)
  on an account crow may use without asking, else on the same account once its 5h window resets: a Claude or isolated
  run restarts fresh from its prompt file with the RESUME NOTE (a `--continue-run` cannot carry the sandbox settings),
  a Codex run takes `--continue-run` (cdx cannot move a conversation to another account). At most 3 requeues per task; a weekly limit is not requeued.
  The inbox shows `limit` and "resumed as X on Y". By hand: redispatch with a RESUME NOTE saying what is already
  committed or uncommitted and which steps not to redo.
- **Account choice:** `crow dispatch` uses the default account, or the auto fallback when the default is blocked or
  past 95% of its 5h window. It refuses a plain `ask-first` account: get the owner's OK, then pass `--account <name>`.
  When `local/accounts.yaml` has `scopes`, dispatch picks by the project's registry scope instead: usable now, then
  the account's rank for that scope, then cdx priority, then room (same pick as `crow-accounts pick --scope <scope>`,
  which prints the deciding factor). An ask-first pick is never taken unasked. `--failover` is on every run.
  Two medium runs launched together can exhaust a session window in about 90 seconds. Stagger them if the window was recently used.
- **Deletions in auto mode**: the permission classifier blocks deleting files with real content, so the run stops and reports.
  If the prompt already expects deletions, name the exact files in it, or plan for the owner to approve them afterwards.
- **Odd infra failures inside a run** (e.g. Docker networking): check `uname -r` against `/usr/lib/modules`. A kernel upgraded without a reboot breaks module loading.
- **Long investigations**: the prompt must say "commit in small steps (on a branch if needed) as soon as each piece passes".
  A run that dies on the usage limit then loses nothing. Before redispatching, check worktrees (`git worktree list`) for
  uncommitted work, and pull the run's progress notes from its transcript
  (`jq -r 'select(.type=="assistant")|.message.content[]?|select(.type=="text")|.text' <transcript>`).
- **✗ failed**: read the stdout/stderr tail before retrying. Never retry blindly.

## After
- Read each report (`crow-runs report <id>`). Summarise the facts in prose: what shipped, and what's left.
  The report ends with a token line (context read, peak, output, calls, model). Mention it when a run read over 5M.
- Day totals: `bin/crow-cost-audit --days 1` (context read per model and per kind, hub and run start context).
- Put every decision the owner must make into AskUserQuestion: up to 4 per round, each self-contained (project + one line of context), recommended option first. Never leave decisions inside the summary text.
- Turn the answers into the next dispatch, update the open threads, and start queued work in the freed slots.

## Headless flags (every launch, `crow_lib.run_flags`)
- Every `cdx run` from crow (dispatch, review runs, retro, `crow` one-shots) takes its flags from one helper, per run kind (`crow_lib.RUN_KINDS`: task, mech, review, retro, oneshot):
  exact model id (`--model claude-opus-5-5`, never an alias), effort fixed at launch (`--power`), `--budget` USD (Claude only; cdx stops the run with `budget_exceeded`, exit 125) and `--timeout-seconds`.
  Every run also carries `--failover` (a usage-limit stop moves to another allowed account) and retro runs `--kind retro`. `cdx run` has no `--fallback-model` flag: set it per account with `cdx set <account> --fallback-model MODEL`.
  Override per kind with `CROW_<KIND>_BUDGET` and `CROW_<KIND>_TIMEOUT_MIN`, or for one run with `crow-runs dispatch ... --budget USD` (no default cap beyond the kind's budget). `crow-runs dispatch ... --dry-run` prints the full command and env.
- Env: `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1` (no phantom background results) and `ENABLE_CLAUDEAI_MCP_SERVERS=false` (no claude.ai connectors).
- Watchdog: the run's notifier kills a Claude run whose transcript (and subagent transcripts) has not moved for `CROW_STUCK_MIN` minutes (20) and marks it stuck (`<state>/runs-stuck.json`).
- Claude runs also carry `--extra-args "--strict-mcp-config --settings <state>/run-sandbox/<kind>.json"` (see Run sandbox): a repo's own `.mcp.json` servers do not load.
- Prompts pass data through files (`--prompt-file`, JSON on disk), never inline in Bash.

## Cap and labels (cdx 0.22)
- `crow dispatch` passes `--max-parallel 2` (`CROW_MAX_RUNS`) and `--label <project>/<label>` to `cdx run`; cdx refuses a third run with `too_many_runs`, race-free. `--force` passes 0 (no cap). The same-folder check stays in crow.
- cdx 0.23: `running_runs()` is `cdx runs --running --json` (uncapped, no 7-day window) and `crow-runs report` takes `final_message` from `cdx run-report`. `/proc` scanning stays for sessions started outside cdx. Not adopted yet: `cdx sessions --all` for profile and transcript dirs (crow-sessions, crow-relaunch, crow-usage read the profile layout directly; tests use temp profiles).

## Permission mode per account
A cdx account's launch mode is its own setting: `cdx configs --json` shows `permission`, `cdx set <account> --permission auto|full` changes it (full = bypassPermissions). It is not in the profile's settings.json. A session in auto mode blocks external writes (gh issue create, posts); check this setting first when a headless run or session gets "denied by the auto mode classifier". Applies to sessions launched after the change.

## Run sandbox: allowlists, env, MCP (deny by default)
Config lives in `bin/crow_lib.py` next to `RUN_KINDS`: `RUN_SANDBOX` (per kind), `RUN_DENY` (every kind), `CREDENTIAL_ENV`, `RUN_KEEP_ENV`, `MCP_SERVERS`.

| Kind | Tools | Bash prefixes (each also as `rtk <prefix>`) | MCP |
|---|---|---|---|
| review | Read, Grep, Glob, TodoWrite | git read (status, log, diff, show, branch, rev-parse, ls-files, blame, merge-base, remote -v), shell read (ls, cat, head, tail, wc, grep, rg, sort, uniq, cut, jq, pwd, echo, date, diff), git fetch, gh pr view/diff/checks, glab mr view/diff, logics-manager | none |
| task | review's file tools + Edit, Write, NotebookEdit | git read, shell read, git add/commit/switch/checkout/restore/stash/rebase/mv/rm, mkdir, touch, cp, mv, pytest, go test/build/vet, gofmt, make, npm test/run, logics-manager | none |
| retro | Read, Grep, Glob, Edit, Write, TodoWrite, Skill | shell read, bin/crow-log, bin/crow-note, bin/crow-state, bin/crow-digest, git status/diff/add/check-ignore | none |
| oneshot | Read, Grep, Glob, Edit, Write, TodoWrite, Skill | shell read, git read, git fetch, bin/crow-log, bin/crow-note, bin/crow-state (brief, daily, weekly skills add their own `allowed-tools`) | none |

`rtk` twins use the name the RTK hook rewrites to: `cat` and `head` become `rtk read`, `rg` becomes `rtk grep` on rtk 0.x and `rtk rg` on 1.x; both are allowed (`_RTK_ALIAS`). The hook never auto-allows a command (`rtk rewrite` exits 3, "ask", or 1, passthrough), so the allowlist decides.

Denied for every kind (a deny beats any allow or hook): git push, gh pr create/merge/comment, gh issue, gh api, glab mr create/merge/note, glab api, curl, wget, WebFetch.

- **Env (live):** `crow dispatch`, `crow-retro` and `crow oneshot` start cdx without any variable matching `CREDENTIAL_ENV` (tokens, secrets, passwords, API keys, `AWS_*`, `SSH_AUTH_SOCK`). cdx hands its own env to the run, so the run never sees them. gh and glab keep working through their config dirs (`GH_CONFIG_DIR`, `GLAB_CONFIG_DIR`), which are not env tokens. Probe 2026-11-07: injected `GH_TOKEN`, `AWS_SECRET_ACCESS_KEY` and a fake token were absent from the run's `env`.
- **Denials (live):** cdx returns `permission_denials` as a run warning; `crow runs` prints `denied <tool>: <input>` under the finished run and the deck adds `N denied` to its row.
- **Allowlists and strict MCP (live, cdx 0.26):** Claude runs start with `--permission default` and `--extra-args "--strict-mcp-config --settings <state>/run-sandbox/<kind>.json"`. `sandbox_args(kind)` rewrites that file (`permissions.allow` = the kind's list, `permissions.deny` = `RUN_DENY`) on every dispatch. The settings file exists because cdx caps `--extra-args` at 512 characters (`CDX_EXTRA_ARGS_MAX`); inline `--allowedTools` lists do not fit. Probes 2026-11-09 (haiku, scratch repo with its own `.mcp.json`): review read and ran git status, every write denied, no `mcp__` tool; task edited and committed, push, curl and `$VAR` expansion denied, no WebFetch; retro wrote files and ran the hub scripts, rm and commit denied.
- **Continued runs (review apply):** cdx refuses `--settings` with `--continue-run`, so an apply run keeps `--permission auto` with `--strict-mcp-config` and the credential-free env, but no allowlist. Upstream ask pending owner OK: allow `--settings` on `--continue-run` when it pins no model.

### Widen an allowlist
1. A run shows `denied Bash: <command>` in `crow runs`. Decide that the kind really needs it.
2. Add the prefix to `RUN_SANDBOX[kind]["bash"]` (or the tool to `"tools"`), never to every kind at once. Keep `RUN_DENY` items out.
3. An MCP server: add its `.mcp.json` entry to `MCP_SERVERS` and its name to the kind's `"mcp"`.
4. A credential a kind needs: add the variable name to `RUN_KEEP_ENV[kind]` only after the owner approves it.
5. Run `python3 -m pytest tests/test_crow_run_sandbox.py`, then rerun the probe for that kind from a scratch folder.

## Isolated runs: OS boundary (`--isolate`, item_100)
`crow dispatch <project> <label> --isolate --cwd <path>.wt/<name> --prompt-file F` starts `cdx run --isolate-workspace`. The run sits in bwrap: volatile home, read-only toolchains, the worktree read-write (read-only for kind review), read-only private git with no config, remotes or hooks, an env allowlist, and pasta + nftables egress (public internet, no private, CGNAT or loopback range).

- **Kinds:** `RUN_KINDS[kind]["isolate"]`: task and mech `rw`, review `ro` (dispatch forces `--permission review`). retro and oneshot read host data and are refused.
- **Refusals, never a fallback:** `--continue-run` of an unisolated run, no `--cwd` or a cwd that is not a linked worktree, a missing bwrap/pasta/nft/python3 (`sudo pacman -S passt nftables`), a Claude profile with no setup token.
- **Continuation:** since cdx 0.26.10 `--continue-run` of an isolated run resumes inside the parent's boundary (same worktree, network and permission). `crow-runs dispatch --continue-run` of an isolated parent isolates itself and pins the parent's account and permission; a review continuation stays read-only.
- **Host env:** cdx allowlists toolchains under `Path.home()`, so dispatch hands cdx the real HOME (and `CDX_HOME`). In a crow session HOME is the cdx profile home, which holds no claude binary ("Executable is outside the permitted toolchains"). The kind's settings file goes to `<worktree>/.crow-run/run-sandbox/` (`crow_lib.isolated_state_dir`, in `info/exclude`): the sandbox mounts only the worktree.
- **Account:** Claude needs a cdx setup token (`CLAUDE_CODE_OAUTH_TOKEN`). A full-login profile qualifies when it stores one at `<profile>/claude-home/credentials/default.json` (cdx 0.26.10+: only that token enters the sandbox); otherwise it is refused. Without `--account`, dispatch uses `<account>-runs` when cdx lists it. Create it once: `cdx add <account>-runs`, then `cdx login <account>-runs`.
- **Permissions:** cdx runs isolated Claude with `bypassPermissions`. The OS sandbox is the boundary; the item_077 allowlists do not apply. `--failover` is dropped (it could land on a full-login account); the limit requeue moves the run instead.
- **Commit:** the run cannot write git. When it ends, `crow-runs notify` commits the worktree diff from the host (`crow_lib.commit_run_diff`): `new|chg[SCOPE]: <label> (run <id8>)`, SCOPE from extensions or shebangs, checked by `crow-commit-msg-check` before the commit. Events `run.committed` / `run.commit_skipped`. Lives in bin/ until the core (item_119) owns mission commits.
- **Resume:** always a fresh isolated run from the brief plus the RESUME NOTE, also after a reset on the same account. Needs `--prompt-file`.
- **Probe:** `bin/crow-isolation-probe [--json]` runs a check script through cdx's own `sandbox_command` against a fixture worktree under `local/state/probe/`: credential files and env, commit and push, writes outside the tree, the host's LAN gateway, loopback and tailnet listeners (each checked open from the host first), public HTTPS, the host-side commit and the no-pasta refusal. Rerun it after a cdx upgrade.
- **Why pasta and not Claude Code `settings.sandbox`:** that sandbox (bwrap + a socat proxy with a domain list) is enforced by Claude itself, and a bypass run skips its domain list. pasta + nftables sit outside the agent and hold in any permission mode.
