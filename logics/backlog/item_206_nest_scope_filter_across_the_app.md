## item_206_nest_scope_filter_across_the_app - Nest scope filter across the app
> From version: 1.0.0
> Schema version: 1.0
> Status: Ready
> Understanding: 90
> Confidence: 85
> Progress: 0%
> Complexity: Medium
> Theme: General
> Reminder: Update status/understanding/confidence/progress and linked request/task references when you edit this doc.

# AI Context
- Summary: Add an all / work / perso scope filter to Nest that every screen reads, remembered per device.
- Keywords: nest, scope, filter, work, perso, hero, desk, missions, inbox
- Use when: building the Nest scope filter.
- Skip when: work outside Nest.

# Problem
- Nest mixes work and personal projects on every screen. The deck has an all / work / perso mode; Nest has none.

# Scope
- In:
  - Scope per project: add `scope` to `RegProject` (`data/live.ts`; already in `bin/crow-registry json`).
  - Map: mission `scope` work → work, personal and crow → perso; inbox rows, sessions and runs take their project's registry scope.
  - Unknown project (no registry entry): shown under all only.
  - Systems (item_200): a system planet takes its members' scope; a mixed system shows under both, with only the matching members as moons.
  - One filter state in the app shell, read by the hero model, Desk, Missions and Inbox.
  - Kept in localStorage `nest.scope` (try/catch, like `nest.theme`); default all.
  - Control: 2 or 3 mockup options (place and look, phone and laptop), owner picks, then build.
  - Mood line and counts follow the filter (the head reacts only to what is shown).
- Out:
  - Server-side filtering in crow-core.
  - Clock-based default (owner chose remember-last).

# Acceptance criteria
- AC1: The owner picks the control from mockups (phone 368x812 and laptop 1440x900).
- AC2: work shows only work projects, missions, asks, sessions and runs on every screen; perso only personal and crow; all shows everything (unit tests on the filter and on the hero model).
- AC3: The choice survives a reload; blocked storage falls back to all without an error.
- AC4: Owner OK on shots of each screen in each mode.

# AC Traceability
- request-AC1 -> AC2. Proof: unit tests and shots.
- request-AC2 -> AC3. Proof: reload test.
- request-AC3 -> AC1. Proof: owner pick on the mockups.

# Decision framing
- Product framing: Decided 2026-11-13: whole app, remember the last choice per device. Open: control look and place (AC1).
- Architecture framing: Not needed (client-side filter).

# Links
- Product brief(s): (none yet)
- Architecture decision(s): (none yet)
- Request: `req_061_nest_scope_filter`
- Primary task(s): (none yet)
- Related: `item_200` (systems), deck `tools/crow-deck/chrome.go` modeSegs.

# Priority
- Priority: Medium
- Rationale: owner request 2026-11-13, after the hero polish pass.

# Notes
- Execution order: 1 scope in RegProject + filter helper with tests, 2 mockups and owner pick, 3 wire every screen, 4 shots.
- Mockups and shots go in the vault (`Research/nest-design/item_206/`).

# Executions
| When | Runner | Run id | Title | State | PR | Notes |
| --- | --- | --- | --- | --- | --- | --- |
