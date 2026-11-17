## item_234_routine_scheduling_with_lock_and_retry - Routine scheduling with lock and retry
> From version: 1.0.0
> Schema version: 1.0
> Status: Ready
> Understanding: 85
> Confidence: 80
> Progress: 0%
> Complexity: Medium
> Theme: General
> Reminder: Update status/understanding/confidence/progress and linked request/task references when you edit this doc.

# AI Context
- Summary: `crow schedule` installs routines (systemd user timers on Linux, Task Scheduler WakeToRun under WSL) with a shared `crow lock <name>` so two runs never overlap, and a delayed retry when a connector fails.
- Keywords: schedule, routines, timer, wsl, lock, retry, connector
- Use when: scheduling a routine or adding a lock.
- Skip when: the AFK queue loop.

# Problem
- Paul hand-built a Windows task for his 06:30 routine; two routines ran at once on 04/11; Graph 502 two nights in a row with no retry (§4.1). req_023 (draft) asks for jobs that survive lid closed.

# Scope
- In:
  - `crow schedule add|list|rm <name> --at|--every <cmd>`; backends: systemd user timer, WSL schtasks.
  - `crow lock <name> -- <cmd>`: lock file with pid, stale lock cleanup.
  - Retry policy per routine (`+30m, +60m`) on a failure exit code.
  - crow-retro timer migrated to it.
- Out:
  - Cloud routines.

# Acceptance criteria
- AC1: A routine added with `crow schedule` fires at its time on Linux and on WSL.
- AC2: A second start while locked exits with 'locked by <pid>'.
- AC3: A failed run is retried at +30 then +60 min, then reported.

# AC Traceability
- req_064_paul_s_feedback_and_a_modular_public_crow-AC -> This backlog slice. Proof: A routine added with `crow schedule` fires at its time on Linux and on WSL.

# Dependencies
- req_023 folded in.

# Links
- Request: req_064_paul_s_feedback_and_a_modular_public_crow.

# Priority
- Priority: Medium
- Rationale: Needed by both users' daily routines.

# Executions
| When | Runner | Run id | Title | State | PR | Notes |
| --- | --- | --- | --- | --- | --- | --- |
