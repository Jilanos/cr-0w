## task_003_deliver_joint_claude_and_codex_support_through_cdx - Deliver joint Claude and Codex support through cdx
> From version: 1.0.0
> Schema version: 1.0
> Status: In progress
> Understanding: 95%
> Confidence: 90%
> Progress: 90%
> Complexity: High
> Theme: Claude and Codex orchestration
> Reminder: Update status/understanding/confidence/progress and linked request/backlog references when you edit this doc.
> Indicators reviewed: 2026-10-22 16:51:43
> Owner: crow

# AI Context
Implemented in dependency order over the Claude helpers. Waves 1 to 7 are in code with offline tests. Two delivery gates stay open: widget renders and the owner-run live smoke.

# Context
- Deliver mixed Claude/Codex operation over the existing account-switching helpers and observability surfaces. The installed cdx 0.21.4 is the inspected baseline; required public capabilities must be tested before launch.
- Coordinate with the active account-switching task before changing shared helpers; preserve its progress and existing behavior.

# Plan
- [x] 1. Wave 1 (High, 2.1): capture sanitized cdx 0.21.4 contract fixtures, implement shared boundary and account/provider policy. Validate Claude-only migration and deny paths first.
- [x] 2. Wave 2 (High, 2.2): implement shared context lifecycle and capability-based guard enforcement. Gate unsupported operations before enabling Codex launch.
- [x] 3. Wave 3 (High, 2.3): enable interactive and tracked headless execution for each provider, helper jobs, atomic global slots and isolated workspaces; validate with fake cdx.
- [x] 4. Wave 4 (High, 2.4): normalize activity/session identity and cached native adapters; verify simultaneous mixed sessions and report deduplication.
- [x] 5. Wave 5 (Medium, 2.5 then 2.6): verify usage/token arithmetic and migrations; add exact native resume and confirmed cross-provider transfer over task_002 recovery helpers.
- [x] 6. Wave 6 (Medium, 2.7): adapt CLI, Go TUI and both QML widgets, render mixed/legacy/unavailable cases using existing UI conventions.
- [x] 7. Wave 7 (Medium, 2.8): run offline Python/Go suites, review onboarding and capability matrix, record acceptance evidence and optional live smoke separately. Use Logics lifecycle commands; do not mark implementation complete during corpus creation.
- [x] ADR 009 checkpoint: update affected Logics docs during each meaningful wave and leave the repo commit-ready.
- [x] Keep commit creation under operator control; do not force one commit per micro-step.
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
- request-AC1 -> `item_010_2_1_public_cdx_contract_and_provider_aware_account_policy`. Proof: 9d09c01 bin/crow_cdx.py call/capabilities; tests/test_crow_cdx.py (broken envelopes, missing CLI, timeout, old version, Node entrypoint, no cdx_manager import).
- request-AC2 -> `item_010_2_1_public_cdx_contract_and_provider_aware_account_policy`. Proof: 9d09c01 resolve/consent; tests/test_crow_cdx.py (legacy default, mixed resolution, never/unknown/disabled/mismatch before launch, ask-first consent per account).
- request-AC8 -> `item_011_2_2_shared_context_and_enforceable_guard_capabilities`. Proof: eb328e5 context_refs/plan and crow-memory leases, 5149bfc Codex dispatch references; tests/test_crow_launch.py (same required references, missing reference, never profile, concurrent leases, release on failed launch).
- request-AC9 -> `item_011_2_2_shared_context_and_enforceable_guard_capabilities`. Proof: eb328e5 crow_cdx.guard; tests/test_crow_launch.py (Codex hub session refused before launch, sandboxes only, no full-access fallback).
- request-AC3 -> `item_012_2_3_provider_aware_launch_dispatch_and_helper_jobs`. Proof: eb328e5 crow launcher, crow-runs oneshot/dispatch, crow-retro and titles through cdx; tests/test_crow_launch.py (brief, dispatch, report, wait, title, retro on both providers; Claude argv unchanged; model mismatch refused).
- request-AC4 -> `item_012_2_3_provider_aware_launch_dispatch_and_helper_jobs`. Proof: eb328e5 global slots and workspace writers, 3998aa7 identities; tests/test_crow_launch.py (2 slots across providers, simultaneous-dispatch race, same-folder writer refused, worktrees, failures free slots) and tests/test_crow_activity.py.
- request-AC4 -> `item_013_2_4_mixed_provider_activity_and_session_registry`. Proof: eb328e5 global slots and workspace writers, 3998aa7 identities; tests/test_crow_launch.py (2 slots across providers, simultaneous-dispatch race, same-folder writer refused, worktrees, failures free slots) and tests/test_crow_activity.py.
- request-AC5 -> `item_013_2_4_mixed_provider_activity_and_session_registry`. Proof: 3998aa7 agent records, f57fb9f watch and widgets; tests/test_crow_activity.py, tools/crow-watch/mixed_test.go (provider labels, unknown cost $?, Claude-only unchanged). Widget renders pending.
- request-AC6 -> `item_014_2_5_provider_aware_usage_quota_and_cost_accounting`. Proof: e263286 crow-usage, bin/crow_prices.py; tests/test_crow_usage_providers.py (hand-calculated totals, snapshots once, cached/reasoning subsets, null cost, cached limits, legacy days).
- request-AC7 -> `item_015_2_6_exact_resume_and_cross_provider_task_handoff`. Proof: aae7dfa crow-relaunch; tests/test_crow_relaunch.py (native resume only for the exact id, both transfer directions, bad preparation, failed launch stays interrupted, ask-first typed yes).
- request-AC5 -> `item_016_2_7_provider_identity_across_watch_cli_and_desktop_widgets`. Proof: 3998aa7 agent records, f57fb9f watch and widgets; tests/test_crow_activity.py, tools/crow-watch/mixed_test.go (provider labels, unknown cost $?, Claude-only unchanged). Widget renders pending.
- request-AC10 -> `item_017_2_8_compatibility_regression_onboarding_and_delivery_evidence`. Proof: ec0f39f docs/cdx-compatibility.md, runbooks/claude-and-codex.md; offline suites pass. Owner-run live smoke pending.

# Validation
- Corpus scaffold dry-run and inline validation completed on 2026-10-22 with no blocking findings.
- 2026-10-22: `uv run --no-project --with pytest --with pyyaml python -m pytest tests`: 138 passed, 1 skipped (node entrypoint test skips without node). The Python env has no pytest; uv supplies it.
- 2026-10-22: `go vet ./... && go test ./...` in tools/crow-watch (Go 1.25.3 toolchain): ok.
- 2026-10-22: read-only live checks against cdx 0.21.5 with a scratch CROW_HOME: `crow-runs json` lists the two live Codex sessions and the Claude session with provider, account and native id; `crow-usage --json` splits today by provider and reads limits from `status --cached`. crow watch renders reviewed from those payloads.
- Open gate: widget renders (archeotech shot.sh and qmllint are not on this machine). Fixtures: `integrations/archeotech/crow-*/test/gen.py` case `mixed`.
- Open gate: owner-run live smoke in runbooks/claude-and-codex.md (one run per provider at once, usage, a confirmed handoff). Not run: it needs real accounts and paid usage.

# Report
- Review before implementation (2026-10-22): installed cdx is 0.21.5 (corpus said 0.21.4); `cdx run` refuses an account with `--provider`; item_011 traced request-AC9 to the wrong AC; pytest and Go were missing locally; task_002 steps 1.1 and 1.4 are still open. Corpus docs corrected; the code builds on the existing helpers without closing task_002.
- Delivered: `bin/crow_cdx.py` (public cdx boundary, policy, consent, guard capabilities, context, slots), `bin/crow_native.py` (read-only Claude/Codex readers), `bin/crow_prices.py` (crow-owned price table), provider-aware crow, crow-accounts, crow-runs, crow-sessions, crow-relaunch, crow-usage, crow-retro, crow-memory leases, crow watch and both widgets, docs and runbooks.
- Decisions: Codex hub sessions are unavailable (no enforceable hub guard); Codex one-shots run in the cdx `default` sandbox, read-only helpers in `review`. Same-account relaunch is a native resume only when `cdx can-resume` names the exact conversation. Rows name providers only once a payload is mixed, so Claude-only renders stay unchanged.
- Known limits: a Codex brief has no network. Codex tool-output sizes and compactions are not measured (null). The agents timeline lanes do not show the provider.

# Links
- Request: `req_004_run_claude_and_codex_together_through_cdx`
- Product brief(s): `prod_003_one_crow_hub_for_claude_and_codex`
- Architecture decision(s): (none yet)
