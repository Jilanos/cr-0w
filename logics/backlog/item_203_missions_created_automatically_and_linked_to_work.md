## item_203_missions_created_automatically_and_linked_to_work - Missions created automatically and linked to work
> From version: 1.0.0
> Schema version: 1.0
> Status: In progress
> Understanding: 90%
> Confidence: 85%
> Progress: 90%
> Complexity: Medium
> Theme: Nest
> Reminder: Update status/understanding/confidence/progress and linked request/task references when you edit this doc.

# AI Context
- Summary: Missions become an automatic grouping: `crow handoff`, `crow dispatch` and Logics-started work create one when they carry an end state, and the sessions, runs and MRs they spawn link to it.
- Keywords: mission, handoff, dispatch, logics, end state, delegation contract, rollup
- Use when: changing how missions start or link to work.
- Skip when: feed shape (202) or UI (204, 205).

# Problem
- Missions exist (`contract/mission.go`: goal, end_state, autonomy, budget, gates, runs[]) but almost nothing creates them; they read as a separate concept.

# Scope
- In:
  - Create or reuse a mission on handoff/dispatch with `--end-state`, keyed by project + Logics ref when given.
  - Link: sessions by handoff note / cwd + worktree, runs by run id, MRs by branch.
  - Mission state derived from its linked items (failed > needs > working > done when end state reached).
  - Work items carry the mission id (feeds 202).
- Out:
  - Manual mission creation UI. Changing autonomy/budget rules.

# Acceptance criteria
- AC1: A `crow handoff ... --end-state` creates one mission; a second handoff for the same Logics ref reuses it.
- AC2: The session, run and MR it spawns appear in the work feed with that mission id.
- AC3: Work started without an end state creates no mission and still shows in the feed.
- AC4: Tests cover create, reuse and linking.

# Priority
- Priority: Medium
- Rationale: Grouping adds value once the feed exists.

# Links
- Product brief(s): (none yet)
- Architecture decision(s): (none yet)
- Request: req_060_nest_deck_track_all_work
- Primary task(s): (none yet)

# Notes
- Owner decision 2026-11-13: work = live sessions, background runs, parked sessions, MRs/PRs with CI, plus missions. Missions are an automatic optional grouping (goal, end state, delegation contract), never created by hand, never a separate list.
- Read `local/owner-prefs.md` before building. Visual changes need rendered options first.

# Delivery
- 767d19d `new[GO/PY/JSON]`: `crow mission ensure` creates or reuses a linked mission (build kind, running, no core run), keyed on project + Logics ref, else project + end state. `crow handoff --end-state [--logics]` writes a `Mission:` line in the note; `crow-runs dispatch --end-state` records `linked_mission` on the run. No end state: no mission.
- b575c7f `new[GO/PY/JSON]`: work feed linking. Sessions by the note's `Mission:` line (live: transcript; parked: whole first prompt), then by worktree (`<repo>.wt/<name>`, only when the worktree holds one mission). Runs by linked mission or run id. MRs by mission branch/url, else by the branch of linked work in the same project (sessions report their transcript's git branch). A linked mission's state is the most urgent state of its work, done once all of it is done; an inbox ask makes it needs; no work in sight reads queued. Core-run missions keep the contract-state rules. Also fixes the core contract test lists that missed `work` from item_202.
- 0c4e204 `new[GO/PY]`: tests.
- AC1: `internal/mission/link_test.go` TestEnsureCreatesThenReusesByLogicsRef, TestEnsureKeysOnEndStateWithoutRef; `tests/test_crow_project.py` test_handoff_links_its_mission_in_the_note, `tests/test_crow_runs_mission.py` test_dispatch_with_an_end_state_records_its_linked_mission.
- AC2: `internal/work/link_test.go` TestLinkedWorkCarriesTheMission (session by note and worktree, live and finished runs, parked session, MR by branch), TestLinkedMissionWaitsOnItsOpenMR; `tests/test_crow_sessions.py` test_mission_comes_from_the_whole_handoff_note, `tests/test_crow_runs_mission.py` test_session_branch_comes_from_its_transcript.
- AC3: TestEnsureRefusesWithoutEndState, TestUnlinkedWorkStillShows, TestWorktreeLinkingNeedsOneMission, test_dispatch_without_an_end_state_or_with_a_tick_mission_links_nothing.
- AC4: the tests above plus TestLinkedMissionStateRollsUp, TestDoneLinkedMissionLeaves, TestIsLinked, TestWorktreeOf.
- Left: live check after merge and a core restart (a handoff with `--end-state` shows its session, run and MR under one mission in `GET /api/state/work`).

# Executions
| When | Runner | Run id | Title | State | PR | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11-13T13:41:24.078774+00:00 | cdx | 854208bd3a594454aa9cf106fa586c98 | item_203 missions auto + linking (continue) | running |  |  |
| 2026-11-13T11:45:04.519694+00:00 | cdx | c898fb4822e04d06a6c0fd18788888a9 | item_203 missions auto + linking | failed |  | limit |
| 2026-11-13T11:41:41.610771+00:00 | cdx | a499f12d9ab649bbb363f88fe1b3c653 | item_203 missions auto + linking | failed |  | limit |
