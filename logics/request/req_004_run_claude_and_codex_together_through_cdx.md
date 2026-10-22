## req_004_run_claude_and_codex_together_through_cdx - Run Claude and Codex together through cdx
> From version: 1.0.0
> Schema version: 1.0
> Status: Ready
> Understanding: 95%
> Confidence: 90%
> Complexity: High
> Theme: Claude and Codex orchestration
> Reminder: Update status/understanding/confidence and linked backlog/task references when you edit this doc.
> Indicators reviewed: 2026-10-22 16:46:46

# AI Context
Extends the existing account-switching and observability work. cdx owns provider execution and authentication; crow owns allowed-account policy, task lineage and presentation.

# Needs
- Make the fork a hub for both Claude Code and Codex, with one cdx profile per account and simultaneous sessions across registered projects.
- Choose a provider/account explicitly for interactive work, brief, project handoff and tracked background jobs; retain existing Claude-only configurations.
- Observe activity, usage, quotas and interrupted work for both providers in existing CLI, terminal board and optional widgets.
- Continue a chosen task across providers using verified context transfer, with account policy and workspace ownership preserved.

# Context
- Repository inspection on 2026-10-22: interactive launches already call cdx, but crow-runs detects only Claude processes and parses Claude messages; crow-usage scans Claude profile paths, imports private cdx_manager.run_usage helpers and defaults to a direct Claude title command; crow-sessions, crow-memory and retros also assume Claude layouts.
- The installed cdx-manager 0.21.4 exposes both providers, cdx --json, schema --json, select --provider --require-ready --json, status --cached --json, run, run-status, run-report, runs, history, stats, can-resume and handoff. This is an inspected compatibility baseline, not an assertion about earlier releases. Capture sanitized fixtures and gate required capabilities before advertising support. Review 2026-10-22: the machine runs 0.21.5; fixtures are captured from 0.21.5 and 0.21.4 stays the minimum accepted version.
- cdx run refuses a session together with --provider (cdx schema mutually_exclusive). Crow resolves the account itself and passes cdx only the account.
- cdx run publishes schema_version, ok, provider, session, run_id, exit_code, stdout_path, transcript_path and nullable token usage. Consume its public JSON boundary; no import of cdx Python internals or assumption that the executable is a Python script.
- Installed cdx handoff supports Claude and Codex native transcripts. SOURCE TARGET --source-conversation ID --json prepares an entry without launching; --source-native-transcript PATH disambiguates duplicate native IDs. Native resume remains provider-specific. Cross-provider handoff starts a target conversation and links it to the source.
- OpenAI official non-interactive and CLI documentation was checked on 2026-10-22 for exec JSON events and resume. Crow delegates execution to cdx; native event parsing is a bounded read-only fallback for activity details missing from cdx, versioned with synthetic fixtures. No Codex API key is required for corpus creation.
- Existing account-switching task_002 is In progress. Reuse its policy helper, interrupted registry and memory behavior; add provider-aware migrations without closing, resetting or duplicating that work. The earlier UI corpus owns layout improvements; this request adds provider identity and mixed data to those surfaces.
- Scope decision: joint use means concurrent Claude/Codex tasks, explicit provider selection and guarded cross-provider task handoff. Autonomous agent-to-agent conversation, consensus loops and automatic cross-provider retries are excluded.
- Architecture decision: add a small shared Python boundary under bin/ for cdx invocation, provider capabilities and normalized records; keep Bash launcher, Go TUI and QML consumers. cdx owns auth homes and launches; crow owns its allowed-account policy, task lineage and presentation.
- Private config, raw transcripts, handoff entries, memory and run state stay under ignored local/ or cdx-managed private storage. Public fixtures use invented profiles and temporary directories. Never commit credentials, actual account lists or private project context.

# Acceptance criteria
- AC1: A versioned cdx boundary discovers provider and capabilities, validates JSON/error envelopes, rejects unsupported contracts with actionable diagnostics and works with the installed Node launcher without importing private cdx modules.
- AC2: Account configuration resolves provider from cdx and supports optional checked provider declarations, existing defaults, policy use/ask-first/never and per-job explicit account/provider selection; mismatches, disabled, unknown and forbidden targets fail before launch.
- AC3: Interactive hub/project sessions, one-shot brief, dispatch, report, wait, AFK jobs, title generation and retros work through cdx for either provider; existing Claude commands keep their behavior and provider-specific model or permission flags cannot silently cross providers.
- AC4: One Claude and one Codex job run concurrently with distinct provider/account/native-conversation identities, correct lifecycle/report/cancellation handling and a single global background-slot limit; conflicting writes in one workspace are refused or use explicit separate worktrees.
- AC5: CLI snapshots, watch and both optional widgets distinguish providers, preserve existing fields and represent missing activity/context/quota data as unknown rather than idle, healthy or zero.
- AC6: Usage aggregation separates provider, account, model, project and day, deduplicates live/history/run observations, normalizes cumulative versus delta tokens, avoids double-counting cached/reasoning subsets and keeps unknown prices/quotas null with provenance.
- AC7: Interrupted-session records carry provider and exact source identity. Same-provider resume and Claude-to-Codex/Codex-to-Claude handoff verify workspace and policy, require confirmation and reject ambiguous/stale sources; failed launch never marks a source as resumed.
- AC8: Both providers receive applicable repository instructions, allowed shared memory and task state through an explicit context mechanism; temporary shared-account access is removed on exit/failure and concurrent sessions cannot unlink each other or write credentials into shared context.
- AC9: Common hub guard requirements are mapped to each provider capability. Unsupported enforcement fails closed for guarded actions with a diagnostic; no silent promise that Claude hooks protect a Codex session and no reduction in approval or permission settings.
- AC10: Offline Python and Go regressions and mixed-provider rendering fixtures pass; onboarding, migration, capability matrix and manual opt-in smoke steps cover Claude-only, Codex-only and mixed setups without requiring live credentials in automated checks.

# Definition of Ready (DoR)
- [x] Problem statement is explicit and user impact is clear.
- [x] Scope boundaries (in/out) are explicit.
- [x] Acceptance criteria are testable.
- [x] Dependencies and known risks are listed.

# Companion docs
- Product brief(s): `prod_003_one_crow_hub_for_claude_and_codex`
- Architecture decision(s): (none yet)

# References
- README.md
- AGENTS.md
- LOGICS.md
- CLAUDE.md
- bin/crow
- bin/crow-accounts
- bin/crow-runs
- bin/crow-usage
- bin/crow-project
- bin/crow-sessions
- bin/crow-relaunch
- bin/crow-memory
- bin/crow-retro
- bin/crow-digest
- bin/crow-afk-preflight
- bin/crow-hub-guard
- tools/crow-watch/main.go
- tools/crow-watch/usage.go
- integrations/archeotech/crow-agents/CrowStore.qml
- integrations/archeotech/crow-usage/CrowUsageStore.qml
- docs/accounts.example.yaml
- tests/conftest.py
- logics/request/req_001_crow_account_switching_and_session_resume.md
- logics/tasks/task_002_deliver_account_switching_and_session_resume_in_three_steps.md
- https://github.com/AlexAgo83/cdx-manager
- https://learn.chatgpt.com/docs/non-interactive-mode
- https://learn.chatgpt.com/docs/cli/reference

# Backlog
- `item_010_2_1_public_cdx_contract_and_provider_aware_account_policy`
- `item_011_2_2_shared_context_and_enforceable_guard_capabilities`
- `item_012_2_3_provider_aware_launch_dispatch_and_helper_jobs`
- `item_013_2_4_mixed_provider_activity_and_session_registry`
- `item_014_2_5_provider_aware_usage_quota_and_cost_accounting`
- `item_015_2_6_exact_resume_and_cross_provider_task_handoff`
- `item_016_2_7_provider_identity_across_watch_cli_and_desktop_widgets`
- `item_017_2_8_compatibility_regression_onboarding_and_delivery_evidence`
