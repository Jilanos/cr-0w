## item_251_dispatch_slots_and_the_409_refusal_from_nest - Dispatch slots and the 409 refusal from Nest
> From version: 1.0.0
> Schema version: 1.0
> Status: Ready
> Understanding: 90%
> Confidence: 85%
> Progress: 0%
> Complexity: Medium
> Theme: Nest
> Reminder: Update status/understanding/confidence/progress and linked request/task references when you edit this doc.

# AI Context
- Summary: Find and fix why /api/dispatch refused the second Nest dispatch with 409 while 1 of 2 slots were busy; pass the account through dispatch_run.
- Keywords: dispatch, slots, 409, errStale, butler process, account
- Use when: Nest or the butler cannot start a background run.
- Skip when: the mission tick.

# Problem
- 2026-11-19 10:17: the butler's first dispatch_run started (b998ed20); the next two got 409 Conflict with no reason shown. Candidates: the dispatch section was stale right after the first start (liveFail turns errStale into 409), or the crow-butler process counts as a busy slot.
- dispatch_run has no account argument; owner rule: background runs only on the allowed dispatch account.

# Scope
- In:
  - Reproduce with two POST /api/dispatch in a row; fix the cause (refresh the section before the slot check, or retry once on stale; count only crow-dispatched runs as slots).
  - The 409 body names the cause; the butler and Nest show it.
  - `account` on the dispatch_run MCP tool, validated like /api/dispatch.
- Out: account pick policy changes.

# Acceptance criteria
- AC1: Two dispatches 2 s apart both start when two slots are free.
- AC2: The butler process and live sessions do not count as background slots.
- AC3: A refused dispatch returns the cause text; the butler quotes it.
- AC4: dispatch_run with an account starts on that account.

# AC Traceability
- request-AC5 -> AC1 to AC3. Proof: api test with a fake crow-runs.

# Decision framing
- Product framing: Not needed
- Architecture framing: Not needed

# Links
- Request: `req_065_nest_butler_is_the_cr_0w_hub_and_queued_missions_start_on_their_own`
- Architecture decision(s): `adr_001_core_missions_and_inbox_architecture`
- Primary task(s): (none yet)

# Priority
- Priority: High
- Rationale: small fix, unblocks dispatch from Nest today.

# Notes
- Generated locally by logics-manager.

# Executions
| When | Runner | Run id | Title | State | PR | Notes |
| --- | --- | --- | --- | --- | --- | --- |

