## task_023_orchestrate_nest_laptop_parity - Orchestrate Nest laptop parity
> From version: 1.0.0
> Schema version: 1.0
> Status: Ready
> Understanding: 90%
> Confidence: 85%
> Progress: 0%
> Complexity: Medium
> Theme: Implementation delivery
> Reminder: Update status/understanding/confidence/progress and linked request/backlog references when you edit this doc.
> Indicators reviewed: 2026-11-19 17:14:02

# AI Context
- Summary: (unfilled: replace before this doc is used)
- Keywords: orchestrate, nest, laptop, parity
- Use when: (unfilled: replace before this doc is used)
- Skip when: (unfilled: replace before this doc is used)

# Context
- Orchestrate the scaffolded request chain and keep sibling implementation slices linked.

# Plan
- [ ] 1. 1. Session chat in the laptop Desk live pane: render options, owner pick, build, live send test.
- [ ] 2. 2. Start an interactive session that lives in Nest: headless tmux start in core, new-session form, open in terminal.
- [ ] 3. 3. Several session chats side by side: render options, owner pick, build with keyboard focus.
- [ ] 4. 4. Laptop Missions from the approved missions boards.
- [ ] 5. 5. Laptop Inbox: render options, owner pick, build.
- [ ] 6. 6. Laptop trial day; gaps become backlog items.
- [ ] 7. Each step runs in a fresh session from its backlog doc; one screen at a time, owner OK before the next.
- [ ] ADR 009 checkpoint: update affected Logics docs during each meaningful wave and leave the repo commit-ready.
- [ ] Keep commit creation under operator control; do not force one commit per micro-step.
- [ ] GATE: do not close until lint, audit, and scaffold validation pass.

# Backlog
- `item_187_session_chat_in_the_laptop_desk_live_pane`
- `item_188_start_an_interactive_session_that_lives_in_nest`
- `item_189_several_session_chats_side_by_side_on_the_laptop`
- `item_190_laptop_missions_from_the_approved_missions_board`
- `item_191_laptop_inbox_layout`
- `item_192_laptop_trial_day_without_terminals`

# Definition of Done (DoD)
- [ ] Generated request, product, backlog, and task docs are present.
- [ ] Context-pack handoff is available when requested.
- [ ] Validation passes.
- [ ] Meaningful waves followed ADR 009: affected docs updated and the repo left commit-ready without automatic commits.

# AC Traceability
- request-AC1 -> `item_187_session_chat_in_the_laptop_desk_live_pane`. Proof deferred to slice closeout.
- request-AC2 -> `item_187_session_chat_in_the_laptop_desk_live_pane`. Proof deferred to slice closeout.
- request-AC4 -> `item_188_start_an_interactive_session_that_lives_in_nest`. Proof deferred to slice closeout.
- request-AC3 -> `item_189_several_session_chats_side_by_side_on_the_laptop`. Proof deferred to slice closeout.
- request-AC5 -> `item_190_laptop_missions_from_the_approved_missions_board`. Proof deferred to slice closeout.
- request-AC6 -> `item_191_laptop_inbox_layout`. Proof deferred to slice closeout.
- request-AC7 -> `item_192_laptop_trial_day_without_terminals`. Proof deferred to slice closeout.

# Validation
- (no validation recorded yet)

# Report
- 2026-11-12: item_187 done (f8cd300). Owner raised AskUserQuestion answers from Nest; filed item_193, runs next before 188.
- item_190: queue actions live (routine pause/resume/run now, AFK edit/skip, mission cancel), week graph, day/week switch keeps the old view dimmed then fades (9e5ba22, 0d7ced9, df1ddd4, 057d80a). Open: panel height snaps on switch (needs JS measure to animate), mission run now/reorder needs a priority and slot-override design, owner review on live data.

# Links
- Request: `req_057_nest_on_the_laptop_replaces_the_owner_s_terminals`
- Product brief(s): `prod_009_nest_laptop_parity`
- Architecture decision(s): (none yet)

# Executions
| When | Runner | Run id | Title | State | PR | Notes |
| --- | --- | --- | --- | --- | --- | --- |

# Notes
- item_190: week view uses the day graph (one 22px row per day, same axis and 08-20/24H toggle) at the owner's request; lanes overlap per day.
