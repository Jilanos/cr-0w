## item_012_2_3_provider_aware_launch_dispatch_and_helper_jobs - 2.3 Provider-aware launch dispatch and helper jobs
> From version: 1.0.0
> Schema version: 1.0
> Status: In progress
> Understanding: 90%
> Confidence: 85%
> Progress: 100%
> Complexity: Medium
> Theme: Claude and Codex orchestration
> Reminder: Update status/understanding/confidence/progress and linked request/task references when you edit this doc.
> Indicators reviewed: 2026-10-22 16:51:43

# AI Context
Launcher output and helper jobs still assume a Claude result envelope or invoke Claude directly. Priority rationale: deliver usable Codex execution after 2.1 and 2.2, before observability surfaces.

# Problem
- Launcher output and helper jobs still assume a Claude result envelope or invoke Claude directly.

# Scope
- In:
  - Priority rationale: deliver usable Codex execution after 2.1 and 2.2, before observability surfaces.
  - Add consistent --account and --provider choices to hub, term, project handoff, dispatch and one-shot entry points; keep existing argument forms and CROW_ACCOUNT.
  - Use cdx run public envelopes and run-report for final text, artifact references and status; retain explicit provider-specific fallback parsing only where public data lacks a final message. Handle ok=false, failed spawn, nonzero exit, timeout and cancellation separately from successful completion.
  - Route briefs, digest/retro, AFK and generated titles through the same account policy and provider boundary. Remove implicit direct Claude execution; keep explicit CROW_TITLE_CMD override as a documented operator-owned legacy escape hatch, with no automatic invocation when no eligible account exists.
  - Maintain one atomic global CROW_MAX_RUNS budget across both providers including detached runs; add workspace writer ownership and require another worktree or explicit read-only capability for a conflicting job. Persist provider/account/native identity with run lineage.
  - Keep model identifiers and reasoning/permission capabilities provider-specific. Do not enable cdx --failover by default because its target ranking can exceed crow allowed-account consent.
- Out:
  - Changing cdx or provider authentication internals.

# Acceptance criteria
- AC1: Mocked interactive, brief, dispatch, AFK, title and retro paths target each provider with valid argv and return its final report; old Claude invocations still pass.
- AC2: Two isolated mixed-provider jobs occupy two shared slots and a third is refused at capacity, including a simultaneous-dispatch race.
- AC3: Same-workspace writers are rejected before spawn; separate worktrees preserve each job cwd and branch.
- AC4: Provider-incompatible model/permission choices, denied policy and missing consent fail without a ledger success entry; failed/cancelled jobs release slots.
- AC5: Detached run returns run_id immediately and wait/report resolve the correct run without Claude-only stdout assumptions.

# AC Traceability
- request-AC3 -> This backlog slice. Proof: AC1: Mocked interactive, brief, dispatch, AFK, title and retro paths target each provider with valid argv and return its final report; old Claude invocations still pass.
- request-AC4 -> This backlog slice. Proof: AC2: Two isolated mixed-provider jobs occupy two shared slots and a third is refused at capacity, including a simultaneous-dispatch race.

# Decision framing
- Product framing: Not needed
- Architecture framing: Not needed

# Links
- Product brief(s): `prod_003_one_crow_hub_for_claude_and_codex`
- Architecture decision(s): (none yet)
- Request: `req_004_run_claude_and_codex_together_through_cdx`
- Primary task(s): `task_003_deliver_joint_claude_and_codex_support_through_cdx`

# Priority
- Priority: High
- Rationale: deliver usable Codex execution after 2.1 and 2.2, before observability surfaces.
