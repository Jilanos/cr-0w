## item_228_nest_home_panels_pass_for_phone_and_laptop - Nest Home panels pass for phone and laptop
> From version: 1.0.0
> Schema version: 1.0
> Status: Ready
> Understanding: 85
> Confidence: 80
> Progress: 0%
> Complexity: Medium
> Theme: Nest
> Reminder: Update status/understanding/confidence/progress and linked request/task references when you edit this doc.

# AI Context
- Summary: Rework the Home panels around the hero so they show the most useful next facts (what waits, what runs, what is due) without crowding, phone first.
- Keywords: nest, home, panels, phone, laptop, layout, density
- Use when: changing Home panels.
- Skip when: the hero table and labels.

# Problem
- Owner 2026-11-17: Home panels could be more useful without overcrowding, especially on the phone.
- Home was approved as pass 3b option D (item_171) before Inbox, Project, Agenda and Usage pages existed; panels can now link into them.

# Scope
- In:
  - Audit current panels on live data (what each shows, how often it is empty or stale).
  - Two or three board options per device: one-line summaries with counts that open the new pages (Inbox, Agenda, Usage, Project).
  - Phone: at most what fits above the fold under the hero; the rest one swipe away.
  - Build the picked option one screen at a time.
- Out:
  - Hero changes.

# Acceptance criteria
- AC1: Owner picked a board per device before the build.
- AC2: Each panel row opens its page.
- AC3: No panel shows more than N lines on 368x812 (N set in the picked board).

# AC Traceability
- req_063_nest_pages_and_inbox_as_the_home_for_everything_that_waits-AC -> This backlog slice. Proof: Owner picked a board per device before the build.

# Dependencies
- Project, Inbox, Agenda and Usage pages built (panels link to them).

# Links
- Request: req_063_nest_pages_and_inbox_as_the_home_for_everything_that_waits.

# Priority
- Priority: Medium
- Rationale: Best done after the pages it links to exist.

# Executions
| When | Runner | Run id | Title | State | PR | Notes |
| --- | --- | --- | --- | --- | --- | --- |
