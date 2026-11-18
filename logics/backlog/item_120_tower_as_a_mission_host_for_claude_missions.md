## item_120_tower_as_a_mission_host_for_claude_missions - Tower as a mission host for Claude missions
> From version: 1.0.0
> Schema version: 1.0
> Status: Draft
> Understanding: 90%
> Confidence: 85%
> Progress: 0%
> Complexity: Medium
> Theme: General
> Reminder: Update status/understanding/confidence/progress and linked request/task references when you edit this doc.
> Indicators reviewed: 2026-11-18 11:14:28

# AI Context
- Summary: The tower becomes a second mission host that also runs Claude missions. It needs cdx config, accounts and worktrees on the tower, and run records gathered from both hosts.
- Keywords: tower, host, claude missions, cdx remote, run records
- Use when: Dispatching missions to the tower.
- Skip when: Local inference only jobs and Wake-on-LAN.

# Problem
- Owner decision 2026-11-07: the tower takes Claude missions too, not only local inference and builds.
- The tower needs cdx config, accounts and worktrees. Run records must be gathered from two hosts. Remote `--continue-run` is unsupported in cdx 0.26.6, so a resume there is a cold run.

# Scope
- In:
  - cdx config and allowed accounts on the tower; worktrees under the repo's `.wt/` layout.
  - Dispatch from core to laptop or tower by idle signals (spec four signals).
  - Gather run records from both hosts into the mission record.
  - Cold-run resume on the tower from the brief and version files.
- Out:
  - Wake and sleep (item_242, item_243; Wake-on-LAN back in scope 2026-11-18).
  - Homelab control host (later).

# Acceptance criteria
- AC1: A research mission dispatched to the tower runs and its run record shows in the same list as laptop runs.
- AC2: A tower mission yields when the owner starts a game (idle signals).
- AC3: Credentials on the tower follow the same env and allowlist rules as the laptop.
- AC4: A resume after an answer is a cold run from files.

# AC Traceability
- request-AC1 -> AC1 to AC4. Proof: a tower mission run record next to laptop runs.

# Decision framing
- Product framing: Not needed
- Architecture framing: Not needed

# Links
- Product brief(s): (none yet)
- Architecture decision(s): (none yet)
- Request: `req_029_spike_hosts_model_sources_and_local_ai_benchmarks`, `req_056_crow_on_the_windows_tower`
- Task: `task_022_orchestrate_crow_on_the_windows_tower` step 6. Owner 2026-11-18: missions start from Nest; recheck remote `--continue-run` in the current cdx before building.
- Primary task(s): (none yet)

# Priority
- Priority: Low
- Rationale: Capacity, not a prerequisite for the first missions.

# Notes
- 2026-11-07 owner decision 28 (req_029 D2 option B).
- Open: Wake-on-LAN (decision 29, later). Tower only takes work while on and idle.
- Depends on item_119 for core dispatch and on item_100 for the isolation layer.

# Executions
| When | Runner | Run id | Title | State | PR | Notes |
| --- | --- | --- | --- | --- | --- | --- |
