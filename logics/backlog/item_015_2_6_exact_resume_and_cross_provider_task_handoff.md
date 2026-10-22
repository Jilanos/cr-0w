## item_015_2_6_exact_resume_and_cross_provider_task_handoff - 2.6 Exact resume and cross-provider task handoff
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
The relaunch path assumes Claude native files and does not distinguish native resume from task transfer. Priority rationale: depends on 2.1, 2.2, 2.3 and 2.4; extends existing task_002 recovery without replacing it.

# Problem
- The relaunch path assumes Claude native files and does not distinguish native resume from task transfer.

# Scope
- In:
  - Priority rationale: depends on 2.1, 2.2, 2.3 and 2.4; extends existing task_002 recovery without replacing it.
  - Migrate interrupted registry additively with provider, account, native conversation id, verified workspace and recovery mode. Legacy records resolve provider through inventory; unresolved identity remains unlaunchable.
  - Keep native resume capability separate from handoff capability: can-resume describes the target native resume strategy and must not incorrectly disqualify a valid cross-provider handoff.
  - For account/provider transfer prepare cdx handoff SOURCE TARGET --source-conversation ID --json in the verified workspace, inspect the preparation envelope, then launch the confirmed target. Duplicate ids require explicit native transcript selection. Never choose latest transcript by mtime.
  - Record confirmed source and target, resulting run/conversation identity and task lineage; preparation alone does not mark resumed. Refuse mutated/missing source, workspace mismatch, forbidden target and non-interactive absent consent. No automatic fallback to notes-only or terminal captures.
- Out:
  - Changing cdx or provider authentication internals.

# Acceptance criteria
- AC1: Claude-to-Codex, Codex-to-Claude and same-provider fixtures recover the explicitly selected source with the intended cwd and target account.
- AC2: Ambiguous/stale/deleted source, workspace mismatch and unsupported contract return a diagnostic and no launch; can-resume fallback-to-last cannot satisfy exact resume.
- AC3: An ask-first target requires explicit consent for each transfer; blocked/never targets are refused and failed launch leaves the source interrupted.
- AC4: Successful target launch records lineage while retaining separate native conversation ids and the original source evidence.

# AC Traceability
- request-AC7 -> This backlog slice. Proof: AC1: Claude-to-Codex, Codex-to-Claude and same-provider fixtures recover the explicitly selected source with the intended cwd and target account.

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
- Rationale: depends on 2.1, 2.2, 2.3 and 2.4; extends existing task_002 recovery without replacing it.
