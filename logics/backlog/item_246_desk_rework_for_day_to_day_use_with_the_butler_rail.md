## item_246_desk_rework_for_day_to_day_use_with_the_butler_rail - Desk rework for day to day use with the butler rail
> From version: 1.0.0
> Schema version: 1.0
> Status: In progress
> Understanding: 90%
> Confidence: 80%
> Progress: 90%
> Complexity: Medium
> Theme: Nest
> Reminder: Update status/understanding/confidence/progress and linked request/task references when you edit this doc.

# AI Context
- Summary: Desk on laptop goes from three columns plus the butler rail to two: Work (1/3) and the open session (2/3). Row actions, Ready to run and the useful KPIs come back.
- Keywords: nest, desk, laptop, work list, sessions, slots, kpi, butler rail
- Use when: changing the laptop Desk layout or its work list actions.
- Skip when: phone Desk, Home, or the butler rail itself (item_176).

# Problem
- With the butler rail (item_176), Desk at 1440px shows three columns plus the rail: too much to take in day to day.
- The Work list (7cd11d7, 15/11) dropped the per-row actions of the old Needs you panel (Approve push, Answer, Retry): one more click to act.
- Ready to run (Logics ready, CR-0W suggestions, scheduled) is gone from Desk.
- KPI row lost "done today" and "ok rate 7d" (now slots and resumable).

# Scope
- In:
  - Laptop Desk layout: Work column 1/3, open session 2/3 (owner 18/11). Butler rail stays as is and pushes the page.
  - Sessions block at the top of the Work column (sketch B, owner 18/11): live sessions, slots and the queue in one list, Work below it.
  - A launched Work task moves up into Sessions (a move animation comes later, out of this item).
  - Primary action button back on Work rows that need you or failed.
  - Ready to run back on Desk.
  - KPI row: working, need you · oldest, failed, done today, ok rate 7d.
- Out:
  - Phone and Fold Desk.
  - The rail (item_176) and Home.

# Acceptance criteria
- AC1: At 1440x900 with the rail open, Desk shows two columns, Work about 1/3 and the session about 2/3, no horizontal scroll.
- AC2: A Work row that needs you or failed shows its primary action (Approve, Answer, Retry) and it goes through the confirm sheet.
- AC3: The Sessions block tops the left column with live sessions, slots (n/2) and the queue; a click opens the session on the right. A launched task leaves Work and shows in Sessions.
- AC4: Ready to run is visible on Desk.
- AC5: KPI row shows working, need you with the oldest age, failed, done today, ok rate 7d.
- AC6: Modern and cyber themes both match sketch B (the approved layout).

# AC Traceability
- AC1-AC6 -> this item. Proof: screenshots vs the approved board, vitest, tsc.

# Decision framing
- Product framing: Not needed
- Architecture framing: Not needed

# Links
- Product brief(s): (none yet)
- Architecture decision(s): (none yet)
- Request: (none)
- Related: `item_176_butler_chat_in_nest_on_the_core_mcp_tools`
- Primary task(s): (none yet)

# Priority
- Priority: Medium
- Rationale: daily surface; follows the rail build.

# Notes
- 2026-11-18: owner feedback: Ready list 5 rows max, 2 per project, follows the scope chip; session rows open on click (79e2a53). Work-side sprint tickets moved to item_247.
- Owner 2026-11-18: page has a lot to take in; rework for day to day use. Keep the rail pushing. Open session 2/3, not 50/50.
- Owner 2026-11-18: picked B (sessions on top of the left column) "this way when a work task is launched it goes up into sessions (animation later)".
- Design: vault `Research/nest-design/item_246/desk-B.png` is the approved layout (annotated sketch, not a pixel board); `sketch.html?v=B` is its source. Decisions in `design-notes.md` there.

- Build 2026-11-18 (a1e0a77, core retry route c8541ae): layout B on laptop. Sessions block (runs, sessions with Open, queue line), filter chips Needs/Running/Ready/All (Needs by default), one action per row (Retry, Open MR, Allow, Answer), Ready to run = Logics Ready + at most 3 sessions parked in the last 24h (owner 18/11), KPIs working/need you·oldest/failed/done today/ok rate 7d. Shots in vault `Research/nest-design/item_246/build/`.
- Owner 2026-11-18: a launched item leaving Needs for Running is right; Ready ▶ keeps account auto. Left: owner check vs desk-B.png on the live app.

# Executions
| When | Runner | Run id | Title | State | PR | Notes |
| --- | --- | --- | --- | --- | --- | --- |
