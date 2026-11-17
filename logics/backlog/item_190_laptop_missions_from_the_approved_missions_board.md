## item_190_laptop_missions_from_the_approved_missions_board - Laptop Missions from the approved missions board
> From version: 1.0.0
> Schema version: 1.0
> Status: Ready
> Understanding: 90%
> Confidence: 85%
> Progress: 0%
> Complexity: Medium
> Theme: Nest
> Reminder: Update status/understanding/confidence/progress and linked request/task references when you edit this doc.
> Indicators reviewed: 2026-11-17 15:52:24

# AI Context
- Summary: Build the Missions board on the laptop from the approved board, plus a working phone Missions, on live data. Today nothing on the page works.
- Keywords: missions, laptop, phone, board, lanes, runs chart
- Use when: building the Missions tab.
- Skip when: the Project page (item_222), Inbox (item_223).

# Problem
- Missions on the laptop renders the Fold layout; the laptop board (missions-board, missions-board-cyber) is approved but not built.
- Owner 2026-11-17: nothing on Missions works on either device; it needs to be built (req_063).
- Planet clicks will stop opening Missions (item_222); Missions stays the cross-project board.

# Scope
- In:
  - Build the laptop Missions layout from local/state/shots/nest-rebuild/boards/missions-board.png and missions-board-cyber.png on live data: kp title row, 5 columns, lane timeline, 7-day runs chart with labelled axes.
  - A mission row opens its chat (/desk/m/<id>).
  - Phone Missions: a list per lane with the same row actions (open chat, pause, resume, run now), checked on live data.
  - Every action on the page works end to end (item_147, item_168 routes).
- Out:
  - New mission actions beyond item_147 and item_168.

# Acceptance criteria
- Side-by-side compare page of the build vs both boards gets the owner's OK.
- Every column and the chart read live core data; chart axes are labelled.
- Opening a mission from the laptop shows its last run chat.
- On 368x812, every mission row action works on live data.

# AC Traceability
- request-AC5 -> This backlog slice. Proof: Side-by-side compare page of the build vs both boards gets the owner's OK.

# Decision framing
- Product framing: Not needed
- Architecture framing: Not needed

# Links
- Product brief(s): `prod_009_nest_laptop_parity`
- Architecture decision(s): (none yet)
- Request: `req_057_nest_on_the_laptop_replaces_the_owner_s_terminals`, `req_063_nest_pages_and_inbox_as_the_home_for_everything_that_waits`
- Primary task(s): `task_023_orchestrate_nest_laptop_parity`

# Priority
- Priority: High
- Rationale: Owner 2026-11-17: the tab is visible and nothing works.

# Executions
| When | Runner | Run id | Title | State | PR | Notes |
| --- | --- | --- | --- | --- | --- | --- |
