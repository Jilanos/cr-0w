## item_014_2_5_provider_aware_usage_quota_and_cost_accounting - 2.5 Provider-aware usage quota and cost accounting
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
Claude token categories, private pricing imports and fixed quota assumptions cannot be applied to Codex. Priority rationale: depends on 2.1 and 2.4; trustworthy measures precede presentation.

# Problem
- Claude token categories, private pricing imports and fixed quota assumptions cannot be applied to Codex.

# Scope
- In:
  - Priority rationale: depends on 2.1 and 2.4; trustworthy measures precede presentation.
  - Consume public cdx stats/run usage and cached status with provenance and freshness; use versioned native fallback only for missing per-day/session detail. Remove private cdx_manager price-table imports.
  - Normalize Codex cumulative token updates versus per-turn deltas without summing cumulative snapshots; cached input and reasoning output are subsets, while Claude cache creation/read semantics stay distinct.
  - Version crow usage schema and cache; preserve old consumer fields additively, retain legacy frozen history without relabeling it as Codex, and invalidate/rebuild derived caches without modifying source transcripts.
  - Carry provider/account/model/project/day keys through rollups, quota windows, prices and savings. Use public price metadata when available or an explicit versioned crow-owned table; unknown model cost remains null with unpriced counts. Never infer Codex prices or quotas from Claude.
  - Separate list-price estimates from subscription charges; preserve time window/units/source, avoid cross-provider quota percentages or cache-saving calculations when incomparable.
- Out:
  - Changing cdx or provider authentication internals.

# Acceptance criteria
- AC1: Hand-calculated mixed fixtures match token/day/project totals across repeated collection and session/run overlap; cumulative Codex snapshots count only once.
- AC2: Unknown cost/limits remain null throughout rollups rather than zero; partially priced totals identify incomplete coverage.
- AC3: Provider-specific cache and reasoning fixtures prove subsets are not billed twice; frozen Claude history and existing usage regressions still pass.
- AC4: Quota freshness/source and provider window labels remain visible in emitted JSON with no live auth refresh during normal polling.

# AC Traceability
- request-AC6 -> This backlog slice. Proof: AC1: Hand-calculated mixed fixtures match token/day/project totals across repeated collection and session/run overlap; cumulative Codex snapshots count only once.

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
- Rationale: depends on 2.1 and 2.4; trustworthy measures precede presentation.
