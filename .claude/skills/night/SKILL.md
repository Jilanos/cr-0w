---
name: night
description: Prepare tonight's overnight runs about an hour before the owner stops. Checks the machine, gathers what could run, asks the owner every open question up front, writes the job prompts and queue, sets up worktrees and hooks, then waits for "go" to start orchestrating. Use when the user says "night", "prep the night", "prepare tonight", or "overnight".
---

# Night prep

Goal: a queue that fills the whole night with nothing paused on a question the owner could have answered tonight. Follow `runbooks/overnight.md` (rules, pacing, report) and use these steps to build the night. Night state lives in `local/state/night/`.

## 1. Archive the last night
Move last night's `job-*.md`, `queue.md`, `log.md`, `reports/`, `shots/` and `report-*.html` into `local/state/night/archive/<date of that night>/`. Keep `preamble-*.md` and any `decisions-*.md` not yet applied.

## 2. Machine check
Run `bin/crow-night-preflight <path of every repo that might get a job>` and act on it:
- FAIL: fix what is yours to fix (install a missing hook, prune a stale worktree). Tell the owner what is theirs (plug in, reboot or relogin for packages upgraded since boot, scrub a denied pattern from pushed history).
- WARN: say it in one line each. Start the sleep inhibitor only once the owner says go.

## 3. Gather candidates (scripts, not exploration)
- Runs stopped by a usage limit: `bin/crow-sessions` and `bin/crow-runs list`.
- Pending owner decisions already taken: `local/state/night/decisions-*.md` (they unblock items).
- Each registered project in `local/projects.yaml` (personal first; work repos only as local-only jobs): `logics-manager status` in the repo for the next eligible items, and the "Next eligible" line of its last night report.
- Open threads tagged with a project in the state dir's `open-threads.md`.
For each candidate, note what it needs: a database, a GUI, cloud access, a visual choice, an owner decision. Anything the machine can't provide goes on the "needs env" list.

## 4. Ask the owner, once, before writing anything
Use AskUserQuestion (self-contained questions with context and a recommendation, at most 4 per call):
1. Which jobs go in (multiSelect, grouped by project, one line each on what it would deliver by morning).
2. Every decision a chosen job would otherwise pause on: visual choices with mockups when they exist, product choices, push/merge permissions in repos with their own push rule.
3. The morning time and which accounts may run (show `cdx status`).
Record the answers in `local/state/night/decisions-<today>.md`.

## 5. Write the jobs
- One `job-<project>-<topic>.md` per job: the matching preamble (`preamble-personal.md` pushes, `preamble-work.md` local only) followed by the repo path, the worktree to create (`<repo>.wt/<topic>`), the expected commit identity from `local/projects.yaml`, the owner's decisions that apply, files to leave alone ("Protected"), the task, and when to stop.
- Add one fallback job per active project: "next eligible roadmap item, same rules".
- `queue.md`: priority order, the account for each job, the numeric floors (5-hour and weekly) under which no new run starts on each account, and the "needs env" list. The queue is the only source of order.
- Create each worktree now and check its hooks (`commit-msg`, `pre-push`) resolve.

## 6. Hand over
Show the owner the queue as a short table (job, account, expected result, stops when) plus the WARNs left. On "go":
- start the sleep inhibitor printed by the preflight;
- append the start line to `log.md`;
- orchestrate per `runbooks/overnight.md`, rebuilding the morning page after every finished run.
