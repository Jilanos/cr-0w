## item_011_2_2_shared_context_and_enforceable_guard_capabilities - 2.2 Shared context and enforceable guard capabilities
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
Claude memory paths and hooks do not establish equivalent instructions or permissions for Codex. Priority rationale: instructions and guard guarantees must exist before exposing Codex launch paths; depends on 2.1.

# Problem
- Claude memory paths and hooks do not establish equivalent instructions or permissions for Codex.

# Scope
- In:
  - Priority rationale: instructions and guard guarantees must exist before exposing Codex launch paths; depends on 2.1.
  - Inventory provider-independent instructions and memory references; preserve AGENTS.md -> LOGICS.md and existing Claude instructions. Do not overwrite AGENTS.md or generated Logics runtime artifacts with the full CLAUDE.md.
  - Reuse crow-memory private local/ source; choose supported cdx context/memory or bounded launch prompt references for Codex rather than writing a fake Claude memory directory. Include owner preferences and project instructions when available; explicit error for missing required references.
  - Map common crow-hub-guard requirements to tested provider enforcement capabilities. Codex support is enabled only for operations whose guard requirements can be enforced; expose unsupported guarded actions as unavailable until a verified mechanism exists.
  - Use per-launch context handles and locked/reference-counted temporary access for shared accounts, with cleanup on normal exit, signal and failed spawn; leave unrelated files untouched.
- Out:
  - Changing cdx or provider authentication internals.

# Acceptance criteria
- AC1: Synthetic Claude and Codex launches receive the same required repo/task references while retaining their native instruction semantics.
- AC2: Never profiles receive no memory links or context; concurrent shared sessions retain access until the last closes and cleanup is idempotent.
- AC3: A missing enforcement capability blocks the affected operation before provider launch; fixtures prove no permission downgrade or full-access substitution.
- AC4: No private memory body, auth material or actual profile path appears in public diagnostics or committed fixtures.

# AC Traceability
- request-AC8 -> This backlog slice. Proof: AC1: Synthetic Claude and Codex launches receive the same required repo/task references while retaining their native instruction semantics.
- request-AC9 -> This backlog slice. Proof: AC2: Never profiles receive no memory links or context; concurrent shared sessions retain access until the last closes and cleanup is idempotent.

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
- Rationale: instructions and guard guarantees must exist before exposing Codex launch paths; depends on 2.1.
