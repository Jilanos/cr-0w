## item_268_butler_auto_account_skips_codex_accounts - Butler auto account skips Codex accounts
> From version: 1.0.0
> Schema version: 1.0
> Status: In progress
> Understanding: 95
> Confidence: 90
> Progress: 90%
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

# Cause
- crow-core's auto account ran `crow-accounts pick --on-busy fail`, which ranks every allowed account with no runner filter. A Codex account first in the policy was picked.
- Every cdx profile has a `claude-home`, so the launcher's profile check passed and `claude` started on an account with no Claude login.

# Fix
- `crow-accounts pick --provider claude|codex` keeps only accounts on that runner (provider from `cdx status`, claude when cdx does not say), in the usual pick order. Filtered accounts show as `<name>: runs codex` in the reasons. None left: exit 1 with `crow: no allowed account runs claude (...)`.
- crow-core's butler picks with `--provider claude` (`butlerPickArgs`, `butlerPick` in `tools/crow-core/butler_cmd.go`). A failed pick returns `no account can run the butler: <reasons>`.
- No Nest change: the core keeps a start failure as a `note` message (202), `useButler` polls after `say`, and `ButlerRail` renders note text (`tools/nest/src/ui/ButlerRail.tsx:53`).

# AC proofs
- AC1: `tests/test_crow_accounts_pick_provider.py::test_butler_pick_skips_a_codex_account_first_in_the_policy` (Codex first, picks the first claude account) and `::test_butler_pick_keeps_policy_order_among_claude_accounts`. The test reads the args from `butler_cmd.go`, so it runs the exact butler command. `TestButlerPickAsksForAClaudeAccount` checks the Go side passes `--provider claude`.
- AC2: `::test_butler_pick_with_only_codex_accounts_fails_with_the_reason`, `TestButlerPickWithNoClaudeAccountSaysWhy`, and `internal/butler TestAutoPickFailureEndsTheTurnWithANote` (the note reads "butler could not start: auto account: no account can run the butler: ...", turn not busy, no process launched).
- AC3: `go test ./...` and `go vet ./...` in tools/crow-core green (265 tests); `bin/crow-check` green (710 passed).
- Left: restart crow-core to deploy, then confirm on the second user's install with auto account.

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
| 2026-11-19T14:37:22.545098+00:00 | cdx | 28d3b1184ae74e07b014fd29a073839b | item-268-butler-auto | succeeded |  | Steps 1-3 committed on branch item-268-butler-auto; core not restarted |

