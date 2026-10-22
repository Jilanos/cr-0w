---
name: daily
description: Draft the user's update for the team daily (French) from activity since the last daily (commits, MRs, reviews, Jira, activity log), then post it to Confluence after explicit approval. Use when the user says "daily", "prep my daily", or before the 11:30 meeting.
context: fork
model: sonnet
effort: low
background: false
allowed-tools: Bash(bin/crow-activity:*)
---

# Daily

Runs in its own context (no conversation history) and only drafts: gather, write the draft, and return it with this last line: `POST: show this draft to the owner; after an explicit OK, follow "Post" in .claude/skills/daily/SKILL.md`. The main session handles the approval and the posting.

The daily is a short flat list under the user's name. One line per topic, a few words each. No ticket keys, no MR numbers, no explanations. The only section is **Blocages**, and it's the most important part.

## Gather (work scope only)
1. Since = date in `<state>/last-daily` if present, otherwise the previous working day.
2. `bin/crow-activity --since <since> --scope work`
3. Jira (MCP): `assignee = currentUser() AND updated >= "<since>" ORDER BY updated DESC`, plus the open sprint for what's next.
4. `<state>/activity/*.md` and work items in `<state>/open-threads.md` (non-code work: docs, admin, vendor requests, R&D).

## Draft (French, lowercase, terse)
```
mr - retire the reporting stack
mr - staff accounts by invitation only
merge - scoring rules
review MR mobile
en cours - photo capture
deploy en cours
tests perf à faire
vendor form - fill the documentation they asked for

**Blocages**
- waiting for the vendor's documentation
```
- `mr - <what>`: own MR open or in review. `merge - <what>`: merged. `review MR <whose/what>`: reviews done or pending.
- `en cours - <what>` for ongoing work, `<what> à faire` for next up. A bare topic is fine (`CGUs`).
- Describe the feature in plain words, not the fix details or review back-and-forth. One line per MR, never per commit or thread.
- Include non-code work from the activity log and open threads.
- **Blocages**: always check for them. Real blockers only: waiting on someone outside the team, vendor, access, decision, broken env/CI, something stuck for 2+ days. A routine pending review is not a blocker. Name who or what is blocking. Leave the section out entirely when there are none (don't write "Aucun").
- No AI mention.

Show only the list, then at most one line of questions if something is genuinely unclear. No commentary on period covered or choices made.

## Post (📝 approval required, main session only)
1. Show the draft and wait for an explicit OK or edits.
2. Confluence location: `local/context.md` → "Confluence daily page". If it's TBD, ask the user for the page, then record it there.
3. The page has one block per date, then one list per person. Edit **only** the user's list for today. Never touch other people's content. If the structure is unclear, give the text to paste instead.
4. Write today's date to `<state>/last-daily` and append `- HH:MM [work] daily posted` to the activity log.
