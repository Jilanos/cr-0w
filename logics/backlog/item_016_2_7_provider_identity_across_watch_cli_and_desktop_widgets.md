## item_016_2_7_provider_identity_across_watch_cli_and_desktop_widgets - 2.7 Provider identity across watch CLI and desktop widgets
> From version: 1.0.0
> Schema version: 1.0
> Status: Ready
> Understanding: 90%
> Confidence: 85%
> Progress: 0%
> Complexity: Medium
> Theme: Claude and Codex orchestration
> Reminder: Update status/understanding/confidence/progress and linked request/task references when you edit this doc.
> Indicators reviewed: 2026-10-22 16:46:47

# AI Context
Current views hide provider identity and can render absent metrics as ordinary values. Priority rationale: depends on 2.4 and 2.5; recovery action wiring follows 2.6.

# Problem
- Current views hide provider identity and can render absent metrics as ordinary values.

# Scope
- In:
  - Priority rationale: depends on 2.4 and 2.5; recovery action wiring follows 2.6.
  - Extend Go and QML payload consumers for additive provider fields, nullable metrics, quota provenance and schema compatibility; legacy missing provider defaults only when legacy payload provenance guarantees Claude.
  - Show provider/account on agents, usage and interrupted rows plus selection details; filter by provider without losing cross-provider global slot totals. Keep existing keyboard navigation, responsive layout and provider-neutral model display.
  - Wire relaunch selection to the shared guarded recovery command, showing native-resume versus cross-provider-transfer wording and exact target before confirmation.
  - Add mixed/legacy/unknown-data fixtures to existing Go render tests and widget fixture generators; use existing screenshot procedure instead of introducing another UI.
- Out:
  - Changing cdx or provider authentication internals.

# Acceptance criteria
- AC1: Mixed snapshots display correct provider/account for agents, history, usage and interruptions in CLI, watch and both optional widgets.
- AC2: Unknown context, price and quota render as unavailable with appropriate window/source labels; zero remains a distinguishable measured value.
- AC3: Existing Claude-only fixtures and narrow-terminal navigation pass; mixed-provider renders are reviewable through existing screenshot commands.
- AC4: Selecting recovery invokes the shared policy helper with exact source identity and receives the same denial/confirmation behavior as the CLI.

# AC Traceability
- request-AC5 -> This backlog slice. Proof: AC1: Mixed snapshots display correct provider/account for agents, history, usage and interruptions in CLI, watch and both optional widgets.

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
- Rationale: depends on 2.4 and 2.5; recovery action wiring follows 2.6.
