<div align="center">

<img src="docs/img/logo.svg" alt="CR-0W, Central Repository Orchestration Workspace" width="560">

### Know what every agent is doing, what it costs, and what needs you. In one terminal.

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![Built on cdx](https://img.shields.io/badge/built%20on-cdx%20%2B%20Claude%20Code%20%2B%20Codex-d97757)
![Terminal first](https://img.shields.io/badge/terminal-first-2f334d)

<img src="docs/img/watch-agents.png" alt="crow watch, the live board" width="900">

<sub>`crow watch`, the live board. Sample data, rendered in a kitty theme.</sub>

</div>

---

CR-0W (crow for short) is a chief of staff for developers who run several repos and several Claude Code and Codex accounts.
It watches every session, run and limit, briefs you in the morning, moves work to another account when you hit a usage cap,
and turns each review comment and each correction into something the next session already knows.

You stay in charge. Crow drafts, flags and queues. You approve.

## A day with crow

- **Morning.** `crow brief` shows what needs you first: reviews waiting, MRs with open threads, runs that failed overnight, and a suggested top three.
- **Midday.** `crow watch` shows every agent at a glance. One is waiting for your reply, another is deep in a long task. You jump straight to the right window.
- **Afternoon.** An account hits its 5-hour limit. CR-0W shows when it resets and relaunches the session on another account you allowed.
- **Evening.** You hand a few jobs to background runs and leave. The next morning's brief tells you how the night ended.
- **Always.** Every review comment and every correction you make becomes a check or a note, so you say it once.

## Why you want it

| You have | Crow gives you |
|---|---|
| Five repos and three agents running | **One board** of what needs your reply, what is working, what failed |
| A usage cap at the worst moment | **A rescue** onto another account, in one command |
| A bill you only see at month end | **A live burn rate** and a cost per session, project and model |
| The same review comment every week | **A ledger** that checks every future diff for it |
| The same correction every session | **A memory** that keeps it |
| Rules you hope the agent follows | **Limits you set**, enforced by hooks |

## See it

### Agents: what needs me right now?
Waiting replies, failed runs and sessions cut off by a limit come first. Then what is working, what finished,
and the selected agent's latest prompt and context use. One key jumps to its terminal window.
Below, a timeline shows who worked when today.

<img src="docs/img/watch-timeline.png" alt="crow watch, details panel and the timeline of the day" width="900">

### Usage: where is the budget going?
Headroom per account with a forecast of when it runs out, spend for today, the week or the month,
what your savings tools saved, and cost per project and model. Earlier days fold away until you want them.

<img src="docs/img/watch-usage.png" alt="crow watch, usage tab" width="900">

The board uses your terminal's own colours, so it looks like it belongs there.

## What else it does

**Runs Claude and Codex together.** Pick the provider or account per launch, run one of each at once in separate worktrees,
see both on one board, and move an interrupted task from one to the other. See [`runbooks/claude-and-codex.md`](runbooks/claude-and-codex.md).

**Delegates.** Start a tracked background run in any repo and check its progress and commits at any time.
Before you leave for the night, an AFK routine asks every open question up front, queues the jobs and writes a report for the morning.

**Learns from reviews.** Reviewer comments on your MRs become patterns. Every future diff, yours or a colleague's, is checked against them before it goes out.

**Learns from you.** After each session a retro spots where you corrected the work and writes the lesson into a runbook, a skill or a memory.

**Keeps repos clean.** The brief reports uncommitted work, unpushed branches and forgotten worktrees, and tidies the safe ones.

**Fits your routines.** The hub is the orchestrator. Stand-ups, weekly rollups and the like are yours to shape.
[`examples/skills/`](examples/skills) has starting points, and [`runbooks/own-routines.md`](runbooks/own-routines.md) shows how.

## Your rules

CR-0W does not impose a workflow. You decide which accounts it may use, which projects it manages, what it may do alone
and what needs your OK, and hooks enforce it: no commit, push or MR in a registered repo without asking, no forbidden words in a commit.

The repo ships with the author's rules as an example set: branch-only commits on work repos, a push only after an explicit OK,
no merges, drafts before any mail. Edit them to match how you work. Everything you can configure, and where, is in [`docs/rules.md`](docs/rules.md).

## Get started

1. Install [cdx](https://github.com/AlexAgo83/cdx-manager) (0.21.4 or newer) and Claude Code, Codex, or both.
2. Clone this repo and put `bin/` on your PATH.
3. Create your private `local/` folder: `mkdir local && git -C local init`, then add `context.md`, `projects.yaml` and `accounts.yaml`
   (start from [`docs/accounts.example.yaml`](docs/accounts.example.yaml)).
4. Run `crow brief`, then `crow watch`. With Codex accounts, read [`runbooks/claude-and-codex.md`](runbooks/claude-and-codex.md)
   and the capability matrix in [`docs/cdx-compatibility.md`](docs/cdx-compatibility.md).

Everything outside `local/` is generic. Your people, accounts, projects, memory and state live in `local/`,
which is ignored by this repo and meant to be its own private repo.

<details>
<summary><b>What is in the box</b></summary>

| Path | What |
|---|---|
| `bin/crow` | launcher: hub session, one-shot briefs, project sessions, run dispatch, `crow watch` |
| `bin/crow-runs`, `bin/crow-usage`, `bin/crow-activity` | background runs, usage and cost across accounts, git/MR activity |
| `bin/crow_cdx.py`, `bin/crow_native.py`, `bin/crow_prices.py` | the cdx boundary and account policy, read-only native transcript readers, crow's price table |
| `bin/crow-accounts`, `bin/crow-memory` | account policy, and memory stored once in `local/memory` and linked into allowed profiles |
| `bin/crow-sessions`, `bin/crow-relaunch` | registry of sessions cut off by a usage limit, and the guarded relaunch |
| `bin/crow-retro`, `bin/crow-digest` | automatic retrospective after every session |
| `bin/crow-tidy`, `bin/crow-releases` | repo hygiene report with safe cleanup, release-track progress |
| `bin/ansi-shot` | render any terminal output to a PNG in your own theme (how the screenshots here are made) |
| `tools/crow-watch` | the terminal board (Go, Bubble Tea) |
| `integrations/` | optional desktop-shell widgets |
| `skills/`, `.claude/skills/` | brief, review, review-threads, mr, wrap, afk, retro |
| `examples/skills/` | starting points for your own routines (daily, weekly) |
| `runbooks/` | short tested procedures |
| `logics/` | the project's own requests, backlog and tasks (Logics workflow) |

</details>

<details>
<summary><b>Develop</b></summary>

- Tests for the helpers: `python3 -m pytest tests`
- Board tests: `cd tools/crow-watch && go test ./...`
- Regenerate the screenshots: [`docs/screenshots.md`](docs/screenshots.md)
- Procedures: [`runbooks/`](runbooks/README.md)

</details>

## License
MIT, see [`LICENSE`](LICENSE).
