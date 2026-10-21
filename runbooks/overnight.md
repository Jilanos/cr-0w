# Overnight runs

Unattended work while the owner is away. The hub session is the orchestrator; runs are tracked cdx runs. The orchestrator can die at any moment (usage limit, battery, crash): everything the owner needs in the morning must already be on disk.

## Before the owner leaves
- Run `bin/crow-night-preflight <repo paths of tonight's jobs>` and fix every FAIL. Read the WARNs to the owner: on battery, packages upgraded since boot (they go live at the next login: reboot or relogin *before* the night, not after), docker broken, gh/glab logged out.
- Start the sleep inhibitor it prints, as a background command.
- Ask every open question *now* (AskUserQuestion), so jobs don't pause on things the owner could have answered in 10 seconds.
- Repos with their own push rule in `.claude/` (the preflight flags them): read it, then either promise pushes in the job or list the repo as "owner pushes". A preamble must never authorise what the repo's hook forbids.

## Queue
- One prompt file per job in `local/state/night/` (`job-*.md`), each built from `preamble-personal.md` (push allowed) or `preamble-work.md` (local only). `queue.md` is the only source of order; reminders and crons only say "read queue.md".
- Order: runs stopped by a usage limit first, then roadmap items. Fill the whole night: at least 2 jobs per active project plus one fallback job per project ("next eligible roadmap item"). An empty queue with accounts below their floor is wasted capacity.
- Jobs needing something the machine doesn't have (a database, a GUI, cloud access) go on a "needs env" list, not in the queue.
- Every job works in its own worktree `<repo>.wt/<name>` (`git worktree add`), never in the main checkout: main checkouts may be symlinked into the owner's live desktop. A job never switches the main checkout's branch.

## Guardrails (in the preambles)
- Personal repos: plain pushes after `bin/crow-prepush-check --check`. Work repos: never a push, MR, ticket or cloud change.
- Visual, product, outward or manual-verification items are paused and written as a decision (see Report), not decided.
- Never run a repo-wide formatter or `--fix`; format only the files the job changed.
- The commit identity to expect is written in the job (from `local/projects.yaml`); if it differs, stop rather than ask.
- `export HOME=/home/<user>` for gh, glab and aws, in every preamble.
- Renders and screenshots go to `local/state/night/shots/<run-id>/`, never `/tmp` (wiped at reboot).
- Commit-msg hook: `bin/crow-commit-msg-check` (owner format `type[SCOPE]: message`, no AI attribution), symlinked as `<hooks dir>/commit-msg` in every repo a job touches; the preflight warns when it is missing.
- Pre-push hook: `bin/crow-prepush-check` refuses a push whose new commits match `local/prepush-deny.txt` (plus `local/prepush-deny.<repo>.txt`). Install with a symlink to `<repo>/.git/hooks/pre-push` (resolve the hooks dir with `git rev-parse --git-common-dir`, as an absolute path); keep any hook a repo already has.

## Pacing and accounts
- Read `cdx status` before the first launch. Max 3 parallel runs, staggered by about 3 minutes.
- If the main account is blocked, start at most 2 runs on a shared account, and a third only when its 5-hour window shows 60% or more left.
- Stop new runs on the main account early enough that its window is fresh when the owner starts. Floors are written as numbers in `queue.md`, never improvised.
- A run that stops on a usage limit is redispatched with a RESUME NOTE on the other allowed account.
- Waiters: `bin/crow-runs wait <id>` as its own background command (`run_in_background`). Never wrap it in a subshell, never `pkill -f` a pattern that also matches the command running it.

## Report
- Append to `local/state/night/log.md` as things happen, with the clock time (`date +%H:%M`); report times are copied from it, never estimated.
- Each run's final message is saved to `local/state/night/reports/<id>.md`.
- After **every** finished run, regenerate the morning page (`local/state/night/report-<date>.html`): one card per project with what it was about, before → after in plain words, roadmap progress, screenshots from `shots/`, commits behind a fold, and a "needs you" box. Each decision in that box is self-contained: context, options, a recommendation, so the morning session can ask it with AskUserQuestion as is.
- Runs end with the preamble's headings plus a `Card:` block (one-line goal, before, after, screenshots, decisions) that the page is built from.

## Morning (hub session)
- Before saying anything about the night, read `local/state/night/log.md` and check that the report exists. If the orchestrator died, the report is compiled from `reports/*.md` and `git log`, and the owner is told which jobs never finished.
- Publish the page, then ask the pending decisions with AskUserQuestion.
