## item_249_nest_feels_smooth_on_every_screen - Nest feels smooth on every screen
> From version: 1.0.0
> Schema version: 1.0
> Status: Ready
> Understanding: 80%
> Confidence: 75%
> Progress: 0%
> Complexity: Medium
> Theme: General
> Reminder: Update status/understanding/confidence/progress and linked request/task references when you edit this doc.

# AI Context
- Summary: Measure and fix the lag on the laptop Desk and other screens, not only the Home hologram.
- Keywords: performance, lag, webgl, rail head, polling, re-render, nest
- Use when: Nest feels slow, scrolling or clicks lag.
- Skip when: the Home hologram look itself (item_176).

# Problem
- Owner 2026-11-18: the hero is laggy as known, and the Desk sessions and the rest also feel slow and not smooth.
- Lead suspect: since item_176 slice 2 the butler rail draws a WebGL head (src/hero/RailHead.tsx) on every non-Home laptop screen. It renders every 33-50 ms (AMBIENT_MS/IDLE_MS) for as long as the tab is visible, even when idle and even when the rail is folded. That is 20-30 GL frames per second on the main thread next to React.
- Second suspect: data polls (api.ts poll 5000, useConversation, useButler) re-render whole screens on each tick, even when the data did not change.
- Nothing is measured yet.

# Scope
- In:
  - Measure first: Chrome performance trace on the Desk and Home, 10 s idle and 10 s scrolling, with and without the rail head (a `?nohead` flag or a stubbed head). Note frame time, long tasks, scripting vs rendering. Save numbers in the item notes.
  - Rail head: stop the loop when idle (render on change only, short ambient bursts), stop it when the rail is folded or off screen (IntersectionObserver), cap it at a low rate off Home, or show a static frame. Pick from the trace.
  - Polling: skip setState when the payload is unchanged (compare a hash or the raw text), memoize heavy derived lists (work groups, ready rows) and rows (React.memo).
  - Check CSS cost (backdrop-filter, large shadows, animations on many rows) if the trace shows paint time.
- Out:
  - Hologram redesign. Phone and Fold beyond what the shared fixes give.

# Acceptance criteria
- AC1: Before/after trace numbers for Desk and Home are in the notes.
- AC2: An idle Desk spends under 5% main-thread time (no constant GL loop off Home when nothing changes).
- AC3: A poll with unchanged data causes no screen re-render (React profiler or a render counter test).
- AC4: Scrolling the Desk lists and clicking a session feel instant to the owner; vitest and shots pass.

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
- Priority: High
- Rationale: Owner feedback on the live app, 2026-11-18; lag hits every screen.

# Notes
- Generated locally by logics-manager.

# Executions
| When | Runner | Run id | Title | State | PR | Notes |
| --- | --- | --- | --- | --- | --- | --- |
