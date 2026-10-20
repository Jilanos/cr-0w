## prod_001_crow_observability_surfaces - crow observability surfaces
> Date: 2026-10-20
> Status: Proposed
> Related request: `req_000_crow_watch_and_bar_modules_ui_ux_pass_session_titles_savings_stats`
> Related backlog: `item_001_0_1_usage_data_correctness_and_session_titles`, `item_002_0_1_quick_ui_wins_in_crow_watch_and_both_panels`, `item_003_0_2_responsive_usage_overview_tabs_and_burn_rate`, `item_004_0_2_tool_effectiveness_stats_and_daily_rollup_store`, `item_005_0_2_agents_board_improvements`
> Related task: `task_001_deliver_the_crow_ui_ux_pass_in_two_phases`
> Related architecture: (none yet)
> Reminder: Update status, linked refs, scope, decisions, success signals, and open questions when you edit this doc.

# Overview
crow watch and the archeotech bar modules are the owner's window on agents, usage limits and spend. This pass makes their numbers trustworthy, names every session, surfaces what each token-saving tool is worth, and lays the usage view out to use a tall terminal without burying information.

# Goals
- Trustworthy cost, token and savings numbers across all cdx accounts.
- Every session identifiable at a glance by a short title.
- Per-tool savings tracked over time so tools can be kept or dropped on evidence.
- A usage view that shows everything that fits and drills down without hiding essentials.
- Bar pills that carry no redundant text.

# Non-goals
- Changing archeotech-shell itself (strip placement fix is a separate hand-off).
- Budgets or hard stops on dispatch.
- A web dashboard or OpenTelemetry export.
- Account load-balancing or automatic account switching.

# Scope and guardrails
- In: scaffolded request, product, backlog, orchestration task, validation, and handoff context.
- Out: unrelated workflow docs and implementation of generated tasks.

# Key product decisions
- Use structured input as the source of truth for generated docs.
- Keep generated write paths local and repo-bounded.

# Success signals
- Generated docs pass lint and audit without broad manual rewrites.
- Context-pack output can be handed to an implementation agent directly.

# References
- Product back-reference: `req_000_crow_watch_and_bar_modules_ui_ux_pass_session_titles_savings_stats`
- Task back-reference: `task_001_deliver_the_crow_ui_ux_pass_in_two_phases`
