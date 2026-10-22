## task_001_deliver_the_crow_ui_ux_pass_in_two_phases - Deliver the crow UI/UX pass in two phases
> From version: 1.0.0
> Schema version: 1.0
> Status: Ready
> Understanding: 90%
> Confidence: 85%
> Progress: 90%
> Complexity: Medium
> Theme: Implementation delivery
> Reminder: Update status/understanding/confidence/progress and linked request/backlog references when you edit this doc.

# AI Context
- Summary: Orchestrates the two-phase delivery of the crow UI/UX pass: 0.1 data fixes and quick wins, 0.2 layout, savings stats and agents board.
- Keywords: deliver, crow, pass, two, phases
- Use when: picking the next step of the crow UI/UX pass.
- Skip when: shell-side archeotech changes.

# Context
- Orchestrate the scaffolded request chain and keep sibling implementation slices linked.

# Plan
- [x] 1. 0.1: fix crow-usage data (synthetic pricing, titles, rtk databases, active state, token split) and update fixtures.
- [x] 2. 0.1: quick UI wins in crow watch and both QML panels; render TUI and panels, show the owner, then commit.
- [x] 3. 0.2: responsive usage overview with tabs and burn rate; show renders before finishing.
- [x] 4. 0.2: tool effectiveness stats and the daily rollup store; Savings tab.
- [ ] 5. 0.2: agents board improvements and the agents panel mirror.
- [x] 6. Update runbooks/archeotech-crow-*.md and module READMEs as behaviour changes.
- [ ] ADR 009 checkpoint: update affected Logics docs during each meaningful wave and leave the repo commit-ready.
- [ ] Keep commit creation under operator control; do not force one commit per micro-step.
- [ ] GATE: do not close until lint, audit, and scaffold validation pass.

# Backlog
- `item_001_0_1_usage_data_correctness_and_session_titles`
- `item_002_0_1_quick_ui_wins_in_crow_watch_and_both_panels`
- `item_003_0_2_responsive_usage_overview_tabs_and_burn_rate`
- `item_004_0_2_tool_effectiveness_stats_and_daily_rollup_store`
- `item_005_0_2_agents_board_improvements`

# Definition of Done (DoD)
- [ ] Generated request, product, backlog, and task docs are present.
- [ ] Context-pack handoff is available when requested.
- [ ] Validation passes.
- [ ] Meaningful waves followed ADR 009: affected docs updated and the repo left commit-ready without automatic commits.

# AC Traceability
- request-AC1 -> `item_001_0_1_usage_data_correctness_and_session_titles`. Proof deferred to slice closeout.
- request-AC2 -> `item_001_0_1_usage_data_correctness_and_session_titles`. Proof deferred to slice closeout.
- request-AC3 -> `item_001_0_1_usage_data_correctness_and_session_titles`. Proof deferred to slice closeout.
- request-AC4 -> `item_001_0_1_usage_data_correctness_and_session_titles`. Proof deferred to slice closeout.
- request-AC5 -> `item_001_0_1_usage_data_correctness_and_session_titles`. Proof deferred to slice closeout.
- request-AC5 -> `item_002_0_1_quick_ui_wins_in_crow_watch_and_both_panels`. Proof deferred to slice closeout.
- request-AC6 -> `item_002_0_1_quick_ui_wins_in_crow_watch_and_both_panels`. Proof deferred to slice closeout.
- request-AC7 -> `item_002_0_1_quick_ui_wins_in_crow_watch_and_both_panels`. Proof deferred to slice closeout.
- request-AC14 -> `item_002_0_1_quick_ui_wins_in_crow_watch_and_both_panels`. Proof deferred to slice closeout.
- request-AC8 -> `item_003_0_2_responsive_usage_overview_tabs_and_burn_rate`. Proof deferred to slice closeout.
- request-AC9 -> `item_003_0_2_responsive_usage_overview_tabs_and_burn_rate`. Proof deferred to slice closeout.
- request-AC12 -> `item_003_0_2_responsive_usage_overview_tabs_and_burn_rate`. Proof deferred to slice closeout.
- request-AC10 -> `item_004_0_2_tool_effectiveness_stats_and_daily_rollup_store`. Proof deferred to slice closeout.
- request-AC11 -> `item_004_0_2_tool_effectiveness_stats_and_daily_rollup_store`. Proof deferred to slice closeout.
- request-AC13 -> `item_005_0_2_agents_board_improvements`. Proof deferred to slice closeout.
- request-AC14 -> `item_005_0_2_agents_board_improvements`. Proof deferred to slice closeout.

# Validation
- (no validation recorded yet)

# Report
- 2026-10-20 0.1 delivered in d710fa8: synthetic pricing fix (Thu was $7 shown vs $92 real), titles (dispatch/haiku/prompt placeholder), rtk summed over 3 homes, live state from session files, token split + week totals; TUI and both panels show titles, totals, split and a SAVINGS section; slot gauges drop n/m; usage pill = gauge + bold % + divider + cost. Open: Haiku titler untested live (sandbox blocks auth) -> owner runs 'crow usage --titles'; strip placement of multi-target plugins is a shell-side fix (handed off).
- 2026-10-21 0.2 on branch night/crow-ui: four views with d/w/m tabs, burn rate + run-out time (HH:MM fix), per-project/model rollups, Savings tab, 30-day rollup store, agents board (context %, waiting first, time in state, cost, open, '?'); owner feedback applied (thicker solid gauges in crow watch and both panels, tall History gives space to the tool table, 'context used' explained in plain words). Tests: view_test incl. tall-shows-every-section; qmllint clean; renders in /tmp/crow-night.
- 2026-10-21 night (branch night/crow-ui-fixes): item_004 AC11 done (finished days frozen in usage-days.json, today and yesterday recomputed; tests/test_crow_usage_store.py); item_005 AC14 row click done (left opens or resumes via crow focus, right copies the id); short gauge bars keep one filled and one empty cell.
- 2026-10-21 night (branch night/watch-ux): design pass. 2-3 options per view rendered (Agents, Usage, interrupted sessions, both panels); option A of each built: triage board (Needs you / Working / Finished / Idle, one line per agent, ctx only from 70 %, limit-stopped sessions from crow-sessions), headroom-first Usage (breakdowns stay in History), both panels mirror it. Comparison and trade-offs: docs/crow-watch-ux-options.md. Tests: view_test (triage order, interrupted rows, nothing-waiting, ctx tag, usage sections); qmllint clean.
- Open: the half-block gauge sits below the label's x-height centre (glyph geometry, needs an owner choice); item_005 AC14 per-session cost in the agents panel waits for the design pass; `crow focus` resume path (cdx --resume) unverified live.

# Notes
## What matters on the board (design pass, 2026-10-21)
crow watch and the two bar panels get glanced at, not studied: the owner opens them to answer four questions, in this order. First, who needs me: a session waiting for a reply, a run that failed, a session stopped by a usage limit that could go on another account. These come first, with how long they have waited. Second, what is working right now: one line per live agent saying what it is doing this minute; the context gauge only matters once a session nears compaction (70 % and up), so below that it can stay out of the row. Third, what finished while I was away: each finished run with its outcome and commit count, plus its report in the details, which is the morning read. Fourth, account headroom: how much of the 5-hour and weekly windows is left, whether the account in use runs out before its reset, and which account the work can move to. Cost is a figure to glance at (today's total, per-agent cost on the row), not a section. Everything else is analysis and belongs in Savings and History, or in the selected row's details: the in/out/cache token split, per-session model names, tool weights, the savings prose, the who-worked-when timeline. Today that analysis crowds the four answers off the first screen. Comparison of the options: [crow watch UX options](../../docs/crow-watch-ux-options.md).

# Links
- Request: `req_000_crow_watch_and_bar_modules_ui_ux_pass_session_titles_savings_stats`
- Product brief(s): `prod_001_crow_observability_surfaces`
- Architecture decision(s): (none yet)
