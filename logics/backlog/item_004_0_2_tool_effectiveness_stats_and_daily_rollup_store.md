## item_004_0_2_tool_effectiveness_stats_and_daily_rollup_store - 0.2 tool effectiveness stats and daily rollup store
> From version: 1.0.0
> Schema version: 1.0
> Status: In progress
> Understanding: 90%
> Confidence: 85%
> Progress: 85%
> Complexity: High
> Theme: Hub observability
> Reminder: Update status/understanding/confidence/progress and linked request/task references when you edit this doc.

# AI Context
- Summary: Per-tool savings metrics (rtk, prompt cache, model routing, compactions, tokens per tool/MCP) and a daily rollup store with immutable past days.
- Keywords: tool, effectiveness, stats, daily, rollup, store
- Use when: measuring whether a token-saving tool pays off or extending usage history.
- Skip when: pure UI layout work.

# Problem
- There is no way to tell whether rtk, prompt caching, model routing or crow scripts pay for themselves.
- History disappears when transcripts are cleaned up.

# Scope
- In:
  - Per-tool metrics computed in crow-usage from transcripts and rtk databases.
  - Daily rollup store in local/state with immutable past days.
  - Savings tab in crow watch and a compact savings block in the usage panel.
- Out:
  - Exporting stats outside the hub.

# Acceptance criteria
- AC10: Savings tab lists rtk, prompt cache, model routing, compactions and tokens per tool/MCP for the selected period.
- AC11: past days are read from the rollup store, only today is recomputed, and history extends past the transcript window.

# AC Traceability
- request-AC10 -> This backlog slice. Proof: AC10: Savings tab lists rtk, prompt cache, model routing, compactions and tokens per tool/MCP for the selected period.
- request-AC11 -> This backlog slice. Proof: AC11: past days are read from the rollup store, only today is recomputed, and history extends past the transcript window.

# Decision framing
- Product framing: Not needed
- Architecture framing: Not needed

# Links
- Product brief(s): `prod_001_crow_observability_surfaces`
- Architecture decision(s): (none yet)
- Request: `req_000_crow_watch_and_bar_modules_ui_ux_pass_session_titles_savings_stats`
- Primary task(s): `task_001_deliver_the_crow_ui_ux_pass_in_two_phases`

# Priority
- Priority: Medium
- Rationale: Set by scaffold input or defaulted for grooming.
