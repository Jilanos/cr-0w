## item_003_0_2_responsive_usage_overview_tabs_and_burn_rate - 0.2 responsive usage overview, tabs and burn rate
> From version: 1.0.0
> Schema version: 1.0
> Status: Ready
> Understanding: 90%
> Confidence: 85%
> Progress: 0%
> Complexity: High
> Theme: Hub observability
> Reminder: Update status/understanding/confidence/progress and linked request/task references when you edit this doc.

# AI Context
- Summary: Responsive usage overview that fills tall terminals, tabs 1-4 with d/w/m periods, burn rate and projected exhaustion, per-project and per-model rollups.
- Keywords: responsive, usage, overview, tabs, burn, rate
- Use when: reworking the usage view layout or adding pace projections.
- Skip when: data fixes or savings computation.

# Problem
- The usage view is a fixed stack that wastes a tall terminal and has nowhere to put new sections.
- Limits are snapshots with no sense of pace.

# Scope
- In:
  - Overview that stacks sections by priority as height allows; tabs 1-4 with d/w/m periods.
  - Burn rate and projected exhaustion per account.
  - History tab with per-project and per-model rollups.
- Out:
  - Tool savings computation (separate item).

# Acceptance criteria
- AC8: view_test covers tall, wide and small; tall shows every section.
- AC9: burn rate and projected zero time shown when it precedes the reset.
- AC12: per-project and per-model rollups for d/w/m.

# AC Traceability
- request-AC8 -> This backlog slice. Proof: AC8: view_test covers tall, wide and small; tall shows every section.
- request-AC9 -> This backlog slice. Proof: AC9: burn rate and projected zero time shown when it precedes the reset.
- request-AC12 -> This backlog slice. Proof: AC12: per-project and per-model rollups for d/w/m.

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
