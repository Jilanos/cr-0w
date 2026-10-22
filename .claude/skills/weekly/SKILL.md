---
name: weekly
description: Friday rollup. Turns the week's activity into a weekly summary (vault/state), rolls up the daily logs, and drafts the company weekly demo slides. Use when the user says "weekly", "rollup", "prep the slides", or on Friday morning.
context: fork
model: sonnet
effort: medium
background: false
allowed-tools: Bash(bin/crow-activity:*)
---

# Weekly

Runs in its own context (no conversation history): write the rollup file, then return a short summary of it and the slide outline. The offer to build the deck goes in that summary; the main session asks.

## Gather
1. Week = Monday to today (ISO week `YYYY-Www`).
2. `bin/crow-activity --since <monday> --scope all --limit 50`
3. Jira (MCP): `assignee = currentUser() AND (resolved >= "<monday>" OR updated >= "<monday>")` (key, summary, status).
4. All `<state>/activity/*.md` files for this week, and `decisions.md` entries this week.

## Rollup → `<state>/weekly/YYYY-Www.md`
```
# Week YYYY-Www
## Work
### Shipped        (merged MRs, resolved tickets)
### Reviews        (MRs reviewed: count + notable ones)
### Ops / prod
### R&D / roadmap / management
## Personal
- per project: 1–2 lines
## Decisions
## Carry-over     (open threads still open)
```
Then delete this week's `activity/*.md` files (git history keeps them) and commit `$CROW_HOME` if state lives there.

## Slides draft (French, company audience)
Draft a slide outline at the end of the rollup file under `## Slides`:
- 1 title slide (week, team), then 3–6 slides: **one achievement per slide** (title = outcome, 2–3 bullets of impact, ticket keys in small print), 1 "next week" slide.
- Audience is the whole company: business impact over technical detail.

Then offer to build the deck (Slides artifact, exportable to PPTX). Don't build it unprompted.
Never edit the company's shared deck. The OneDrive archive deck is pending until Microsoft 365 is connected.
