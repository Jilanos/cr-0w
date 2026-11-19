---
name: brief
description: Morning briefing. One screen covering reviews waiting, sprint, open MRs/PRs, open threads, vault tasks, background runs, plus mail/calendar when connected. Ends with a suggested top 3. Use when the user says "brief", "briefing", "what's on today", or starts the day.
context: fork
model: sonnet
effort: low
background: false
allowed-tools: Bash(bin/crow-gather:*) Bash(bin/crow-mrs:*) Bash(git fetch:*)
---

# Brief

Runs in its own context (no conversation history): everything needed is gathered below. Return only the brief.

## Pre-gathered
Everything the brief needs from files and scripts, as one JSON (`bin/crow-gather brief`; keys below refer to it). Don't read state files or rerun these scripts.
!`"${CLAUDE_PROJECT_DIR}/bin/crow-gather" brief --json 2>&1 || true`

Keys: `today_priorities` (null unless dated today), `afk` (summary of a run since yesterday, log tail, report path), `open_threads` (`Me`, `Waiting` as "<age>d [tag] text", STALE past 14 days; other sections only counted), `pending` (`runbooks/pending-items.md`: per source items, waiting and settled rows to purge; `overdue` as "<n>d late [source/kind] who: text"), `status`, `activity` (crow-activity since yesterday), `notes` (vault notes, 3 days), `releases`, `tidy` (safe cleanups already applied, `runbooks/repo-tidy.md`), `fleet` (Logics next moves, reviews left out), `long_sessions` (past 120k, `runbooks/long-sessions.md`), `accounts` (headroom), `usage_split` (token cost split, 14 days; baseline in `local/state/research/token-baseline-2026-11.md`), `runs` (today's runs that did not succeed), `vault_tasks` (due on or before today, inbox count), `checks` (crow-checks rows: sprint rituals, 1:1s, old mail, rituals, overdue notes), `retros` (reports since the last brief, pending proposals, worker status), `toolwatch` (latest tool-update note while it has open proposals, else null), `targets.activity_log`. A source that failed is `{"error": ...}`; `_cut_to_fit` lists fields shortened to stay in budget.

Read-only except for one activity-log line. Target: **one screen, ≤ 40 lines**. Gather cheaply, in this order.

## Gather
-1. **Refresh before stating state**: run `git fetch -q` in the hub and every repo you cite, and re-read MR state live (`bin/crow-mrs`, glab with the real HOME) before saying a branch is behind, an MR is open, or a choice is still pending. State files and the activity log lag the same morning; the owner has had to say "check again, some of it is outdated".
0. **Last AFK run first**: if `afk.summary` is set, start with how the run ended (its notes and project lines). Never state how the night ended without it; if `afk.log_tail` shows jobs since yesterday evening and `afk.summary` is null, say which jobs never finished and offer to compile the report (see `runbooks/afk-runs.md`, Morning).
1. **Open threads + status**: `open_threads` and `status` (format: `runbooks/open-threads.md`). Show `Me` first, then `Waiting` with each line's age. Then every `pending.overdue` line (a follow-up past its due date, any pending source). List STALE lines and ask keep, re-date or drop (drop removes the line from the state dir's `open-threads.md`). `## Crow` is left out on purpose. Never write a status note into the file.
2. **Forge activity**: `activity`. Don't explore repos further. "My open MRs" lists every open MR with its unresolved thread count.
   - "My GitLab/GitHub actions" are the owner's OWN outgoing actions (comments he left on others' MRs, MRs he accepted). Never put them in "Needs you" and never write "comments from you" as a to-do: a comment he left on a colleague's MR is waiting on the colleague. Only "Awaiting my review", unresolved threads on "My open MRs", approvals pending and failed pipelines on his MRs belong in "Needs you". If all three are "none", write "Nothing waiting on you (no review, no open MR)".
   - Comments on MRs may be SonarCloud's quality-gate note posted through the owner's token (crow-activity filters them). Never read an action as a review he gave unless it is clearly his.
   - Use the actions only as context ("reviewed !210"), and only when it changes the day (e.g. a review he gave that is still unanswered after 2+ days).
3. **Tracker** (optional, e.g. Jira through the Atlassian MCP; skip if none is connected): `searchJiraIssuesUsingJql` with
   `assignee = currentUser() AND sprint in openSprints() AND statusCategory != Done ORDER BY priority DESC`
   Ask only for key, summary, status and priority fields.
4. **Vault tasks**: `vault_tasks.due` (already filtered to due on or before today) and `vault_tasks.inbox_files`. Don't read notes further.
5. **Release tracks**: `releases`.
6. **Long sessions**: each line of `long_sessions` goes under "Needs you" with the proposal: `/wrap`, then split the rest into `crow handoff` runs with one narrow end state each. Nothing listed, nothing printed.
   **Background runs**: `runs.not_succeeded` (running or failed). **Accounts**: from `accounts`, one line only when the recommended account is under 30% or an account the owner uses is blocked (with its reset).
   **Checks**: each row of `checks.rows` goes under "Needs you" as "what (why): action", the same rows as the deck's You decide. `checks.skipped` lists sources it could not read; say nothing about them.
   **Logics next moves**: from `fleet`, only moves that unblock work (blocked docs, a task at 100% in a repo in delivery); skip pure closeout chores unless nothing else is open.
7. **Retros**: `retros.reports` (one line each: project, what was applied; open a report only when its name says nothing), `retros.pending_proposals`, and failures from `retros.status`.
   **Tool updates**: when `toolwatch` is set, one line: the note name and its open proposals count, then the proposals (at most 5). In the main session, ask which to take up in one `AskUserQuestion` (multi-select); each pick becomes a Logics item or a line in an existing one, then tick it in the note (`- [x]`). Declined ones get ticked too, with "(declined)".
8. **Mail + calendar**: only if Microsoft 365 tools are available in this session. Today's meetings, and unread mail that needs a reply. If unavailable, print one line saying so and move on.
9. **Owner notes**: from `notes`, mention anything that changes the day (a #blocage, a #decision, a note for tomorrow) in one line each. Then pick at most three live topics (open threads, sprint tickets, release tracks) with no trace in the notes or activity for 3 days and ask them in one `AskUserQuestion` call, only in the main session; file answers with `bin/crow-note ... --section capture`. Nothing stale, nothing asked.

Skip any source that errors and note it in one line at the bottom.

## Output (exactly this shape, skip empty sections)
```
# Brief: <weekday DD/MM>

## 🎯 Your priorities today
- each line of today.md with its state (done / open), then what blocks it; skip if the file is not dated today

## 🔴 Needs you
- review feedback on my MRs (unresolved threads, always first: fixing it gets them merged), reviews waiting on me (they unblock devs), approvals pending, failed runs, overdue tasks

## 📅 Today
- meetings and recurring rituals (listed in `local/context.md`), deadlines

## 🏃 Sprint
- KEY status: summary   (mine, in priority order)

## 🧵 Open threads
- stale (>3 days) or due ones only

## 🚀 Release tracks
- one line per track: name → target, next milestone (or "no roadmap yet"); then one suggested next step for the most recently active personal project

## 🧹 Repos
- what crow-tidy cleaned (one line), then per project only: uncommitted work, unpushed main, branches older than 3 days (offer to merge/delete), worktrees in /tmp

## 🔁 Learned
- one line per retro since the last brief (what changed); pending proposals to approve; failed retros
- tool updates: note name, open proposals (from `toolwatch`)

## ✅ Suggested top 3
1. …  (follow the priority order in CLAUDE.md)
```

## After
Run `bin/crow-log "[hub] brief"` (writes `- HH:MM [hub] brief` to the daily note's CR-0W section). Nothing else.
