---
name: daily
description: Draft your stand-up update from activity since the last one (commits, MRs, reviews, open threads). Use when the user says "daily" or "prep my daily".
context: fork
model: sonnet
effort: low
background: false
allowed-tools: Bash(bin/crow-activity:*)
---

# Daily (example)

Copy this folder to `local/hub-skills/daily/` and adapt it to your team's format, then link it:
`ln -s ../../local/hub-skills/daily .claude/skills/daily`. See `runbooks/own-routines.md`.

Runs in its own context and only drafts. Return the draft, never post it.

## Gather
1. Since = date in `<state>/last-daily` if present, otherwise the previous working day.
2. `bin/crow-activity --since <since> --scope work`
3. Open items in `<state>/open-threads.md`.
4. Optional: your tracker (Jira, Linear, GitHub issues) through its MCP server.

## Draft
A short flat list. One line per topic, a few words each. No ticket keys, no commit hashes.
```
shipped: <what, in plain words>
in review: <what>
in progress: <what>
next: <what>

blockers
- <who or what is blocking, and since when>
```
Blockers are the most useful part. Real ones only: waiting on someone outside the team, access, a decision,
broken CI, something stuck for 2+ days. Leave the section out when there are none.

## Post
Show the draft and wait for an explicit OK or edits. Posting (chat, wiki, tracker) is your routine's last step:
put the target and the exact steps here. Then write today's date to `<state>/last-daily`.
