---
name: eod
description: End-of-day check-in. Asks up to three questions about the topics that are live right now and files each answer in the vault daily note or the project note. Use when the user says "eod", "end of day", "fin de journée", or just before /wrap.
effort: low
allowed-tools: Bash(bin/crow-notes:*) Bash(bin/crow-note:*) Bash(bin/crow-activity:*)
---

# End of day

Main session (AskUserQuestion needs it). Goal: capture what the owner worked on that no tool recorded. Cheap: scripts pick the topics, the model only asks and files.

## 1. Pick topics (no exploration)
- `bin/crow-notes --since 3d`: tags and topics already noted (the ones with a trace are lower priority).
- `Open Threads.md` (`bin/crow-state path threads`; sections Me, Crow, Waiting; see `runbooks/open-threads.md`), vault `hot.md`, Jira In Progress / Merge Review (if connected), `bin/crow-activity --since today`.
- Keep the live topics (at most 3) with the least trace today: no note, no commit, no thread update.

## 2. Ask
One `AskUserQuestion` call, one question per topic, each self-contained: the topic, what is known, 3 options (e.g. progressed / blocked / not touched today) plus the free "Other". Never more than 3 questions. Nothing live, nothing asked.

## 3. File (one answer, one place)
| Answer is about | Goes to |
|---|---|
| Something done or decided | `bin/crow-note "<text> #tag" --section eod` |
| A meeting or call | `bin/crow-note "<text>" --section meetings` |
| A blocker | `bin/crow-note "<text> #blocage" --section eod` |
| A project fact | the project note under `10 Work`, appended as one bullet |
| A new open item | `Open Threads.md`, one line `- [ ] YYYY-MM-DD [project] text → next step` under `## Me`, `## Crow` or `## Waiting` (Waiting starts with the person) |
| An open item now finished | remove its line from `Open Threads.md` and run `bin/crow-log "[project] done: text"` |
| "Not touched" / skipped | nothing |

Rules: never write a status note into `Open Threads.md`; write in the language of the note (French in the vault), short and declarative. Never edit outside the agreed sections, never rewrite existing lines, never touch another person's content. Tags: #team #naval #blocage #decision #demo (extend only when asked).

## 4. Report
Print what was written and where, one line each. Then suggest `/wrap`.
