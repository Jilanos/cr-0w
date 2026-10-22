## item_010_2_1_public_cdx_contract_and_provider_aware_account_policy - 2.1 Public cdx contract and provider-aware account policy
> From version: 1.0.0
> Schema version: 1.0
> Status: Ready
> Understanding: 90%
> Confidence: 85%
> Progress: 0%
> Complexity: Medium
> Theme: Claude and Codex orchestration
> Reminder: Update status/understanding/confidence/progress and linked request/task references when you edit this doc.
> Indicators reviewed: 2026-10-22 16:46:46

# AI Context
Crow assumes a Python cdx installation and accounts without provider identity. Priority rationale: every subsequent slice depends on reliable provider resolution and one policy boundary.

# Problem
- Crow assumes a Python cdx installation and accounts without provider identity.

# Scope
- In:
  - Priority rationale: every subsequent slice depends on reliable provider resolution and one policy boundary.
  - Introduce a shared subprocess boundary with argv arrays, timeouts, exit/ok/schema checks, bounded errors and cached capability discovery. Keep providers as claude/codex internal enums; tolerate unrelated providers in inventory but refuse them as targets.
  - Read public cdx inventory/schema/config/status contracts using sanitized 0.21.4 fixtures. Preserve CROW_ACCOUNT and old default/name/policy/memory configuration; explicit account overrides default, optional --provider constrains the resolved account. When only provider is supplied, select only within allowed enabled profiles; never let cdx select an unrestricted account.
  - Extend docs/accounts.example.yaml with invented Claude/Codex profiles, provider mismatch validation and documented unknown-profile policy. Inventory reads must not log into, refresh auth or alter profiles.
- Out:
  - Changing cdx or provider authentication internals.

# Acceptance criteria
- AC1: Claude-only legacy fixtures resolve the same default; mixed fixtures resolve both providers and an explicit matching account wins over defaults.
- AC2: Missing CLI, timeout, non-JSON, ok=false, unsupported schema, disabled/unknown profiles and provider mismatch produce actionable errors before any launch subprocess.
- AC3: A never account is rejected in every path; ask-first consent records the exact target and action and cannot be reused for another account.
- AC4: A Node entrypoint fixture works without importing cdx_manager or assuming a Python shebang.

# AC Traceability
- request-AC1 -> This backlog slice. Proof: AC1: Claude-only legacy fixtures resolve the same default; mixed fixtures resolve both providers and an explicit matching account wins over defaults.
- request-AC2 -> This backlog slice. Proof: AC2: Missing CLI, timeout, non-JSON, ok=false, unsupported schema, disabled/unknown profiles and provider mismatch produce actionable errors before any launch subprocess.

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
- Rationale: every subsequent slice depends on reliable provider resolution and one policy boundary.
