## req_064_paul_s_feedback_and_a_modular_public_crow - Paul's feedback and a modular public crow
> From version: 1.0.0
> Schema version: 1.0
> Status: Ready
> Understanding: 85
> Confidence: 80
> Complexity: High
> Theme: General
> Reminder: Update status/understanding/confidence and linked backlog/task references when you edit this doc.
> Indicators reviewed: 2026-11-17 16:53:11

# AI Context
- Summary: Take what Paul built and asked for (feedback 2026-11-17), fix the bugs he hit, and split crow into a core plus optional bricks so another user can install only what fits.
- Keywords: paul, feedback, modules, bricks, public, dispatch, afk, schedule, skills, accounts
- Use when: planning or building anything from Paul's feedback or the module split.
- Skip when: Nest page features (req_063).

# Needs
- Paul's ready changes (dispatch --cwd, --model, configurable permission, keep-awake on WSL) land in the repo.
- The small run bugs he hit every night are fixed with tests.
- His generic scripts and runbooks are triaged: core, module, or left with him.
- Private skills load from local/, accounts declare capabilities, `--account` flag.
- AFK queue runs itself within quota floors; reports parse in French and English; summary schema checked.
- Routines can be scheduled with a lock and retry on Linux and WSL.
- Crow splits into bricks set in one manifest; folder projects work without git; Nest and core ship as front and back bricks.

# Context
- Source: Paul's feedback doc of 2026-11-17; triage note in the vault `CR-0W/Research/paul-feedback-2026-11-17.md`.
- Related: req_047 (hub rules in policy.yaml), item_122 (CROW_HOME), req_051 (publishable engine), req_023 (scheduled jobs, folded into item_234).
- Owner order 2026-11-17: Paul's quick wins first, then the module design, then module items interleaved with Nest items (see req_063 Execution order).

# Acceptance criteria
- AC1: Paul runs his nights on upstream crow with no local patches beyond local/.
- AC2: Every bin/ script and skill belongs to one brick in the ADR.
- AC3: A setup with forge off runs brief, gather, doctor and Nest with no forge error.

# Definition of Ready (DoR)
- [x] Problem statement is explicit and user impact is clear.
- [x] Scope boundaries (in/out) are explicit.
- [x] Acceptance criteria are testable.
- [x] Dependencies and known risks are listed.

# Companion docs
- Product brief(s): (none yet)
- Architecture decision(s): (none yet)

# References
- `bin/crow`
- `bin/crow-runs`
- `bin/crow-afk-page`
- `local/accounts.yaml`
- `req_063_nest_pages_and_inbox_as_the_home_for_everything_that_waits`

# Backlog
- `item_229_take_paul_s_ready_dispatch_and_keep_awake_changes`
- `item_230_fix_the_crow_runs_and_dispatch_bugs_from_paul_s_nights`
- `item_231_review_and_take_paul_s_generic_scripts_and_runbooks`
- `item_232_private_skills_from_local_and_capabilities_per_account`
- `item_233_afk_quota_scheduler_report_languages_and_summary_schema`
- `item_234_routine_scheduling_with_lock_and_retry`
- `item_235_module_design_for_a_public_crow_bricks_manifest_and_project_kinds`
- `item_236_first_module_split_forge_mrs_optional_and_folder_projects`
- `item_237_nest_and_crow_core_as_separate_front_and_back_bricks`
- `item_238_pending_items_and_follow_ups_as_one_schema`

# Execution order
1. Interleaved with req_063; see its Execution order.

# Executions
| When | Runner | Run id | Title | State | PR | Notes |
| --- | --- | --- | --- | --- | --- | --- |
