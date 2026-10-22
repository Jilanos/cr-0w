## item_017_2_8_compatibility_regression_onboarding_and_delivery_evidence - 2.8 Compatibility regression onboarding and delivery evidence
> From version: 1.0.0
> Schema version: 1.0
> Status: In progress
> Understanding: 90%
> Confidence: 85%
> Progress: 10%
> Complexity: Medium
> Theme: Claude and Codex orchestration
> Reminder: Update status/understanding/confidence/progress and linked request/task references when you edit this doc.
> Indicators reviewed: 2026-10-22 16:51:43

# AI Context
A dual-provider fork needs a reproducible migration and proof that Claude-only users remain supported. Priority rationale: final integration after 2.1 through 2.7, with offline tests authored alongside each slice.

# Problem
- A dual-provider fork needs a reproducible migration and proof that Claude-only users remain supported.

# Scope
- In:
  - Priority rationale: final integration after 2.1 through 2.7, with offline tests authored alongside each slice.
  - Update README installation and feature wording, account example and runbooks for dispatch, memory, interruptions, session retros and project work. Document Claude-only, Codex-only and mixed examples with invented profile names.
  - Publish the tested cdx version/capability matrix, guarded-operation limitations, supported provider flags, schema migration/rebuild behavior and rollback procedure. Preserve upstream history and MIT license attribution.
  - Run python3 -m pytest tests and go test ./... in tools/crow-watch; use fake cdx/native artifacts for success/error/race cases and generate mixed watch/widget renders.
  - Provide optional owner-run live smoke steps: one task per provider in separate worktrees, observe completion/usage, then an explicitly confirmed handoff. Record live validation as pending unless actually authorized and performed; no automated credentials or paid generation.
  - Record task-level AC evidence and refresh Logics indicators/index through the manager at delivery; settle linked product only after implementation acceptance.
- Out:
  - Changing cdx or provider authentication internals.

# Acceptance criteria
- AC1: Offline Python and Go suites pass with no live account or provider executable required; assertions cover both providers and legacy behavior.
- AC2: Documentation contains copyable launch/dispatch/handoff examples, exact capability checks and a safe rollback that retains private source transcripts.
- AC3: Acceptance evidence maps every request AC to a passing check or explicitly pending owner-run smoke; pending required proof prevents implementation closeout.
- AC4: Public diff contains no local/ state, credentials, actual private profile inventory or unrelated upstream changes.

# AC Traceability
- request-AC10 -> This backlog slice. Proof: AC1: Offline Python and Go suites pass with no live account or provider executable required; assertions cover both providers and legacy behavior.

# Decision framing
- Product framing: Not needed
- Architecture framing: Not needed

# Links
- Product brief(s): `prod_003_one_crow_hub_for_claude_and_codex`
- Architecture decision(s): (none yet)
- Request: `req_004_run_claude_and_codex_together_through_cdx`
- Primary task(s): `task_003_deliver_joint_claude_and_codex_support_through_cdx`

# Priority
- Priority: Medium
- Rationale: final integration after 2.1 through 2.7, with offline tests authored alongside each slice.
