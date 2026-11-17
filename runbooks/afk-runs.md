# AFK runs

Prepare a run with the `afk` skill (`/afk`), about an hour before the owner leaves: a night, an afternoon, any stretch of hours away.

Unattended work while the owner is away. The hub session is the orchestrator; runs are tracked cdx runs. The orchestrator can die at any moment (usage limit, battery, crash): everything the owner needs in the morning must already be on disk.

## Before the owner leaves
- Run `bin/crow-afk-preflight <repo paths of this run's jobs>` and fix every FAIL. Read the WARNs to the owner: on battery, packages upgraded since boot (they go live at the next login: reboot or relogin *before* the night, not after), docker broken, gh/glab logged out.
- Start the sleep inhibitor it prints, as a background command.
- On WSL, `systemd-inhibit` is refused (no interactive auth) and only blocks Linux anyway. Block Windows sleep with `bin/crow-keep-awake [seconds]` as a background command, and check its output says `awake for N s` (an inline `powershell.exe -Command` with `\"` quotes fails silently: the 2026-11-15 night slept from 01:05).
- Jobs that need mail: before the night, run one cheap mail call (newest 3 messages). If it fails, say so: drafts will only be texts on disk.
- Ask every open question *now* (AskUserQuestion), so jobs don't pause on things the owner could have answered in 10 seconds.
- Repos with their own push rule in `.claude/` (the preflight flags them): read it, then either promise pushes in the job or list the repo as "owner pushes". A preamble must never authorise what the repo's hook forbids.

## Queue
- One prompt file per job in `local/state/afk/` (`job-*.md`), each built from `preamble-personal.md` (push allowed) or `preamble-work.md` (local only). `queue.md` is the only source of order; reminders and crons only say "read queue.md".
- Order: runs stopped by a usage limit first, then roadmap items. Fill the whole window: at least 2 jobs per active project plus one fallback job per project ("next eligible roadmap item"). An empty queue with accounts below their floor is wasted capacity.
- Jobs needing something the machine doesn't have (a database, a GUI, cloud access) go on a "needs env" list, not in the queue.
- Every job works in its own worktree `<repo>.wt/<name>` (`git worktree add`), never in the main checkout: main checkouts may be symlinked into the owner's live desktop. A job never switches the main checkout's branch.

## Guardrails (in the preambles)
- Keep tracked files generic: a lesson learned in a work project goes to `local/runbooks/`, with `<project>` in generic text. `bin/crow-precommit-check` (install as the pre-commit hook) refuses staged lines matching the deny list, so a private name never enters history.
- Personal repos: plain pushes after `bin/crow-prepush-check --check`. Work repos: never a push, MR, ticket or cloud change.
- A new worktree branch has no upstream: use `git push -u origin <branch>` and confirm with `git log origin/<branch>` (a bare `git push` prints nothing and pushes nothing).
- Visual, product, outward or manual-verification items are paused and written as a decision (see Report), not decided.
- Never run a repo-wide formatter or `--fix`; format only the files the job changed.
- The commit identity to expect is written in the job (from `local/projects.yaml`); if it differs, stop rather than ask.
- `export HOME=/home/<user>` for gh, glab and aws, in every preamble.
- Renders and screenshots go to `local/state/afk/shots/<run-id>/`, never `/tmp` (wiped at reboot).
- Commit-msg hook: `bin/crow-commit-msg-check` (owner format `type[SCOPE]: message`, no AI attribution), symlinked as `<hooks dir>/commit-msg` in every repo a job touches; the preflight warns when it is missing.
- Pre-push hook: `bin/crow-prepush-check` refuses a push whose new commits match `local/prepush-deny.txt` (plus `local/prepush-deny.<repo>.txt`). Install with a symlink to `<repo>/.git/hooks/pre-push` (resolve the hooks dir with `git rev-parse --git-common-dir`, as an absolute path); keep any hook a repo already has.

## Pacing and accounts
- Read `cdx status --refresh` before the first launch and before every floor decision: plain `cdx status` can show cached numbers from before a 5h reset. Max 3 parallel runs, staggered by about 3 minutes.
- If the main account is blocked, start at most 2 runs on a shared account, and a third only when its 5-hour window shows 60% or more left.
- Stop new runs on the main account early enough that its window is fresh when the owner starts. Floors are written as numbers in `queue.md`, never improvised.
- A run that stops on a usage limit follows its context (`dispatch --context afk|day`, default day). afk waits for the reset on the same account and continues. day restarts cold with a RESUME NOTE on the next allowed account when the reset is over an hour away, else waits. Each choice is logged as a `run.limit_policy` event with the reset time.
- Waiters: `bin/crow-runs wait <id>` as its own background command (`run_in_background`). Never wrap it in a subshell, never `pkill -f` a pattern that also matches the command running it.

## Report
- Append to `local/state/afk/log.md` as things happen, with the clock time (`date +%H:%M`); report times are copied from it, never estimated.
- Each run's final message is saved to `local/state/afk/reports/<id>.md`.
- At the first launch, write `local/state/afk/summary-<morning date>.json` with `start`, `orchestrator_session` and `usage` (`{account: {"week": [start %, null]}}` from `cdx status --refresh`); fill the end value and `end` when the queue finishes. The usage samples file only keeps a few hours.
- After **every** finished run, add it to its project in the summary: a point in `points[]` (title, `where` it landed, `runs` ids, and 2-3 sentences: what was wrong or missing before, what changed, the result and what is unverified) and any decision it left in `decisions[]` (question, context a reader can act on without the report, options with a note each, `recommend`; for a visual choice `rows` (scenarios) and per option the image path for each row, same framing). Keep the project's `tldr`, `progress`, `todo` (checks only the owner can do) and `decided` current, then rebuild with `bin/crow-afk-page --date <morning date>`. Times, accounts, models, tokens and cost come from `cdx runs` and `crow-usage` by themselves.
- Runs end with the preamble's headings plus a `Card:` block (one-line goal, before, after, screenshots, decisions) that the page is built from.

## Return (hub session)
- Before saying anything about the run, read `local/state/afk/log.md` and check that the report exists. If the orchestrator died, the report is compiled from `reports/*.md` and `git log`, and the owner is told which jobs never finished.
- Open the page, then build a comparison page for every visual decision (`bin/crow-compare <spec.json>`: options as columns, scenarios as rows, flip viewer with zoom) and open it before asking. Then ask the pending decisions with AskUserQuestion.
- Runs that leave a visual decision list, per option, the exact image paths for each scenario (same framing across options), so the spec can be written without searching.

## scrub-env for unattended runs (tested 2026-10-27 cdx 0.22, retested 2026-10-29 cdx 0.24.3)
`cdx set <account> --scrub-env on` makes a headless `cdx run` ask approval for every Bash call and MCP tool, which nobody can give: all seven probe checks failed with it on and all passed with it off (same account, same folder).
Since cdx 0.24.2 it forces the default permission mode: allow tools with `cdx set A --extra-args '--allowedTools Bash'` (add MCP tools the job needs). It also needs `socat` installed (Claude sandbox). With both, the Bash probe passes 3/3; MCP tools untested. Left off by default. With it off the run env holds only 3 credential-like variables; gh and glab use their keyrings.
Probe: `cdx set A --scrub-env on`, `cdx run A --cwd <scratch dir> --prompt-file <probe> --permission auto`, then `cdx unset A --scrub-env`.
Headless probes started in the hub folder are blocked by the hub guard whatever the setting: run them from a scratch folder.
Crow's own sandbox for runs (credential-free env, per-kind allowlists, denials) is in dispatch-background-runs.md "Run sandbox".
