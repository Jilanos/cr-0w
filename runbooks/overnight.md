# Overnight runs

Unattended work while the owner is away. The hub session is the orchestrator; runs are tracked cdx runs.

- **Queue**: one prompt file per job in `local/state/night/` (`job-*.md`), each built from `preamble-personal.md` (push allowed) or `preamble-work.md` (local only). Order: runs stopped by a usage limit first, then roadmap items.
- **Guardrails** (in the preambles): personal repos get plain pushes after `bin/crow-prepush-check --check`; work repos never get a push, MR, ticket or cloud change; visual, product, outward or manual-verification items are paused and listed in the report, not decided.
- **Pre-push hook**: `bin/crow-prepush-check` refuses a push whose new commits match `local/prepush-deny.txt` (plus `local/prepush-deny.<repo>.txt`). Install with a symlink to `<repo>/.git/hooks/pre-push` (resolve the hooks dir with `git rev-parse --git-common-dir`, as an absolute path); keep any hook a repo already has.
- **Pacing**: max 3 parallel runs, staggered by about 3 minutes; stop new runs on the main account early enough that its window is fresh when the owner starts.
- **Limits**: a run that stops on a usage limit is redispatched with a RESUME NOTE on the other allowed account.
- **Waiters**: start `bin/crow-runs wait <id>` as its own background command. Never wrap it in a subshell, and never `pkill -f` a pattern that also matches the command running it.
- **Log and report**: append to `local/state/night/log.md` as things happen; compile the report from it, the run reports and `git log` before the owner arrives.
