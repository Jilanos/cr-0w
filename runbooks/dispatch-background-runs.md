# Dispatch background runs

Use when the user wants work done in project repos without opening a session there.

## Before dispatching
1. Check slots: `crow runs`. The default limit is 2 parallel runs (`CROW_MAX_RUNS`).
2. For each repo: `git config user.email` must match the scope identity in the registry,
   and `git status --short` must be checked. Uncommitted owner files get named in the prompt
   as "do not stage, commit, revert or stash".
3. Pick the work from open threads or the repo's Logics backlog (`logics/backlog/item_*`).

## Prompt template (write it to the scratchpad, then pass it with --prompt-file)
- One line of context: repo, scope, "identity is already correct".
- Protected files (if any).
- Numbered steps. Keep each step to a single commit, smallest first (e.g. a build fix before a feature).
- Use `/implement-task`, and create the Logics task first if it is missing.
- Quality gate: tests or build green before every commit. Commit on the branch the autonomy table allows; push when green.
- No AI attribution.
- "Stop and report if something needs a product decision", naming the likely one.
- End with: report commits, what is left, open questions.

## Dispatch
`crow dispatch <project> "<short label>" --prompt-file <file> [--power medium]`
This records the run in `<state>/runs.jsonl` so `crow runs` can show its label and commits.
When relaunching an interrupted run, add `--resumes <run_id>` so the old run is folded into the new one.

## Track
- **Get notified:** right after dispatching, start `bin/crow-runs wait <run_id>` as a *background* Bash command (one per run).
  It exits when the run finishes, and that exit wakes the session, so there's no need to ask the owner "tell me when it's done".
  The waiter only lives as long as the session. A run that finishes while no session is open shows up in `crow runs` / `crow watch`.
- `crow watch`: a live two-pane board (Go + Bubble Tea in `tools/crow-watch`, rebuilt on demand; reads `crow-runs json`). Tall terminals stack the panes. Every agent row shows its state, project, task, last activity, context, commits and current action; the right pane shows the selected agent's timeline, commits and final report.
- `crow runs`: the same view, printed once. `crow-runs json` gives the same data as JSON for widgets.
- States: ● working / ◌ quiet (a run with no transcript writes for 20s or more) / ◆ waiting (a session whose last message is text, i.e. it is waiting on the user) / ○ idle.
  Finished: ✓ done / ✗ failed / ⏸ usage limit / ? lost.
- Data sources: `<home>/.claude/sessions/<pid>.json` (current session id and busy/idle status; the id changes on /clear),
  then the transcript at `<home>/.claude/projects/<cwd with non-alphanumerics replaced by ->/<session>.jsonl`, and the ledger `<state>/runs.jsonl`.
- `cdx runs` lists finished runs only. A run's final report is the `result` field in its `stdout_path`.

## Recover
- **⏸ usage limit** (the stdout says "You've hit your session limit · resets HH:MM"): partial work stays
  in the tree. Wait for the reset, then redispatch (`--resumes <id>`) with a "RESUME NOTE" at the top of the prompt
  saying what is already committed or uncommitted and which steps not to redo.
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
- Put every decision the owner must make into AskUserQuestion: up to 4 per round, each self-contained (project + one line of context), recommended option first. Never leave decisions inside the summary text.
- Turn the answers into the next dispatch, update the open threads, and start queued work in the freed slots.
