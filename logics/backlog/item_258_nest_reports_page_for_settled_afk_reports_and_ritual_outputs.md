## item_258_nest_reports_page_for_settled_afk_reports_and_ritual_outputs - Nest Reports page for settled AFK reports and ritual outputs
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
- Summary: Nest Reports page: AFK reports once their decisions are taken or when they have none, and ritual outputs (brief, daily, weekly, retro, eod) with a Generate button per ritual.
- Keywords: nest, reports, afk, rituals, brief, daily, weekly, retro, eod, generate
- Use when: building the Reports tab.
- Skip when: questions and decisions that wait (Inbox, item_223), single run reports (Ops, item_190).

# Problem
- The Reports tab renders a placeholder.
- Owner 2026-11-19: Inbox holds everything that waits; Reports holds what is settled. Run reports are too detailed for Reports and live on Ops.

# Scope
- In:
  - List of AFK reports whose decisions are all taken, or that carry none. A report with open decisions shows in Inbox until answered, then moves here.
  - Ritual outputs from the vault (brief, daily, weekly, retro, eod), newest first, filter by ritual.
  - Generate button per ritual: starts the ritual as a background run through core, shows it running, then the new output.
  - Reader pane: rendered Markdown, link to the vault note.
  - Mockups first (phone, laptop), owner picks before the build.
- Out:
  - Run reports (Ops). Review ledgers (MRs page, item_225).
  - Sending anything (daily to Confluence, mails) stays a gated step in the ritual.

# Acceptance criteria
- AC1: Owner approved the Reports board before the build.
- AC2: An AFK report with an open decision is in Inbox and not here; once answered it shows here.
- AC3: Each Generate button starts its ritual and the output appears when done.
- AC4: Works on 368x812 and on the laptop.

# AC Traceability
- `req_063_nest_pages_and_inbox_as_the_home_for_everything_that_waits` AC2 -> This backlog slice. Proof: Reports tab has no placeholder and no dead action.

# Decision framing
- Product framing: Not needed
- Architecture framing: Not needed

# Links
- Request: `req_063_nest_pages_and_inbox_as_the_home_for_everything_that_waits`
- Depends on: `item_233_afk_quota_scheduler_report_languages_and_summary_schema` (report summary schema), `item_234_routine_scheduling_with_lock_and_retry` (Generate runs a routine)

# Priority
- Priority: Medium
- Rationale: Settled output, read after Ops and Inbox.

# Executions
| When | Runner | Run id | Title | State | PR | Notes |
| --- | --- | --- | --- | --- | --- | --- |
