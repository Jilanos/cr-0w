## item_190_laptop_missions_from_the_approved_missions_board - Nest Ops page (ex-Missions): timeline of everything worked on, queue and run detail
> From version: 1.0.0
> Schema version: 1.0
> Status: In progress
> Understanding: 85%
> Confidence: 85%
> Progress: 70%
> Complexity: Medium
> Theme: Nest
> Reminder: Update status/understanding/confidence/progress and linked request/task references when you edit this doc.
> Indicators reviewed: 2026-11-19 10:59:19

# AI Context
- Summary: Rename the Missions tab to Ops and build it as the Nest view of the deck Agents tab: a day and week timeline of every session and run (owner and crow), what runs now, the queue, run detail and week totals. Phone and laptop, live data.
- Keywords: nest, ops, missions, timeline, lanes, queue, runs, agents, week totals
- Use when: building the Ops tab.
- Skip when: answers that wait (Inbox, item_223), quota and tokens (item_227), settled reports (item_258).

# Problem
- Nothing on the Missions tab works on either device (owner 2026-11-17).
- Owner 2026-11-19: the page tracks more than missions. The timeline matters most: everything the owner or crow worked on, what took time, what got stuck.
- The approved missions boards (local/state/shots/nest-rebuild/boards/missions-board.png, missions-board-cyber.png) predate this scope; they stay the style reference, not the layout.

# Scope
- In:
  - Tab and route renamed Missions -> Ops; old links redirect.
  - Timeline first: one lane per session or run per day, spans coloured by state (working, waiting on owner, idle, stuck, failed, done); day and week switch.
  - Now strip: running sessions and runs, free slots, account per run.
  - Queue: queued missions, routines with next start, AFK jobs; row actions pause, resume, run now, cancel (item_147, item_168 routes).
  - Lane detail: run report, commits, diff stat, cost, end state; open the chat (/desk/m/<id>) or the worktree.
  - Week totals: hours, wait hours, stuck count, cost per project and kind.
  - Mockups first (phone, laptop, both themes) from item_257 data; owner picks, then build one screen at a time.
- Out:
  - Desk resume, Inbox answers, Usage quota: they have their own pages.
  - Core data (item_257).

# Build notes (2026-11-19)
- Core gaps fixed first (commits 9b5e7c2, 4861a24): worktree lanes fold into their repo, runs join their session lane, AFK titles from the job file, usage buckets kept a week.
- Nest: tab and route are Ops (/ops); /missions and /missions/<id> redirect. Screen src/screens/Ops.tsx: day timeline grouped by project, live lanes hatched with a now line and OPEN to the chat, planned routines dashed, week strip, queue, totals by project or kind, lane sheet with the run report and cost.
- Not built, no core route yet: routine pause and run now, AFK edit and delete, mission run now and reorder, worktree and diff stat, AFK stop times. Mission cancel works (crow mission cancel).
- Past waiting spans: item_264. The state log records them from now on.
- Left: owner review on live data (AC1, AC3), then the missing actions as core routes.

# Acceptance criteria
- AC1: Owner approved the Ops board before the build.
- AC2: Timeline for a past day matches the deck Agents lanes.
- AC3: Every row action works on live data on 368x812 and on the laptop.
- AC4: Lane detail shows the run report and cost for a finished run.
- AC5: No link still points at /missions without a redirect.

# AC Traceability
- request-AC5 -> This backlog slice. Proof: Owner approved the Ops board and the build compare.

# Decision framing
- Product framing: Not needed
- Architecture framing: Not needed

# Links
- Product brief(s): `prod_009_nest_laptop_parity`
- Architecture decision(s): (none yet)
- Request: `req_057_nest_on_the_laptop_replaces_the_owner_s_terminals`, `req_063_nest_pages_and_inbox_as_the_home_for_everything_that_waits`
- Primary task(s): `task_023_orchestrate_nest_laptop_parity`
- Depends on: `item_257_core_serves_the_ops_timeline_lanes_and_run_history`

# Priority
- Priority: High
- Rationale: Owner 2026-11-19: the timeline is the view they want most.

# Executions
| When | Runner | Run id | Title | State | PR | Notes |
| --- | --- | --- | --- | --- | --- | --- |
