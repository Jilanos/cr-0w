## item_005_0_2_agents_board_improvements - 0.2 agents board improvements
> From version: 1.0.0
> Schema version: 1.0
> Status: In progress
> Understanding: 90%
> Confidence: 85%
> Progress: 85%
> Complexity: Medium
> Theme: Hub observability
> Reminder: Update status/understanding/confidence/progress and linked request/task references when you edit this doc.

# AI Context
- Summary: Agents board: context % bar 70/85, waiting first with time-in-state, per-session cost, open via crow term, '?' help; mirrored in the agents panel.
- Keywords: agents, board, improvements
- Use when: changing the crow watch agents view or the crow-agents panel.
- Skip when: usage view or data-layer work.

# Problem
- Raw context token counts don't say how full the window is.
- Waiting sessions don't stand out, live sessions show no cost, and there is no way to jump into a session.

# Scope
- In:
  - Context % bar with 70/85 thresholds, waiting-first sort with time-in-state, per-session cost.
  - Open/attach action via crow term; key help behind '?'.
  - Same data in the agents panel.
- Out:
  - Killing or forking sessions.

# Acceptance criteria
- AC13: board shows context %, waiting first with time-in-state, per-session cost, open action and '?' help.
- AC14: agents panel mirrors it, lint clean, verified with headless renders.

# AC Traceability
- request-AC13 -> This backlog slice. Proof: AC13: board shows context %, waiting first with time-in-state, per-session cost, open action and '?' help.
- request-AC14 -> This backlog slice. Proof: AC14: agents panel mirrors it, lint clean, verified with headless renders.

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
