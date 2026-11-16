## item_205_deck_shows_every_kind_of_work - Deck shows every kind of work
> From version: 1.0.0
> Schema version: 1.0
> Status: Ready
> Understanding: 85%
> Confidence: 80%
> Progress: 0%
> Complexity: Medium
> Theme: Nest
> Reminder: Update status/understanding/confidence/progress and linked request/task references when you edit this doc.

# AI Context
- Summary: crow-deck lists read the core work feed: every kind of work with its kind and state, mission rollup, same counts as Nest.
- Keywords: crow-deck, work feed, agents, missions, rollup, TUI
- Use when: deck work lists.
- Skip when: Nest or core changes.

# Problem
- The deck builds its own agent and mission views (`agents_data.go`, `data.go`), separate from Nest.

# Scope
- In:
  - Deck data layer reads `work`; lists show kind and state with the terminal ANSI theme; mission rollup.
- Out:
  - New deck screens or layouts without rendered options first.

# Acceptance criteria
- AC1: Deck counts per state match Nest on the same core snapshot.
- AC2: Each kind shows with its label; mission items roll up.
- AC3: `go test ./...` passes in tools/crow-deck.

# Priority
- Priority: Medium
- Rationale: Terminal surface follows Nest.

# Links
- Product brief(s): (none yet)
- Architecture decision(s): (none yet)
- Request: req_060_nest_deck_track_all_work
- Primary task(s): (none yet)

# Notes
- 2026-11-16: owner focuses on Nest first; deck work waits after the Nest queue (204, 208, 166, 212, 210, 211).
- Owner decision 2026-11-13: work = live sessions, background runs, parked sessions, MRs/PRs with CI, plus missions. Missions are an automatic optional grouping (goal, end state, delegation contract), never created by hand, never a separate list.
- Read `local/owner-prefs.md` before building. Visual changes need rendered options first.

# Executions
| When | Runner | Run id | Title | State | PR | Notes |
| --- | --- | --- | --- | --- | --- | --- |
