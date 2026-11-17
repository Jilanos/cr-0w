## item_239_deck_and_nest_tag_accounts_outside_the_policy - Deck and Nest tag accounts outside the policy
> From version: 1.0.0
> Schema version: 1.0
> Status: Ready
> Understanding: 90%
> Confidence: 85%
> Progress: 0
> Complexity: low
> Theme: General
> Reminder: Update status/understanding/confidence/progress and linked request/task references when you edit this doc.

# AI Context
- Summary: The Go deck gauges and Nest quota rows tag cdx accounts missing from local/accounts.yaml as "not in policy", like crow-room and crow-usage do since 2576c09.
- Keywords: deck, nest, gauges, quota, accounts, policy, in_policy
- Use when: changing how the deck or Nest list accounts.
- Skip when: Python views (done in item_230).

# Problem
- item_230 tagged accounts outside the policy in crow-room and crow-usage, and the usage JSON gained an optional `in_policy` flag.
- The deck (`tools/crow-deck/data.go` `gaugeRows`) hides only `never` accounts; an account missing from the policy still gets a gauge with no tag.
- Nest quota rows (`tools/nest/src/data/home.ts` `quotaOf`) may show the same accounts untagged.

# Scope
- In:
  - deck gauges: tag accounts with `in_policy: false` "not in policy" (or dim them), never as an auth error.
  - Nest quota rows: same, if they list such accounts.
- Out:
  - the Python views (done), policy changes.

# Acceptance criteria
- AC1: An account missing from accounts.yaml shows "not in policy" on the deck gauges, with a Go test.
- AC2: Nest quota rows tag or skip it the same way, with a vitest, or the item notes Nest never lists it.

# AC Traceability
- request-AC1 -> item_230 follow-up. Proof: Paul's 401 report covers every view that lists accounts.

# Decision framing
- Product framing: Not needed
- Architecture framing: Not needed

# Links
- Product brief(s): (none yet)
- Architecture decision(s): (none yet)
- Request: `req_064_paul_s_feedback_and_a_modular_public_crow`
- Primary task(s): (none yet)

# Priority
- Priority: Low
- Rationale: Owner-only views; the owner knows the off-policy accounts. Small task for a background run (owner OK 2026-11-17).

# Notes
- Left over from run 207be58c (item_230).

# Executions
| When | Runner | Run id | Title | State | PR | Notes |
| --- | --- | --- | --- | --- | --- | --- |

