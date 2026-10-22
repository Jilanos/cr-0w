# Rules: what you configure

CR-0W does not impose a workflow. You decide which accounts it may use, which projects it manages,
what it may do alone and what needs your OK. Hooks enforce it.

| You configure | Where |
|---|---|
| Accounts crow may use (`use`, `ask-first`, `never`) and how memory is shared | `local/accounts.yaml` (start from [`accounts.example.yaml`](accounts.example.yaml)) |
| Your projects: path, scope (work or personal), forge, identity, status | `local/projects.yaml` |
| Words and patterns that must never reach a commit or a push | `local/commit-msg-deny.txt`, `local/prepush-deny.txt` |
| What the hub may do alone: commit, push, merge, send mail, run infra, start runs | the autonomy table in [`CLAUDE.md`](../CLAUDE.md) |
| Your commit format | the commit-msg hook, `bin/crow-commit-msg-check` |
| Which routines you run (stand-up, weekly, ...) | `local/hub-skills/`, see [`runbooks/own-routines.md`](../runbooks/own-routines.md) |

## The example set

The repo ships with the author's rules. They are a starting point.

- Work repos: commits on branches only, never on main. A push only after an explicit OK each time. No merges.
- Personal repos: commit, push and merge freely.
- Mail and chat: draft first, send only after an OK.
- Infra: free to use on a claimed dev environment, approval every time on int and prod.
- Background runs: at most two at once, on allowed accounts only.
- Commit subjects: `type[SCOPE]: message`, for example `chg[PY/MD]: lock the migration runs`.
- No AI attribution in commits, MRs or tickets.

## What the guard does

`bin/crow-hub-guard` follows your project registry. In a registered repo it asks before a commit, push, rebase, merge or MR,
and before a worktree in `/tmp`. A hub session never runs a repo's own hooks, so deep work is handed to a session inside that repo
(`crow handoff`).

## Not configurable yet

The commit format and the autonomy table are written into a hook and into `CLAUDE.md`. Edit them to match your way of working.
A single `local/policy.yaml` that both read is planned.
