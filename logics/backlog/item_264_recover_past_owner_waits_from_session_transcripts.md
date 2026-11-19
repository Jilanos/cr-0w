## item_264_recover_past_owner_waits_from_session_transcripts - Recover past owner waits from session transcripts
> From version: 1.0.0
> Schema version: 1.0
> Status: Ready
> Understanding: 80%
> Confidence: 75%
> Progress: 0%
> Complexity: Medium
> Theme: Nest
> Reminder: Update status/understanding/confidence/progress and linked request/task references when you edit this doc.
> Indicators reviewed: 2026-11-19 15:27:47

# AI Context
- Summary: Past days of the Ops answer show owner waits for interactive sessions, read from the session transcripts through crow-usage.
- Keywords: ops, waits, owner, transcripts, crow-usage, interactive, lanes
- Use when: the Ops page needs waits on the owner for days before the state log, or for a day when serve was down.
- Skip when: live waits (the serve tick state log of item_257 covers them), the Ops page layout (item_190).

# Problem
- The ops answer of item_257 marks a lane waiting only while it is live, and the serve tick state log keeps those waits from then on.
- Past days without log lines show gaps as idle. In an interactive session the time between the agent's last message and the owner's next prompt is a wait on the owner, and the transcripts hold both timestamps.

# Owner decisions (2026-11-19)
- A session counts as waiting on the owner once it stays quiet 2 minutes after the agent's last message, until the next owner prompt.

# Scope
- In:
  - crow-usage reads, per interactive session, the end of each agent turn and the next owner prompt, and adds those wait intervals to its JSON output.
  - The ops builder turns those intervals into `waiting` spans on past days, under the state log where both exist.
  - Contract and fixtures for the new crow-usage field; ops tests on a past day with waits.
- Out:
  - Runs (they never wait on a prompt; their stuck and failed states come from crow-runs).
  - The live state log (item_257).

# Acceptance criteria
- AC1: A past day without state log lines shows waiting spans for interactive sessions, from the agent's last message to the next owner prompt.
- AC2: Where the state log has lines, the logged spans still win.
- AC3: crow-usage keeps its current output fields; the new field is additive and covered by the script contract.

# AC Traceability
- `req_063_nest_pages_and_inbox_as_the_home_for_everything_that_waits` AC2 -> This backlog slice. Proof: past Ops days show real waits on the owner.

# Decision framing
- Product framing: Not needed
- Architecture framing: Not needed (additive crow-usage field, same ops merge as the state log)

# Links
- Product brief(s): (none yet)
- Architecture decision(s): (none yet)
- Request: `req_063_nest_pages_and_inbox_as_the_home_for_everything_that_waits`
- Follows: `item_257_core_serves_the_ops_timeline_lanes_and_run_history`
- Primary task(s): (none yet)

# Priority
- Priority: Medium
- Rationale: The state log covers waits from now on; this fills past days and serve downtime.

# Notes
- Open: how long idle at the end of a session still counts as a wait (the owner may simply have left). Decide before building.

# Executions
| When | Runner | Run id | Title | State | PR | Notes |
| --- | --- | --- | --- | --- | --- | --- |
