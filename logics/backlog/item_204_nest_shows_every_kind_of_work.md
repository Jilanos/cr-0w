## item_204_nest_shows_every_kind_of_work - Nest shows every kind of work
> From version: 1.0.0
> Schema version: 1.0
> Status: In progress
> Understanding: 90%
> Confidence: 85%
> Progress: 55%
> Complexity: Medium
> Theme: Nest
> Reminder: Update status/understanding/confidence/progress and linked request/task references when you edit this doc.

# AI Context
- Summary: Nest reads the core work feed everywhere: hero planets and cards, mood line, inbox and desk lists. Each item shows its kind; items under a mission roll up under the goal.
- Keywords: nest, work feed, hero, mood, inbox, desk, MissionRow, rollup
- Use when: Nest work lists or counts.
- Skip when: core feed changes.

# Problem
- Nest screens are mission-centric (`MissionRow`, `order.ts`, `Desk`, `Inbox`). The hero joins live feeds ad hoc (item_199).

# Scope
- In:
  - `data/live.ts` reads `work`; replace `heroLiveOf` joins with it; one row component for any work kind with a kind label.
  - Mission rollup row (goal, then its items) when items carry a mission id.
  - Fixtures gain each kind.
- Out:
  - Visual redesign beyond the row kind label; any new look needs rendered options first.

# Acceptance criteria
- AC1: On live data, hero, mood, inbox and desk counts match `/api/state/work`.
- AC2: A session, run, parked session and MR with red CI each show with their kind and the right state.
- AC3: Items of one mission show under its goal; others show alone.
- AC4: `npm test`, `tsc` and `scripts/hero-reel.mjs` pass.

# Priority
- Priority: High
- Rationale: Nest is the daily surface.

# Links
- Product brief(s): (none yet)
- Architecture decision(s): (none yet)
- Request: req_060_nest_deck_track_all_work
- Primary task(s): (none yet)

# Notes
- Owner decision 2026-11-13: work = live sessions, background runs, parked sessions, MRs/PRs with CI, plus missions. Missions are an automatic optional grouping (goal, end state, delegation contract), never created by hand, never a separate list.
- Read `local/owner-prefs.md` before building. Visual changes need rendered options first.
- 2026-11-13: three options (A, B, C) for the work row and the mission rollup rendered in the vault `Research/nest-design/item_204` with a compare spec; pick pending.
- Owner decisions 2026-11-14 (row pick):
  - Rows: option A (kind tag on the right, mission rollup on a rail), a bit bigger and with the kind icon.
  - The work list replaces the Needs and Ready sections on Desk.
  - Done items are hidden on Desk.
  - Inbox also lists failed runs.
  - An own MR with a red pipeline reads failed (core rule changed on main, 4a43d83).
- 2026-11-15: data layer and Desk built (shots in vault `Research/nest-design/item_204/build/desk/`), Inbox next after owner OK.
- Owner decisions 2026-11-15 (Desk review):
  - Desk approved as built (work list first on cover, slots and queue below on inner, resumable list gone on laptop).
  - Keep the failed count tile on laptop, the Inbox badge (needs + failed) and the hero "N items failed".
  - No red outline on failed rows (match board A).
  - Flagged mail leaves Desk. Inbox follows the approved board (item_138 fold-inbox): flagged mail joins "To answer" with crow questions and failed runs, scoped by mailbox. "Drafts ready" fills later with item_092/093.

# Executions
| When | Runner | Run id | Title | State | PR | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11-15T09:07:21.014666+00:00 | cdx | 357510a13cac4e66963502e012cb6241 | item_204 data layer + Desk build | succeeded |  |  |
| 2026-11-13T18:52:21.845294+00:00 | cdx | 22b5aa65638c4494b3ae28c9f93761b3 | item_204 work row options | succeeded |  |  |
