---
name: wrap
description: End-of-session wrap-up. Saves progress, decisions and open threads into the right project docs (logics, repo handoff docs, hub state) so the next session can start fresh. Use when the user says "wrap", "wrap up", "save and close", or is about to end a session.
---

# Wrap

Goal: after this runs, the user can close the session and a brand-new session loses nothing.
Be thorough but terse. Never invent progress; only record what actually happened in this session.

## 1. Locate yourself
- Hub home is `$CROW_HOME`. If unset, say so and stop.
- Load `$CROW_HOME/local/projects.yaml`. Match the current working directory to a project by longest path prefix.
- Mode: **hub** if cwd is `$CROW_HOME`, **project** if matched, **unregistered** otherwise (do project-mode steps with no registry info and recommend registering it).
- State dir: the vault's `vault.crow_dir` if set, otherwise `$CROW_HOME/local/state/`.

## 2. Inventory the session (in your head, then show it)
From the conversation, list:
- **Done**: what was completed (with commits, MRs, tickets, docs touched)
- **Decided**: decisions and their reasons
- **Open**: unfinished work, blockers, questions for the user, each with a concrete next step

## 3. Save. Project mode
Apply the first matching option, in this order:
1. **Repo has its own wrap/handoff convention** (check its CLAUDE.md for "wrap", "handoff", "resume"): follow it. It wins.
2. **Repo uses logics** (`logics/` dir): for each request/backlog/task touched, record progress with `logics-manager` (e.g. `flow` lifecycle moves, `sync append-note <doc> --section report|decision --text ...`). Create no new docs unless work started that has none; then suggest one instead.
3. **Otherwise**: update the repo's existing progress doc if there is one; else put everything in the hub open threads only.

Commit doc changes following the hub autonomy rules (`$CROW_HOME/CLAUDE.md`):
- personal: commit (and push if the branch tracks a remote)
- work: commit on the current branch only if it is not `main`; never push to main; otherwise leave the changes and report them
- check `git config user.email` matches the project's scope identity first; on mismatch, don't commit, report it
- no AI attribution in commit messages

## 4. Save. Always (hub state)
In the state dir:
- `activity/YYYY-MM-DD.md`: append `- HH:MM [project] one-line summary` per notable item done (non-git work matters most: meetings, decisions, R&D, ops)
- `open-threads.md`: add/update one line per open item: `- [ ] YYYY-MM-DD [project] item → next step`; tick (`[x]`) items finished this session; drop ticked items older than 7 days
- `decisions.md` (only for decisions with lasting impact): `## YYYY-MM-DD [project] title` + 1–3 lines of why
- `status.md` (hub mode, or if a project's status changed): one row per project: status, current focus, next step, blocked by

In hub mode, also commit `$CROW_HOME` changes (personal rules apply), and run `bin/crow-memory commit` so memory saved this session lands in `local/`.

## 5. Report
End with exactly this shape, then stop:

```
## Wrapped: <project or hub>
Saved:     <files/docs updated, commits made>
Not saved: <anything left uncommitted or skipped, and why — or "nothing">
Next:      <the single most useful next step>
Safe to close ✅   (or ⚠️ with the reason it isn't)
```
