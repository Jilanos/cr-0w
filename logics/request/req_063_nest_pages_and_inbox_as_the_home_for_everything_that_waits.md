## req_063_nest_pages_and_inbox_as_the_home_for_everything_that_waits - Nest pages and Inbox as the home for everything that waits
> From version: 1.0.0
> Schema version: 1.0
> Status: Ready
> Understanding: 85
> Confidence: 80
> Complexity: High
> Theme: Nest
> Reminder: Update status/understanding/confidence and linked backlog/task references when you edit this doc.

# AI Context
- Summary: Finish the Nest pages the owner hits every day (Missions, MRs, Agenda, Usage, Project page), fix hero labels and planet clicks, and make Inbox the one place for everything that waits on the owner, mail drafts included.
- Keywords: nest, inbox, missions, mrs, agenda, usage, project page, labels, mail drafts, reports
- Use when: planning or building any Nest page listed here.
- Skip when: the holotable look (req_062), module packaging (req_064).

# Needs
- Planet labels are too small on web; hover misses moon labels; moon labels jump on the phone.
- Planet clicks open Missions, which does not work. Target: the one thing that waits, else a Project page. Circle: moons open members, second planet click opens the group page.
- Missions, MRs and Agenda tabs do not work or are placeholders.
- Inbox becomes the home for everything that waits on the owner: questions, approvals, mail to answer (drafts only), doc, design and decision reviews, report decisions. Reports stays a read-only log.
- Account gauges open a Usage and token analysis page (deck feature not in Nest).
- Home panels: more useful facts without crowding, phone first.

# Context
- Owner message and decisions 2026-11-17 (AskUserQuestion: planet click, Circle, Inbox scope, order).
- Core already serves `/api/state/{mrs,today,usage,accounts,work}`; most pages are front work.
- Every UI item starts with mockups for the owner (design-choices-ask-first), built one screen at a time.
- Mail is drafts only, never sent (owner prefs). item_179 send step is dropped.
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

# Execution order
1. Paul's ready code `item_229_take_paul_s_ready_dispatch_and_keep_awake_changes` (req_064)
2. Run bugs `item_230_fix_the_crow_runs_and_dispatch_bugs_from_paul_s_nights` (req_064)
3. Hero labels `item_221_nest_hero_labels_readable_on_web_and_steady_on_phone`
4. Project page and click routing `item_222_nest_project_page_and_planet_click_routing`
5. Module design ADR `item_235_module_design_for_a_public_crow_bricks_manifest_and_project_kinds` (req_064)
6. Inbox kinds model and viewers `item_223_nest_inbox_home_for_everything_that_waits_on_the_owner`
7. Private skills and account capabilities `item_232_private_skills_from_local_and_capabilities_per_account` (req_064)
8. Missions `item_190_laptop_missions_from_the_approved_missions_board`
9. Mail drafts `item_224_mail_to_answer_and_reply_drafts_in_the_nest_inbox`
10. Paul's scripts intake `item_231_review_and_take_paul_s_generic_scripts_and_runbooks` (req_064)
11. Design review viewer `item_211` under the Inbox kinds
12. AFK quota scheduler `item_233_afk_quota_scheduler_report_languages_and_summary_schema` (req_064)
13. Usage page `item_227_nest_usage_and_token_analysis_page_from_the_account_gauges`
14. Schedule, lock, retry `item_234_routine_scheduling_with_lock_and_retry` (req_064)
15. MRs page `item_225_nest_mrs_page`
16. Agenda page `item_226_nest_agenda_page`
17. Pending items `item_238_pending_items_and_follow_ups_as_one_schema` (req_064)
18. Home panels `item_228_nest_home_panels_pass_for_phone_and_laptop`
19. First module split `item_236_first_module_split_forge_mrs_optional_and_folder_projects` (req_064)
20. Nest and core bricks `item_237_nest_and_crow_core_as_separate_front_and_back_bricks` (req_064)

# Executions
| When | Runner | Run id | Title | State | PR | Notes |
| --- | --- | --- | --- | --- | --- | --- |
