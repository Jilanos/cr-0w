---
name: daily
description: Draft the user's update for the team daily (French) from activity since the last daily (commits, MRs, reviews, Jira, activity log), then post it to Confluence after explicit approval. Use when the user says "daily", "prep my daily", or before the 11:30 meeting.
---

# Daily

## Gather (work scope only)
1. Since = date in `<state>/last-daily` if present, otherwise `yesterday` (Monday looks back to Friday).
2. `bin/crow-activity --since <since> --scope work`
3. Jira (MCP): `assignee = currentUser() AND updated >= "<since>" ORDER BY updated DESC` (key, summary, status), plus the open-sprint query from `brief` for "today".
4. `<state>/activity/*.md` entries since `<since>` tagged with work projects (meetings, decisions, ops, R&D).
5. Work items in `<state>/open-threads.md` (blockers).

## Draft (French, concise, ticket keys inline)
```
**Hier**
**Aujourd'hui**
- …
**Blocages**
- … (or "Aucun")
```
Rules: group repeated actions (one line per MR/ticket, not per comment). Name outcomes, not process. No AI mention.

## Post (📝 approval required)
1. Show the draft and wait for an explicit OK or edits.
2. Confluence location: `local/context.md` → "Confluence daily page". If it's TBD, ask the user for the page, then record it there.
3. Read the page and its format first. Edit **only** the user's own section or entry for today, matching the existing format. Never touch other people's content. If the structure is unclear, give the text to paste instead.
4. Write today's date to `<state>/last-daily` and append `- HH:MM [work] daily posted` to the activity log.
