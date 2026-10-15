---
name: brief
description: Morning briefing. One screen covering reviews waiting, sprint, open MRs/PRs, open threads, vault tasks, background runs, plus mail/calendar when connected. Ends with a suggested top 3. Use when the user says "brief", "briefing", "what's on today", or starts the day.
---

# Brief

Read-only except for one activity-log line. Target: **one screen, ≤ 40 lines**. Gather cheaply, in this order.

## Gather
1. **Open threads + status**: state dir `open-threads.md` and `status.md` (state dir = `vault.crow_dir` or `local/state/`).
2. **Forge activity**: `bin/crow-activity --since yesterday`. Don't explore repos further.
3. **Jira** (Atlassian MCP): `searchJiraIssuesUsingJql` with
   `assignee = currentUser() AND sprint in openSprints() AND statusCategory != Done ORDER BY priority DESC`
   Ask only for key, summary, status and priority fields.
4. **Vault tasks**: `rg -n "^\s*- \[ \]" "<vault>/00 Inbox" "<vault>/10 Work" "<vault>/20 Personal"` and keep only tasks with a due date (📅 YYYY-MM-DD or `due:`) on or before today. Also count the files in `00 Inbox`. Don't read notes further.
5. **Background runs**: `cdx runs --since today --json`. Keep only running or failed ones.
6. **Mail + calendar**: only if Microsoft 365 tools are available in this session. Today's meetings, and unread mail that needs a reply. If unavailable, print one line saying so and move on.

Skip any source that errors and note it in one line at the bottom.

## Output (exactly this shape, skip empty sections)
```
# Brief: <weekday DD/MM>

## 🔴 Needs you
- reviews waiting (always first: they unblock devs), approvals pending, failed runs, overdue tasks

## 📅 Today
- meetings (11:30 daily on weekdays; Friday 12:00 company weekly), deadlines

## 🏃 Sprint
- KEY status: summary   (mine, in priority order)

## 🧵 Open threads
- stale (>3 days) or due ones only

## 🏠 Side project
- one line: last activity + suggested next step for the most recently active personal project

## ✅ Suggested top 3
1. …  (follow the priority order in CLAUDE.md)
```

## After
Append `- HH:MM [hub] brief` to today's activity log. Nothing else.
