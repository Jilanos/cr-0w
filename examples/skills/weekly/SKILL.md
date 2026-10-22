---
name: weekly
description: Weekly rollup. Turns the week's activity into a summary file and a short outline for a demo or report. Use when the user says "weekly" or "rollup".
context: fork
model: sonnet
effort: medium
background: false
allowed-tools: Bash(bin/crow-activity:*)
---

# Weekly (example)

Copy this folder to `local/hub-skills/weekly/` and adapt it, then link it:
`ln -s ../../local/hub-skills/weekly .claude/skills/weekly`. See `runbooks/own-routines.md`.

Runs in its own context. Write the rollup file, then return a short summary and the outline.

## Gather
1. Week = Monday to today (ISO week `YYYY-Www`).
2. `bin/crow-activity --since <monday> --scope all --limit 50`
3. All `<state>/activity/*.md` files for this week, and `decisions.md` entries from this week.
4. Optional: your tracker through its MCP server.

## Rollup to `<state>/weekly/YYYY-Www.md`
```
# Week YYYY-Www
## Shipped
## Reviews
## Decisions
## Carry-over     (threads still open)
## Outline        (one achievement per slide: outcome as title, 2-3 bullets of impact)
```
Then delete this week's `activity/*.md` files (git history keeps them).
