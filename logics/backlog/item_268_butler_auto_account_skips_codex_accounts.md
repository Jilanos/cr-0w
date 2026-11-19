## item_268_butler_auto_account_skips_codex_accounts - Butler auto account skips Codex accounts
> From version: 1.0.0
> Schema version: 1.0
> Status: Ready
> Understanding: 70
> Confidence: 70
> Progress: 0%
> Complexity: Small
> Theme: General
> Reminder: Update status/understanding/confidence/progress and linked request/task references when you edit this doc.

# AI Context
- Summary: In Nest, the butler on the auto account picks a Codex account and never starts. With a claude account chosen by hand it answers. Auto must pick only accounts whose runner can drive the butler.
- Keywords: butler, nest, auto account, codex, claude, crow-core
- Use when: fixing the butler start on a second user's install.
- Skip when: the owner has only claude accounts.

# Problem
- Reported by a second user (2026-11-19): auto account chooses a Codex account; the butler turn does not start and shows no error.

# Scope
- In:
  - `butler.Pick` (tools/crow-core/internal/butler) keeps only accounts whose runner the butler supports (claude today), in policy order.
  - No eligible account: the turn fails with a clear message in the rail, not a silent stall.
  - Test with a mixed account list (Codex first).
- Out:
  - Butler on Codex.

# Acceptance criteria
- AC1: With a Codex account first in the policy, auto picks the first claude account.
- AC2: With only Codex accounts, the rail shows "no account can run the butler" and the turn ends.
- AC3: crow-core tests and crow-check pass.

# AC Traceability
- req_064_paul_s_feedback_and_a_modular_public_crow-AC1 -> This backlog slice. Proof: the butler starts on a second user's install with auto account.

# Dependencies
- None.

# Links
- Request: `req_064_paul_s_feedback_and_a_modular_public_crow`

# Priority
- Priority: High
- Rationale: Butler broken for the second user.

# Executions
| When | Runner | Run id | Title | State | PR | Notes |
| --- | --- | --- | --- | --- | --- | --- |
