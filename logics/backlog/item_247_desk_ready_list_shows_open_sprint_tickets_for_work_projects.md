## item_247_desk_ready_list_shows_open_sprint_tickets_for_work_projects - Desk Ready list shows open sprint tickets for work projects
> From version: 1.0.0
> Schema version: 1.0
> Status: Ready
> Understanding: 90%
> Confidence: 85%
> Progress: 0%
> Complexity: Medium
> Theme: General
> Reminder: Update status/understanding/confidence/progress and linked request/task references when you edit this doc.

# AI Context
- Summary: For work projects, the Desk Ready to run list shows the owner's open sprint tickets from Jira instead of work Logics items.
- Keywords: desk, ready, sprint, jira, work scope
- Use when: building the work side of the Desk Ready list.
- Skip when: personal projects (their Logics Ready items stay as they are).

# Problem
- Owner 2026-11-18: in scope All the Ready list showed only work Logics items, and in Perso it showed only a few. On the work side, only sprint tickets should appear.
- Owner choice: Jira sprint tickets, not Logics items that name a CD key.
- Already done (79e2a53): the list keeps 5 rows, 2 per project, and follows the scope chip. crow-ready caps each project at 2.

# Scope
- In:
  - A script (bin/, generic) that fetches the owner's open sprint tickets (`sprint in openSprints() AND assignee = currentUser() AND statusCategory != Done`). It reads the token the way local/state/sprint/fetch.py does (secret-tool, crow-jira) and caches key, summary, status and repo hint. Refresh hourly, cache read by the core.
  - crow-ready (or a new core section) drops work-scope Logics items and adds the sprint tickets as rows (project = the work repo the ticket maps to, else the work hub project).
  - Nest ReadyLine for a ticket: key + summary, ▶ starts a session on the ticket (prompt names the key), + queues. Same 5 rows / 2 per project caps.
- Out:
  - Writing to Jira. Changing personal-project rows.

# Acceptance criteria
- AC1: Under scope Work the Ready list shows only open sprint tickets of the owner, at most 5, 2 per project.
- AC2: Under scope Perso it shows personal Logics items and parked sessions only; under All both mixed, capped.
- AC3: Jira down or no token: the work rows go empty with the panel note; the rest stays (feed per-section rule).
- AC4: Tests: script parse + cap (pytest), readyRows with tickets (vitest).

# AC Traceability
- request-AC1 -> This backlog slice. Proof: bounded delivery slice.
- request-AC2 -> This backlog slice. Proof: promotable backlog item.
- request-AC3 -> This backlog slice. Proof: delivery chain includes a task-ready backlog item.

# Decision framing
- Product framing: Not needed
- Architecture framing: Not needed

# Links
- Product brief(s): (none yet)
- Architecture decision(s): (none yet)
- Request: (to be linked)
- Primary task(s): (none yet)

# Priority
- Priority: Medium
- Rationale: Owner feedback on the live app, 2026-11-18.

# Notes
- Generated locally by logics-manager.

# Executions
| When | Runner | Run id | Title | State | PR | Notes |
| --- | --- | --- | --- | --- | --- | --- |

