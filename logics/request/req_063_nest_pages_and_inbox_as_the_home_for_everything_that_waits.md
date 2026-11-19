## req_063_nest_pages_and_inbox_as_the_home_for_everything_that_waits - Nest pages and Inbox as the home for everything that waits
> From version: 1.0.0
> Schema version: 1.0
> Status: Ready
> Understanding: 85
> Confidence: 80
> Complexity: High
> Theme: Nest
> Reminder: Update status/understanding/confidence and linked backlog/task references when you edit this doc.
> Indicators reviewed: 2026-11-19 10:59:19

# AI Context
- Summary: Finish the Nest pages the owner hits every day (Ops, Inbox, Reports, MRs, Agenda, Usage, Project page), fix hero labels and planet clicks, and make Inbox the one place for everything that waits on the owner, mail drafts included.
- Keywords: nest, inbox, ops, missions, timeline, mrs, agenda, usage, project page, labels, mail drafts, reports
- Use when: planning or building any Nest page listed here.
- Skip when: the holotable look (req_062), module packaging (req_064).

# Needs
- Planet labels are too small on web; hover misses moon labels; moon labels jump on the phone.
- Planet clicks open Missions, which does not work. Target: the one thing that waits, else a Project page. Circle: moons open members, second planet click opens the group page.
- Missions, MRs and Agenda tabs do not work or are placeholders.
- Inbox becomes the home for everything that waits on the owner: questions, approvals, mail to answer (drafts only), doc, design and decision reviews, report decisions. Reports stays a read-only log.
- Missions becomes Ops (owner 2026-11-19): timeline of everything the owner and crow worked on, what took time, what got stuck; now, queue, run detail, week totals.
- Reports holds settled output: AFK reports once decided or with no decision, ritual outputs with Generate buttons. Run reports live on Ops; review ledgers on MRs.
- Home is the most comfortable place to talk to the butler: own chat width and fold, hero never clips.
- Account gauges open a Usage and token analysis page (deck feature not in Nest).
- Home panels: more useful facts without crowding, phone first.

# Context
- Owner message and decisions 2026-11-17 (AskUserQuestion: planet click, Circle, Inbox scope, order).
- Core already serves `/api/state/{mrs,today,usage,accounts,work}`; most pages are front work.
- Every UI item starts with mockups for the owner (design-choices-ask-first), built one screen at a time.
- Mail is drafts only, never sent (owner prefs). item_179 send step is dropped.
- Page split and order decided 2026-11-19: core data runs in the background while the matching page is built interactively.
- Desk Ready sprint filter (item_247) runs first, in its own session.
- The Nest queue already in flight keeps its order ahead of this list: item_217 owner OK, item_220, item_218, item_210, item_209.

# Acceptance criteria
- AC1: Each listed backlog item is done and its owner OK recorded.
- AC2: No Nest tab shows a placeholder or a dead action.
- AC3: Every item that waits on the owner reaches Inbox with an answer path.

# Definition of Ready (DoR)
- [x] Problem statement is explicit and user impact is clear.
- [x] Scope boundaries (in/out) are explicit.
- [x] Acceptance criteria are testable.
- [x] Dependencies and known risks are listed.

# Companion docs
- Product brief(s): (none yet)
- Architecture decision(s): (none yet)

# References
- `tools/nest/src/hero/Hero.tsx`
- `tools/nest/src/screens/`
- `tools/crow-core/`
- `req_064_paul_s_feedback_and_a_modular_public_crow`

# Backlog
- `item_221_nest_hero_labels_readable_on_web_and_steady_on_phone`
- `item_222_nest_project_page_and_planet_click_routing`
- `item_223_nest_inbox_home_for_everything_that_waits_on_the_owner`
- `item_224_mail_to_answer_and_reply_drafts_in_the_nest_inbox`
- `item_225_nest_mrs_page`
- `item_226_nest_agenda_page`
- `item_227_nest_usage_and_token_analysis_page_from_the_account_gauges`
- `item_228_nest_home_panels_pass_for_phone_and_laptop`
- `item_190_laptop_missions_from_the_approved_missions_board`
- `item_211`
- `item_191_laptop_inbox_layout` (folded into item_223)
- `item_257_core_serves_the_ops_timeline_lanes_and_run_history`
- `item_258_nest_reports_page_for_settled_afk_reports_and_ritual_outputs`
- `item_259_nest_home_butler_chat_with_its_own_width_and_fold_hero_fits_its_frame`

# Execution order
Done: item_230. bg = background run, live = interactive session with the owner.
1. bg Ops data `item_257_core_serves_the_ops_timeline_lanes_and_run_history`
2. live Ops page `item_190_laptop_missions_from_the_approved_missions_board` (after 1)
3. live Home chat and hero fit `item_259_nest_home_butler_chat_with_its_own_width_and_fold_hero_fits_its_frame` (while 1 runs)
4. bg Pending items schema `item_238_pending_items_and_follow_ups_as_one_schema` (req_064)
5. live Inbox kinds, viewers, laptop layout `item_223_nest_inbox_home_for_everything_that_waits_on_the_owner` with `item_191_laptop_inbox_layout` (after 4)
6. live Design review viewer `item_211` under the Inbox kinds
7. live Mail drafts `item_224_mail_to_answer_and_reply_drafts_in_the_nest_inbox`
8. bg AFK report schema `item_233_afk_quota_scheduler_report_languages_and_summary_schema` (req_064)
9. bg Routine scheduling `item_234_routine_scheduling_with_lock_and_retry` (req_064)
10. live Reports page `item_258_nest_reports_page_for_settled_afk_reports_and_ritual_outputs` (after 8, 9)
11. live MRs page with patterns panel `item_225_nest_mrs_page`
12. live Usage page `item_227_nest_usage_and_token_analysis_page_from_the_account_gauges`
13. live Agenda page `item_226_nest_agenda_page`
14. live Hero labels `item_221_nest_hero_labels_readable_on_web_and_steady_on_phone`
15. live Project page and click routing `item_222_nest_project_page_and_planet_click_routing`
16. live Home panels `item_228_nest_home_panels_pass_for_phone_and_laptop`
17. Butler orchestrator items 252, 253, 255 (req_065) once Ops and Inbox are live.

Background whenever a slot is free (max 2): `item_229_take_paul_s_ready_dispatch_and_keep_awake_changes`, `item_235_module_design_for_a_public_crow_bricks_manifest_and_project_kinds`, `item_232_private_skills_from_local_and_capabilities_per_account`, `item_231_review_and_take_paul_s_generic_scripts_and_runbooks`, then `item_236_first_module_split_forge_mrs_optional_and_folder_projects`, `item_237_nest_and_crow_core_as_separate_front_and_back_bricks` (req_064).

# Executions
| When | Runner | Run id | Title | State | PR | Notes |
| --- | --- | --- | --- | --- | --- | --- |
