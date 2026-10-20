## task_002_deliver_account_switching_and_session_resume_in_three_steps - Deliver account switching and session resume in three steps
> From version: 1.0.0
> Schema version: 1.0
> Status: Ready
> Understanding: 90%
> Confidence: 85%
> Progress: 0%
> Complexity: Medium
> Theme: Implementation delivery
> Reminder: Update status/understanding/confidence/progress and linked request/backlog references when you edit this doc.

# AI Context
- Summary: (unfilled: replace before this doc is used)
- Keywords: deliver, account, switching, session, resume, three, steps
- Use when: (unfilled: replace before this doc is used)
- Skip when: (unfilled: replace before this doc is used)

# Context
- Orchestrate the scaffolded request chain and keep sibling implementation slices linked.

# Plan
- [ ] 1. 1.1: accounts file, helper and registry scanner with tests.
- [ ] 2. 1.2: guarded relaunch command and block detection; verify with a dry run against cdx.
- [ ] 3. 1.3: crow watch view and no-model mode; render and show the owner before finishing.
- [ ] ADR 009 checkpoint: update affected Logics docs during each meaningful wave and leave the repo commit-ready.
- [ ] Keep commit creation under operator control; do not force one commit per micro-step.
- [ ] GATE: do not close until lint, audit, and scaffold validation pass.

# Backlog
- `item_006_1_1_account_policy_config_and_interrupted_session_registry`
- `item_007_1_2_guarded_relaunch_and_block_detection`
- `item_008_1_3_interrupted_sessions_view_and_no_model_mode`

# Definition of Done (DoD)
- [ ] Generated request, product, backlog, and task docs are present.
- [ ] Context-pack handoff is available when requested.
- [ ] Validation passes.
- [ ] Meaningful waves followed ADR 009: affected docs updated and the repo left commit-ready without automatic commits.

# AC Traceability
- request-AC1 -> `item_006_1_1_account_policy_config_and_interrupted_session_registry`. Proof deferred to slice closeout.
- request-AC2 -> `item_006_1_1_account_policy_config_and_interrupted_session_registry`. Proof deferred to slice closeout.
- request-AC7 -> `item_006_1_1_account_policy_config_and_interrupted_session_registry`. Proof deferred to slice closeout.
- request-AC3 -> `item_007_1_2_guarded_relaunch_and_block_detection`. Proof deferred to slice closeout.
- request-AC4 -> `item_007_1_2_guarded_relaunch_and_block_detection`. Proof deferred to slice closeout.
- request-AC7 -> `item_007_1_2_guarded_relaunch_and_block_detection`. Proof deferred to slice closeout.
- request-AC5 -> `item_008_1_3_interrupted_sessions_view_and_no_model_mode`. Proof deferred to slice closeout.
- request-AC6 -> `item_008_1_3_interrupted_sessions_view_and_no_model_mode`. Proof deferred to slice closeout.

# Validation
- (no validation recorded yet)

# Report
- Not started.

# Links
- Request: `req_001_crow_account_switching_and_session_resume`
- Product brief(s): `prod_002_keep_working_when_an_account_runs_out`
- Architecture decision(s): (none yet)
