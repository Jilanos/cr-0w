## item_210_nest_desk_opens_on_the_last_selected_session_and_groups_live_and_background_work - Nest Desk opens on the last selected session and groups live and background work
> From version: 1.0.0
> Schema version: 1.0
> Status: Ready
> Understanding: 85
> Confidence: 75
> Progress: 0%
> Complexity: Medium
> Theme: General
> Reminder: Update status/understanding/confidence/progress and linked request/task references when you edit this doc.

# AI Context
- Summary: Desk opens on the first background run instead of what the owner last looked at, and splits live sessions and background runs on both sides of the chat. Fix the default pick and regroup the layout so the owner sees at a glance what is going on.
- Keywords: nest, desk, selection, last selected, sessions, runs, layout, chat
- Use when: changing how Desk picks and lists sessions and runs.
- Skip when: the work list rows (item_204), the Terminal tab (item_209).

# Problem
- Seen by the owner 2026-11-16 on the laptop:
  - Desk opens on the first slot of the background runs. Root cause: `screens/Desk.tsx:93` picks `?? runs[0]` before live sessions.
  - Live sessions and background runs sit on either side of the chat, so it is hard to see what is going on.

# Scope
- In:
  - Default pick: the last selected session or run (kept per device, survives reload); if it is gone, the live session the owner is in (the hub session or the newest live session); if none, a picker screen listing sessions and runs.
  - Layout: live sessions and background runs grouped on one side (one list, two groups), chat on the other. Mockup options first, owner picks, then build.
- Out:
  - Row content of the Desk work list (item_204).

# Acceptance criteria
- AC1: The owner approves a rendered board of the regrouped Desk (laptop and inner) first.
- AC2: Desk reopens on the last selected session or run after reload and after switching tabs.
- AC3: With no last pick, Desk opens the live session; with no live session, a picker.
- AC4: Live sessions and background runs show in one place; the chat has the rest of the width.
- AC5: Shots at 1440x900 and 707x691 in both themes; tsc, vitest, pytest pass.

# Links
- Builds on item_187 (session chat in the laptop Desk).

# Priority
- Priority: High
- Rationale: Desk is where the owner follows sessions; the wrong default hides the live session.

# Notes
- Raised by the owner 2026-11-16.

# Executions
| When | Runner | Run id | Title | State | PR | Notes |
| --- | --- | --- | --- | --- | --- | --- |
