## item_206_nest_scope_filter_across_the_app - Nest scope filter across the app
> From version: 1.0.0
> Schema version: 1.0
> Status: In progress
> Understanding: 95
> Confidence: 90
> Progress: 95%
> Complexity: Medium
> Theme: General
> Reminder: Update status/understanding/confidence/progress and linked request/task references when you edit this doc.
> Indicators reviewed: 2026-11-14 19:27:36

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
- Owner decisions 2026-11-13 (header pick): header A (one row: scope chip after the logo, status chips and clock right, no extra height); crow missions show under both like the cr-0w project; laptop account gauges stay as rendered; the cut-off phone tab bar (7 tabs, Reports clipped) is fixed in this item.
- Owner decisions 2026-11-13 (control pick):
  - Control: B (one header chip cycling all/work/perso), inside a redesigned header bar for phone and laptop that shows everything well (clock, status chips, scope chip); no hidden clock or chips. Render header options before building.
  - Fold inner screen: tabs move to the bottom like on the cover screen, for easier reach.
  - Today calendar stays whole in every mode.
  - Projects with no scope (and unregistered ones) show only under all. A project can be tagged `both` (crow is both): it shows under all, work and perso. `both` is an option when tagging a project.
- Execution order: 1 scope in RegProject + filter helper with tests, 2 mockups and owner pick, 3 wire every screen, 4 shots.
- Mockups and shots go in the vault (`Research/nest-design/item_206/`).
- 2026-11-13: filter helper with tests and storage + wiring on every screen but Chat are done on branch `nest-scope-filter`. No visible control yet. Control pick pending: options A (header segmented), B (header chip), C (strip under the header) in `Research/nest-design/item_206/` with `spec.json`.
- Decided 2026-11-13: an open ask on an unregistered project follows its mission's scope; Chat reads unfiltered data; mail rows carry a scope, Today mail is the work mailbox (perso shows none).
- 2026-11-13: `both` scope done (registry field `nest_scope`: work, personal or both, default `scope`). Header options rendered (A one row, B two tiers, C capsule) in `Research/nest-design/item_206/header/` with `spec.json`. Pick pending.
- 2026-11-13: header A built, tab-bar options rendered, pick pending. Build shots per scope in `Research/nest-design/item_206/build/{work,all,perso}/` (board vs build in `build/spec.json`); tab options in `Research/nest-design/item_206/tabs/` with `spec.json`.
- Owner decision 2026-11-14 (tab bar): B, five tabs (Home, Desk, Missions, Inbox, More). More opens a sheet with MRs, Agenda and Reports and stays highlighted while one of them is open. Labels 11px. Same bar on cover and fold inner.
- 2026-11-14: tab bar B built, ready to merge. Shots and board vs build in `Research/nest-design/item_206/build/tabs/` with `spec.json`. AC4 waits on the owner OK on those shots.

# Executions
| When | Runner | Run id | Title | State | PR | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11-14T18:20:14.054393+00:00 | cdx | 66a136b0c300434697bfc889b6f2306d | item_206 tab bar B build | running |  |  |
| 2026-11-13T18:53:40.623150+00:00 | cdx | a9110765d90f4b538d624fa1fa16e5bd | item_206 header A build + tab options (continue) | succeeded |  |  |
| 2026-11-13T14:17:22.413431+00:00 | cdx | 4cde807657b8448a8eff291918e2f2fb | item_206 header A build + tab options | failed |  | limit |
| 2026-11-13T14:13:59.669861+00:00 | cdx | 570319e068c64526a0e6a4d06b5bb86d | item_206 header A build + tab options | failed |  | limit |
| 2026-11-13T13:53:38.163012+00:00 | cdx | 154fbc5ba05d4bca9d2ff940cf0a1436 | item_206 both scope + header options | succeeded |  |  |
| 2026-11-13T11:36:20.898840+00:00 | cdx | 5fb0498e1ead476eba90323ea23d1a2e | item_206 scope filter (continue) | succeeded |  |  |
| 2026-11-13T11:02:00.732037+00:00 | cdx | 049a30da502c4f85af660da658cefbde | item_206 scope filter logic + mockups | succeeded |  |  |
