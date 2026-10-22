## task_003_deliver_joint_claude_and_codex_support_through_cdx - Deliver joint Claude and Codex support through cdx
> From version: 1.0.0
> Schema version: 1.0
> Status: In progress
> Understanding: 90%
> Confidence: 85%
> Progress: 0%
> Complexity: High
> Theme: Claude and Codex orchestration
> Reminder: Update status/understanding/confidence/progress and linked request/backlog references when you edit this doc.
> Indicators reviewed: 2026-10-22 16:51:43
> Owner: crow

# AI Context
Implement in dependency order over the current Claude helpers. Corpus creation is complete; implementation has not started. Each wave must preserve Claude-only behavior and test its Codex path offline.

# Context
- Deliver mixed Claude/Codex operation over the existing account-switching helpers and observability surfaces. The installed cdx 0.21.4 is the inspected baseline; required public capabilities must be tested before launch.
- Coordinate with the active account-switching task before changing shared helpers; preserve its progress and existing behavior.

# Plan
- [ ] 1. Wave 1 (High, 2.1): capture sanitized cdx 0.21.4 contract fixtures, implement shared boundary and account/provider policy. Validate Claude-only migration and deny paths first.
- [ ] 2. Wave 2 (High, 2.2): implement shared context lifecycle and capability-based guard enforcement. Gate unsupported operations before enabling Codex launch.
- [ ] 3. Wave 3 (High, 2.3): enable interactive and tracked headless execution for each provider, helper jobs, atomic global slots and isolated workspaces; validate with fake cdx.
- [ ] 4. Wave 4 (High, 2.4): normalize activity/session identity and cached native adapters; verify simultaneous mixed sessions and report deduplication.
- [ ] 5. Wave 5 (Medium, 2.5 then 2.6): verify usage/token arithmetic and migrations; add exact native resume and confirmed cross-provider transfer over task_002 recovery helpers.
- [ ] 6. Wave 6 (Medium, 2.7): adapt CLI, Go TUI and both QML widgets, render mixed/legacy/unavailable cases using existing UI conventions.
- [ ] 7. Wave 7 (Medium, 2.8): run offline Python/Go suites, review onboarding and capability matrix, record acceptance evidence and optional live smoke separately. Use Logics lifecycle commands; do not mark implementation complete during corpus creation.
- [ ] ADR 009 checkpoint: update affected Logics docs during each meaningful wave and leave the repo commit-ready.
- [ ] Keep commit creation under operator control; do not force one commit per micro-step.
- [ ] GATE: do not close until lint, audit, and scaffold validation pass.

# Backlog
- `item_010_2_1_public_cdx_contract_and_provider_aware_account_policy`
- `item_011_2_2_shared_context_and_enforceable_guard_capabilities`
- `item_012_2_3_provider_aware_launch_dispatch_and_helper_jobs`
- `item_013_2_4_mixed_provider_activity_and_session_registry`
- `item_014_2_5_provider_aware_usage_quota_and_cost_accounting`
- `item_015_2_6_exact_resume_and_cross_provider_task_handoff`
- `item_016_2_7_provider_identity_across_watch_cli_and_desktop_widgets`
- `item_017_2_8_compatibility_regression_onboarding_and_delivery_evidence`

# Definition of Done (DoD)
- [ ] All eight backlog slices meet their acceptance criteria, with request AC1 through AC10 linked to implementation evidence.
- [ ] Claude-only, Codex-only and mixed-provider offline fixtures pass, including account consent, exact identity, global slot races, workspace isolation and context cleanup.
- [ ] `python3 -m pytest tests` passes; `go test ./...` passes from `tools/crow-watch`.
- [ ] Mixed-provider terminal and widget renders are reviewed through the existing screenshot workflow.
- [ ] Migration, rollback, capability limits and provider examples are documented. Required live verification is either recorded with owner consent or remains an explicit unresolved delivery gate.
- [ ] Changed workflow docs pass lint, audit and request validation; linked product is settled through Logics lifecycle commands only after delivery acceptance.

# AC Traceability
- request-AC1 -> `item_010_2_1_public_cdx_contract_and_provider_aware_account_policy`. Proof deferred to slice closeout.
- request-AC2 -> `item_010_2_1_public_cdx_contract_and_provider_aware_account_policy`. Proof deferred to slice closeout.
- request-AC8 -> `item_011_2_2_shared_context_and_enforceable_guard_capabilities`. Proof deferred to slice closeout.
- request-AC9 -> `item_011_2_2_shared_context_and_enforceable_guard_capabilities`. Proof deferred to slice closeout.
- request-AC3 -> `item_012_2_3_provider_aware_launch_dispatch_and_helper_jobs`. Proof deferred to slice closeout.
- request-AC4 -> `item_012_2_3_provider_aware_launch_dispatch_and_helper_jobs`. Proof deferred to slice closeout.
- request-AC4 -> `item_013_2_4_mixed_provider_activity_and_session_registry`. Proof deferred to slice closeout.
- request-AC5 -> `item_013_2_4_mixed_provider_activity_and_session_registry`. Proof deferred to slice closeout.
- request-AC6 -> `item_014_2_5_provider_aware_usage_quota_and_cost_accounting`. Proof deferred to slice closeout.
- request-AC7 -> `item_015_2_6_exact_resume_and_cross_provider_task_handoff`. Proof deferred to slice closeout.
- request-AC5 -> `item_016_2_7_provider_identity_across_watch_cli_and_desktop_widgets`. Proof deferred to slice closeout.
- request-AC10 -> `item_017_2_8_compatibility_regression_onboarding_and_delivery_evidence`. Proof deferred to slice closeout.

# Validation
- Corpus scaffold dry-run and inline validation completed on 2026-10-22 with no blocking findings. This checks planning readiness; implementation tests and task AC proof remain pending.

# Report
- Not started.

# Links
- Request: `req_004_run_claude_and_codex_together_through_cdx`
- Product brief(s): `prod_003_one_crow_hub_for_claude_and_codex`
- Architecture decision(s): (none yet)
