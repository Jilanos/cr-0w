## item_006_1_1_memory_in_local_shared_by_every_allowed_profile - 1.1 memory in local, shared by every allowed profile
> From version: 1.0.0
> Schema version: 1.0
> Status: In progress
> Understanding: 90%
> Confidence: 85%
> Progress: 75%
> Complexity: Medium
> Theme: Hub orchestration
> Reminder: Update status/understanding/confidence/progress and linked request/task references when you edit this doc.
> Indicators reviewed: 2026-10-20 17:47:35

# AI Context
- Summary: (unfilled: replace before this doc is used)
- Keywords: memory, local, shared, allowed, profile
- Use when: (unfilled: replace before this doc is used)
- Skip when: (unfilled: replace before this doc is used)

# Problem
- Memory is split per cdx profile, so a session relaunched on another account loses what crow learned, and copying it into a shared account would expose personal notes.

# Scope
- In:
  - Move the cr-0w and per-project memory folders into local/ (its own git history) and point each profile's memory path at them only while a crow-launched session runs.
  - Write-back so a memory saved from any profile lands in local/ and is committed there.
- Out:
  - Memory for accounts that are never used.
  - Pushing local/ anywhere.

# Acceptance criteria
- AC1: after the move the main profile loads the same memories as before, verified by listing them from a session.
- AC2: a session launched on the shared account reads the same files from local/ and leaves no copy in its profile once it ends.
- AC3: a memory written from any profile appears in local/ and is committed.

# AC Traceability
- request-AC8 -> This backlog slice. Proof: AC1: after the move the main profile loads the same memories as before, verified by listing them from a session.

# Decision framing
- Product framing: Not needed
- Architecture framing: Not needed

# Links
- Product brief(s): `prod_002_keep_working_when_an_account_runs_out`
- Architecture decision(s): (none yet)
- Request: `req_001_crow_account_switching_and_session_resume`
- Primary task(s): `task_002_deliver_account_switching_and_session_resume_in_three_steps`

# Priority
- Priority: High
- Rationale: Set by scaffold input or defaulted for grooming.
