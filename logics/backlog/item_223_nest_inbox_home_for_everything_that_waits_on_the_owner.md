## item_223_nest_inbox_home_for_everything_that_waits_on_the_owner - Nest Inbox as the home for everything that waits on the owner
> From version: 1.0.0
> Schema version: 1.0
> Status: Ready
> Understanding: 85
> Confidence: 80
> Progress: 0%
> Complexity: High
> Theme: Nest
> Reminder: Update status/understanding/confidence/progress and linked request/task references when you edit this doc.

# AI Context
- Summary: One Inbox for every kind that needs the owner's answer: session questions, approvals, mail to answer, doc, design and decision reviews, and report decisions. Each kind has a viewer. Reports with nothing to decide go to a read-only Reports log.
- Keywords: nest, inbox, kinds, viewer, approvals, reviews, reports, waiting, core
- Use when: adding an Inbox kind, its source in core or its viewer.
- Skip when: the mail draft flow (its own item), the design review viewer details (item_211).

# Problem
- Owner decision 2026-11-17: Inbox is the home for anything that needs an answer; Reports keeps only the read-only log.
- Today Inbox reads questions and missions only. AFK reports, doc reviews and decisions to take live in the vault or in report pages the owner opens by hand.
- Paul's feedback (req_064) asks for the same thing as a 'pending items' file: decisions, follow-ups with due dates, recently settled.

# Scope
- In:
  - Kind model in core: `ask` (session/run question), `approval`, `mail`, `review.design`, `review.doc`, `decision` (a report or plan item that asks a choice), `followup` (waiting on someone, due date). One source adapter per kind, each row carries kind, project, origin, answer route.
  - Report decisions: AFK and run reports (crow-afk-page summary JSON, `Decisions for the owner` blocks) become `decision` rows; answering routes back to the queue or mission.
  - Doc and decision viewer: Markdown and PDF read in-app with an answer box (approve, change, free text) that resumes the asker.
  - Sections: To answer, Waiting on others (followups with due), Done today. Badge counts To answer only.
  - Reports tab becomes the read-only log (AFK nights, rollups, retros) with a link to the matching Inbox rows.
  - Mockups of the Inbox list and the doc/decision viewer (phone and laptop) first; item_191 laptop layout folds into this board.
- Out:
  - Mail drafting (own item). Design compare viewer (item_211). Sending anything outward.

# Acceptance criteria
- AC1: Owner approved the Inbox and viewer boards before the build.
- AC2: An AFK night with 2 decisions yields 2 decision rows in To answer; answering one updates the queue or mission and the row leaves.
- AC3: A Markdown doc registered for review opens readable on 368x812 and 1440x900 and its answer reaches the asker.
- AC4: Reports lists past reports, read-only; none of its entries need an answer.
- AC5: Badge count equals To answer rows on live data.

# AC Traceability
- req_063_nest_pages_and_inbox_as_the_home_for_everything_that_waits-AC -> This backlog slice. Proof: Owner approved the Inbox and viewer boards before the build.

# Dependencies
- item_204 (done), item_208 (done). Paul's report schema fixes (req_064 AFK item) for the decision parser.

# Links
- Request: req_063_nest_pages_and_inbox_as_the_home_for_everything_that_waits.

# Priority
- Priority: High
- Rationale: It is the owner's main daily surface once built.

# Notes
- Supersedes the layout part of item_191; item_211 becomes the design-review kind under this model.

# Executions
| When | Runner | Run id | Title | State | PR | Notes |
| --- | --- | --- | --- | --- | --- | --- |
