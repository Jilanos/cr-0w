# CR-0W (crow)

A chief-of-staff hub for people who work across several repos and several [cdx](https://github.com/AlexAgo83/cdx-manager) accounts.
It briefs you in the morning, drafts dailies and weeklies, tracks background Claude runs, watches token usage and limits,
and learns from review comments and from your corrections.

Everything outside `local/` is generic. Your own context (people, accounts, projects, memory, state) lives in `local/`,
which is ignored by this repo and meant to be its own private repo.

## Layout
| Path | What |
|---|---|
| `bin/crow` | launcher: hub session, one-shot briefs, project sessions, run dispatch, `crow watch` |
| `bin/crow-runs`, `bin/crow-usage`, `bin/crow-activity` | background runs, usage and cost across accounts, git/MR activity |
| `bin/crow-accounts`, `bin/crow-memory` | account policy, and memory stored once in `local/memory` and linked into allowed profiles |
| `bin/crow-retro`, `bin/crow-digest` | automatic retrospective after every session |
| `tools/crow-watch` | the terminal board (Go, Bubble Tea) |
| `integrations/` | optional desktop-shell widgets |
| `skills/`, `.claude/skills/` | review, MR, wrap, brief, daily, weekly, retro |
| `runbooks/` | short tested procedures |
| `logics/` | the project's own requests, backlog and tasks (Logics workflow) |

## Setup
1. Install cdx and Claude Code, then `git clone` this repo.
2. `mkdir local && git -C local init`, then add `local/context.md`, `local/projects.yaml` (project registry) and `local/accounts.yaml` (start from `docs/accounts.example.yaml`).
3. Put `bin/` on your PATH and run `crow`.

See `CLAUDE.md` for the rules the hub runs by and `runbooks/` for the procedures.
