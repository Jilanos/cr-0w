## item_002_0_1_quick_ui_wins_in_crow_watch_and_both_panels - 0.1 quick UI wins in crow watch and both panels
> From version: 1.0.0
> Schema version: 1.0
> Status: Ready
> Understanding: 90%
> Confidence: 85%
> Progress: 0%
> Complexity: Medium
> Theme: Hub observability
> Reminder: Update status/understanding/confidence/progress and linked request/task references when you edit this doc.

# AI Context
- Summary: Phase-1 visible fixes: titles in rows, totals row and token split, named Savings section, no busy/max count, usage pill restyle, in crow watch and both QML panels.
- Keywords: quick, wins, crow, watch, both, panels
- Use when: touching the current crow watch usage/agents views or the QML panels before the 0.2 redesign.
- Skip when: new tabs, burn rate or per-tool stats.

# Problem
- rtk, retros and proposals sit next to the key help with no explanation.
- Totals are missing from the sessions table and the token split is not shown.
- Pills and headers repeat the slot count the gauge already shows.

# Scope
- In:
  - Titles in session rows (TUI usage table, agents board, usage panel top sessions, agents panel).
  - Totals row and token split; named Savings section with plain labels.
  - Drop busy/max count; usage pill restyle with renders for approval.
  - Show only non-zero counts in the agents summary line.
- Out:
  - Tabs, burn rate and per-tool savings stats (0.2).

# Acceptance criteria
- AC5: totals row and token split visible in TUI and usage panel.
- AC6: Savings section with plain-language labels in TUI and panel; footer holds key help only.
- AC7: no 'n/m' count next to slot gauges; usage pill restyle approved from renders.
- AC14: qmllint silent; headless renders for normal, low, error, light and grimdark.

# AC Traceability
- request-AC5 -> This backlog slice. Proof: AC5: totals row and token split visible in TUI and usage panel.
- request-AC6 -> This backlog slice. Proof: AC6: Savings section with plain-language labels in TUI and panel; footer holds key help only.
- request-AC7 -> This backlog slice. Proof: AC7: no 'n/m' count next to slot gauges; usage pill restyle approved from renders.
- request-AC14 -> This backlog slice. Proof: AC14: qmllint silent; headless renders for normal, low, error, light and grimdark.

# Decision framing
- Product framing: Not needed
- Architecture framing: Not needed

# Links
- Product brief(s): `prod_001_crow_observability_surfaces`
- Architecture decision(s): (none yet)
- Request: `req_000_crow_watch_and_bar_modules_ui_ux_pass_session_titles_savings_stats`
- Primary task(s): `task_001_deliver_the_crow_ui_ux_pass_in_two_phases`

# Priority
- Priority: High
- Rationale: Set by scaffold input or defaulted for grooming.
