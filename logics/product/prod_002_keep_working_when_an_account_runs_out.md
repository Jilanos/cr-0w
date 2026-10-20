## prod_002_keep_working_when_an_account_runs_out - Keep working when an account runs out
> Date: 2026-10-20
> Status: Proposed
> Related request: `req_001_crow_account_switching_and_session_resume`
> Related backlog: `item_006_1_1_account_policy_config_and_interrupted_session_registry`, `item_007_1_2_guarded_relaunch_and_block_detection`, `item_008_1_3_interrupted_sessions_view_and_no_model_mode`
> Related task: `task_002_deliver_account_switching_and_session_resume_in_three_steps`
> Related architecture: (none yet)
> Reminder: Update status, linked refs, scope, decisions, success signals, and open questions when you edit this doc.

# Overview
crow tracks which accounts the owner may use, notices a blocked account, and relaunches cut-off sessions on an allowed one after confirmation, from a terminal view.

# Goals
- Never lose a session to a usage limit.
- Switch accounts with one confirmation and never touch a forbidden one.
- Stay useful from the hub when no tokens are left.

# Non-goals
- Changing cdx.
- Automatic switching without confirmation.
- Using a local model as orchestrator (measured separately first).

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
- Product back-reference: `req_001_crow_account_switching_and_session_resume`
- Task back-reference: `task_002_deliver_account_switching_and_session_resume_in_three_steps`
