## req_000_crow_watch_and_bar_modules_ui_ux_pass_session_titles_savings_stats - crow watch and bar modules: UI/UX pass, session titles, savings stats
> From version: 1.0.0
> Schema version: 1.0
> Status: Draft
> Understanding: 90%
> Confidence: 85%
> Complexity: High
> Theme: Hub observability
> Reminder: Update status/understanding/confidence and linked backlog/task references when you edit this doc.
> Indicators reviewed: 2026-10-20 17:47:34

# AI Context
- Summary: Fix crow usage data (synthetic pricing, account-named titles, split rtk databases), give every session a Haiku title, surface per-tool savings, and lay the usage view out responsively with tabs; mirror it in the archeotech bar panels.
- Keywords: crow, watch, bar, modules, pass, session, titles, savings, stats
- Use when: changing crow-usage/crow-runs JSON, the crow watch TUI, or the archeotech crow-agents/crow-usage modules.
- Skip when: the change is to archeotech-shell itself (strip placement of plugins) or to dispatch/run lifecycle.

# Needs
- The usage numbers must be right before they are worth designing around: today's cost and the 7-day chart currently undercount, and every session is titled with the account name.
- Each session needs a short human title so 'top sessions today' says what the tokens were spent on instead of listing 'cr-0w' eight times.
- Information that matters (tool savings, retros, proposals) must be visible and labelled in plain words, not tucked next to the key help.
- The owner wants to judge whether each token-saving tool (rtk, prompt cache, model routing, scripts) pays off, with numbers that can be tracked over time.
- The usage view must use the space of a tall or vertical terminal without hiding things in sub-menus, and still degrade cleanly on small terminals.
- Redundant UI should go: a gauge that already shows 1 of 2 slots doesn't need '1/2' next to it.

# Context
- crow watch is a Bubble Tea TUI (tools/crow-watch) with an agents view fed by `crow-runs json` every 2 s and a usage view fed by `crow-usage --json` every 30 s. Colours are ANSI slots only and the view must fill the terminal exactly (view_test.go).
- The archeotech bar modules (integrations/archeotech/crow-agents, crow-usage) are QML: a bar pill plus a panel, each with a singleton store polling the same commands. They use injected theme tokens only, no hex literals in crow-usage.
- crow-usage scans every cdx profile transcript, caches per-file totals by (mtime, size), prices with cdx's price table and reads limits from `cdx status --json` and savings from `rtk gain --format json`.
- Bug: a session containing any `<synthetic>` model message gets cost null, which counts as $0 in day totals (8 of 48 sessions this week, one of them 29.7M tokens).
- Bug: cdx writes `custom-title` and `agent-name` equal to the account name, so `title` is 'main' for 47 of 48 sessions. Transcripts also carry `last-prompt` and the real user messages.
- Bug: cdx sandboxes HOME, so rtk inside sessions writes to the profile's own history.db while the bar (real HOME) reads ~/.local/share/rtk/history.db; the two surfaces can disagree.
- Usage 'active' is mtime < 120 s while the agents board uses process state, so the two views can disagree about what is live.
- Owner decisions: Haiku-generated titles cached by session id; usage view = responsive overview that stacks every section that fits plus tabs 1-4 (Overview, Sessions, Savings, History) for drill-down with d/w/m periods; pills keep gauge plus percentage on usage, drop the count on agents; phased delivery with renders shown after each phase.
- Out of scope: placing multi-target plugins on a strip is blocked shell-side (archeotech-shell EditOverlay dedupes library tiles by id; ShellConfig._contentToStrip rejects plugin ids). Handed off to the archeotech-shell session.

# Acceptance criteria
- AC1: Session cost ignores `<synthetic>` and other unpriced pseudo-models instead of voiding the session; a session is unpriced only when a real model has no price, and day totals flag unpriced sessions rather than silently counting $0.
- AC2: Every session in `crow-usage --json` and every session agent in `crow-runs json` has a `title`: the dispatch label for runs, otherwise a 3-6 word Haiku title generated from the first user prompts, cached by session id in local/state and refreshed when the session has grown substantially; titles never block a poll (generation is async and bounded per poll).
- AC3: rtk savings are read from every rtk history database (real HOME and each cdx profile) and summed, so the TUI and the bar show the same numbers.
- AC4: Usage 'active' agrees with the agents board for sessions the board knows about.
- AC5: The usage payload splits tokens into input, output, cache write and cache read per session and per day, and exposes week totals; the TUI and panel show a totals row and the split.
- AC6: Savings and retros get a named section with plain labels (e.g. 'rtk: 58k tokens trimmed from command output today', 'retros: 2 sessions reviewed today, 0 suggestions awaiting your OK'), moved out of the key-help footer.
- AC7: The agents pill and panel header drop the 'busy/max' count next to the slot gauge; the usage pill keeps gauge plus percentage with a cleaner look shown as renders before it is merged.
- AC8: The usage view is a responsive overview that stacks limits, today, savings, sessions and history as space allows (tall terminals show everything), with tabs 1-4 for full-size drill-down and d/w/m period keys; view_test covers tall, wide and small sizes.
- AC9: Limits show burn rate over the last hour and, when the current pace runs out before the reset, the projected time the limit hits zero.
- AC10: A Savings tab reports per tool: rtk (tokens saved, %, parse-failure rate, time overhead, weakest commands), prompt cache ($ saved vs uncached), model routing ($ saved vs the same tokens on the top model), compactions, and tokens returned per tool/MCP server, per day and per period.
- AC11: A daily rollup store keeps immutable past days so history and savings trends survive transcript cleanup; only today is recomputed.
- AC12: Per-project and per-model rollups are available in the History tab.
- AC13: The agents board shows context as a % of the model window with 70/85 % thresholds, sorts waiting sessions first with time-in-state, shows per-session cost, offers open/attach actions (crow term) and moves key help behind '?'.
- AC14: Both archeotech panels mirror the new data (titles, totals, savings section) within their width, lint clean with qmllint, and are verified with the existing headless render harness without touching the live shell.

# Definition of Ready (DoR)
- [x] Problem statement is explicit and user impact is clear.
- [x] Scope boundaries (in/out) are explicit.
- [x] Acceptance criteria are testable.
- [x] Dependencies and known risks are listed.

# Companion docs
- Product brief(s): `prod_001_crow_observability_surfaces`
- Architecture decision(s): (none yet)

# References
- tools/crow-watch/main.go
- tools/crow-watch/usage.go
- tools/crow-watch/view_test.go
- bin/crow-usage
- bin/crow-runs
- integrations/archeotech/crow-agents/CrowAgents.qml
- integrations/archeotech/crow-agents/CrowStore.qml
- integrations/archeotech/crow-usage/CrowUsage.qml
- integrations/archeotech/crow-usage/CrowUsageStore.qml
- runbooks/archeotech-crow-agents.md
- runbooks/archeotech-crow-usage.md

# Backlog
- `item_001_0_1_usage_data_correctness_and_session_titles`
- `item_002_0_1_quick_ui_wins_in_crow_watch_and_both_panels`
- `item_003_0_2_responsive_usage_overview_tabs_and_burn_rate`
- `item_004_0_2_tool_effectiveness_stats_and_daily_rollup_store`
- `item_005_0_2_agents_board_improvements`
