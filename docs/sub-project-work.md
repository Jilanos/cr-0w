# Sub-project work from the hub

The hub is a Claude Code session whose working directory is the hub repo. Work on a
registered project done from there ran without that repo's tools. This doc records what
went wrong, what Claude Code offers, and why crow hands work off instead of loading repos.

## What went wrong (one week of retros)
| Missing in the hub session | Cost |
|---|---|
| The repo's MR review skill and the MR template rule | MR opened without template, unvalidated title, no assignee or reviewer; redone by the owner |
| The push approval rule of a work repo | Rebased and pushed without approval, twice, although a memory and a hub rule said so |
| The repo's own approach and claim scripts | Stacked a fix on the owner's commit; proposed a second CI account the repo already avoided; booked shared dev envs |
| The repo's pre-edit gates (syntax gate, lint, bash guard hooks) | Hub edited another repo's UI files with no gate; the root cause stayed in a hub runbook, never fixed in the repo |
| A place to work | Scratch worktrees in /tmp, lost on reboot and invisible to the repo |
| An end state in the hand-off prompt | Repo session stopped after the commit; the owner expected push, replies and resolve |

Two patterns: hub rules were invisible to repo sessions (fixed by the hand-off note), and
repo rules were invisible to the hub (fixed by handing off). Rules alone did not hold:
the second unapproved push happened with a memory and a hub rule against it already in place.

## What Claude Code offers (v2.1.306)
- `--add-dir` / `/add-dir` loads the added repo's `.claude/skills`, `commands` and `agents`.
- Its `CLAUDE.md` loads only with `CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD=1`; `AGENTS.md` never.
- Its `.claude/settings.json` hooks and permission rules never load: settings come from the
  session's working directory only. Git hooks still run, since git runs them.
- `/add-dir` is a user command; the model cannot run it mid-session.

So option (b), loading a repo into the hub, can bring skills and instructions but never the
hooks and denies that caught most of the cases above. Loading every repo at hub start would
also put every repo's skills in every hub session (name clashes such as two `wrap` skills).

## Choice
Both, with (a) as the default and a guard to make it stick:
- `crow handoff <project> --task --end-state`: repo session in a new window, first prompt
  built from the registry. It names the repo's skills and instructions, carries the hub
  rules the repo cannot see (owner preferences, `mr` skill, review ledgers, commit format,
  worktree place, work-repo push rule) and requires an end state. A copy is kept under
  `<state>/handoffs/`.
- `crow work <project>`: index of the repo's instructions, skills, commands and agents to
  read on demand, plus what the hub cannot run (hooks, denies). For lookups and small fixes.
- `bin/crow-hub-guard` (hub `.claude/settings.json`): a note the first time a prompt names a
  repo with a forge, and an `ask` before commit, push, rebase, merge or MR creation in such a
  repo, and before a worktree under /tmp. `CROW_HUB_GUARD=off` disables it.

Project aliases (`aliases:` in the registry) let the note fire on the name people use.
