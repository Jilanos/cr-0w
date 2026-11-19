## item_254_butler_context_cap_wrap_and_fresh_start - Butler context cap, wrap and fresh start
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
- Summary: The long-lived butler hub session watches its context, wraps at the cap and restarts fresh from the open threads, keeping the chat history in Nest.
- Keywords: context cap, wrap, crow-ctx, fresh start, open threads
- Use when: the butler session grows past 120k.
- Skip when: per-turn cost.

# Problem
- A hub session with full tools grows fast; the hub rule caps sessions at 150k and asks for /wrap then a fresh start. The butler runs for days in one conversation.

# Scope
- In:
  - Core reads the butler's context from its stream usage; past 120k it asks the butler to run the wrap skill, then starts a new session and seeds it from the open threads and the last few chat lines.
  - Nest keeps showing one continuous chat with a "fresh start" divider.
- Out: transcript search.

# Acceptance criteria
- AC1: Past 120k the butler wraps and the next owner message lands in a new session under 20k.
- AC2: Open threads written by the wrap are read by the new session's first answer.

# AC Traceability
- request-AC6 -> AC1, AC2. Proof: fake stream with inflated usage.

# Decision framing
- Product framing: Not needed
- Architecture framing: Not needed

# Links
- Request: `req_065_nest_butler_is_the_cr_0w_hub_and_queued_missions_start_on_their_own`
- Architecture decision(s): `adr_001_core_missions_and_inbox_architecture`
- Primary task(s): (none yet)

# Priority
- Priority: Medium
- Rationale: needed within days of item_252 going live.

# Notes
- Generated locally by logics-manager.

# Executions
| When | Runner | Run id | Title | State | PR | Notes |
| --- | --- | --- | --- | --- | --- | --- |

