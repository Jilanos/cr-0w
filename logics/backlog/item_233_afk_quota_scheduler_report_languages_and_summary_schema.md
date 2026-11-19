## item_233_afk_quota_scheduler_report_languages_and_summary_schema - AFK quota scheduler, report languages and summary schema
> From version: 1.0.0
> Schema version: 1.0
> Status: Ready
> Understanding: 85
> Confidence: 80
> Progress: 0%
> Complexity: High
> Theme: General
> Reminder: Update status/understanding/confidence/progress and linked request/task references when you edit this doc.

# AI Context
- Summary: `crow queue run` launches queued AFK jobs by itself: picks the account under floors per 5h and week window, waits for resets, aims for a target left at a given hour. Report section titles become configurable (French and English parsed), and the AFK summary JSON gets a documented schema checked on load.
- Keywords: afk, queue, scheduler, quota, floors, reports, language, schema
- Use when: changing the AFK queue, crow-afk-page or the summary JSON.
- Skip when: the afk skill's question phase.

# Problem
- Paul made 9 launch decisions and 4 timed wake-ups by hand on the 16-17/11 night (§4.4). Floors live as text in queue.md.
- crow-afk-page only knows English headings; French reports lose their sections. The summary JSON KeyErrors without `end` tz and `q`.

# Scope
- In:
  - Queue config: per account floors (5h %, week %), end target (`60% of 5h left at 09:00`), max parallel.
  - `crow queue run`: loop reading `cdx status`, launching the next eligible job on the best account, sleeping until the next reset or job end; log every decision.
  - Heading map in config (`reports.headings`) with en and fr defaults; parser uses it.
  - JSON schema for the AFK summary in `logics/specs/script_contract`; load errors name the missing key.
  - Report decisions feed the Inbox `decision` kind.
- Out:
  - Merging job branches (stays a hub step).

# Acceptance criteria
- AC1: A dry-run night with 5 jobs and 2 accounts launches in the right order without manual steps and never under a floor.
- AC2: A French report renders its sections in crow-afk-page.
- AC3: A summary missing `q` fails with a message naming it.

# AC Traceability
- req_064_paul_s_feedback_and_a_modular_public_crow-AC -> This backlog slice. Proof: A dry-run night with 5 jobs and 2 accounts launches in the right order without manual steps and never under a floor.

# Dependencies
- Paul's code item (permission, model flags).

# Links
- Request: req_064_paul_s_feedback_and_a_modular_public_crow.

# Priority
- Priority: Medium
- Rationale: Frees the hub during nights for both users.

# Executions
| When | Runner | Run id | Title | State | PR | Notes |
| --- | --- | --- | --- | --- | --- | --- |
