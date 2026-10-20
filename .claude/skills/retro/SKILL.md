---
name: retro
description: Retrospective of one finished session. Finds where the user corrected, redirected or finished the work themselves, plus recurring tool friction. Applies the lessons to local-only files (runbooks, skills, memories), proposes anything tracked, and writes a short report. Runs automatically after each session via crow-retro; use it by hand with "/retro <transcript.jsonl>" or "retro the last session in <project>".
---

# Retro

Goal: the next session in that project does better without the user repeating themselves.
Be selective: one real lesson beats five generic ones. Don't invent problems.

## Input
`digest=<path> transcript=<path> cwd=<project dir> session=<id>`.
Given only a transcript, run `bin/crow-digest <transcript>` to build the digest yourself.
Read the digest. Open the raw transcript only to check one specific moment (`rg` on it, never read it whole).

## 1. Find the signals
Read every 👤 User message, and the 🤖 message just before it. Look for:
- **Correction**: "no", "not X but Y", a fix to wording, language or format ("une MR", "shorter commit").
- **Redirection**: the user asked for something the agent didn't offer, or changed the plan.
- **Stopped short**: the user had to ask for a step the agent should have done ("push it", "I thought you had done this").
- **Overreach**: the agent did something the user then undid or refused.
- **Repeated question**: the agent asked something already answered in memory, a skill or CLAUDE.md.
- **Friction**: ⚠️ tool errors that repeat or cost several calls (missing binaries, wrong paths, expired auth, sandbox HOME), and workarounds found.
- **Risk left behind**: state that will bite later (work in /tmp or a scratchpad, uncommitted changes, unresolved threads, a missing reminder).
- **Already learned**: the session already saved a lesson itself (skill, memory). Check the file really holds it, then count it as captured, not as a new finding.

Also check upstream: did a prompt written by the hub (a pasted handoff or a dispatch prompt) cause the problem? If so, the lesson goes to the hub.

## 2. Check what already exists
Before writing, look at what the next session would load:
- Project: `<cwd>/CLAUDE.md`, `<cwd>/.claude/skills/*/SKILL.md`, `<cwd>/.claude/skills/*/*.md`
- Project memory: `<claude config dir>/projects/<slug>/memory/` (the config dir is the parent of `projects/` in the transcript path) with `MEMORY.md` (slug = cwd with every `/` replaced by `-`)
- Hub: `runbooks/README.md`, `local/runbooks/README.md`, `.claude/skills/`
- Earlier retros: `rg -l "<keyword>" local/state/retros/*.md` to count recurrences.

A lesson that exists but was ignored needs a sharper wording or a better place (skill step > memory > runbook), not a duplicate.

## 3. Decide and apply
For each finding, choose one:

| Finding | Where it goes |
|---|---|
| How to do a task in that repo (steps, format, approval flow) | the repo's skill, if `git check-ignore -q <file>` says it's ignored. Otherwise **propose** |
| User preference or correction for that project | project memory (one file + `MEMORY.md` line, per the memory format) |
| Cross-project preference, or a hub prompt that caused the issue | hub: `local/context.md`, a hub skill, or a hub memory |
| Mechanical friction with a fix (path, binary, auth step) | the runbook where the task lives (`runbooks/` generic, `local/runbooks/` private), or a `bin/` script if it repeats ≥2 times |
| Same lesson in ≥2 retros | promote: a skill step, a checklist line, or a script. Mention it in the report |
| A review session (threads addressed, MR opened) | check the ledgers in `local/reviews/` were updated for every thread, and the `mr` pattern gate ran before opening; fill gaps yourself |
| One-off, already fixed, or no lesson | ignore (list it in the report in one line) |

**Apply directly** to: files git ignores in project repos, memories, and this hub's runbooks, skills and `local/` (left uncommitted for the user). Keep edits small and in the file's existing style. Never delete or rewrite content you didn't write, only add or sharpen.
**Propose** everything else (tracked files in project repos, CLAUDE.md, code): append to `local/state/retros/proposals.md` as `- [ ] YYYY-MM-DD <project> <file>: <change> (from <report>)`.

Never commit, push, post or message anyone. Never add AI attribution anywhere.

## 4. Report
Write `local/state/retros/YYYY-MM-DD-<project>-<session8>.md`, at most 30 lines:

```
# Retro: <project>, <date> (<session8>)
Task: <one line>
Outcome: <done / partly / abandoned, one line>

## Findings
| # | Signal | What happened | Lesson | Action |
|---|---|---|---|---|
| 1 | Stopped short | ... | ... | ✅ applied: <file> / 📝 proposed / ✔️ already captured / – ignored |

## Hub handoff
- <the prompt that started the session came from the hub (pasted handoff, dispatch, /retro)? did its wording cause any finding? "no hub prompt" / "ok" / "caused #n → <hub fix>">

## Risks left
- ... (only if any)
```

Then append `- HH:MM [retro] <project> <session8>: <n> applied, <n> proposed` to today's activity log (`local/state/activity/YYYY-MM-DD.md`).
Final message: the report path and one line per applied change.
