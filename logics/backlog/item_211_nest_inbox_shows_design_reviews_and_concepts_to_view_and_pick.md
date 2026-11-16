## item_211_nest_inbox_shows_design_reviews_and_concepts_to_view_and_pick - Nest Inbox shows design reviews and concepts to view and pick
> From version: 1.0.0
> Schema version: 1.0
> Status: Ready
> Understanding: 85%
> Confidence: 80%
> Progress: 0%
> Complexity: Medium
> Theme: General
> Reminder: Update status/understanding/confidence/progress and linked request/task references when you edit this doc.

# AI Context
- Summary: Inbox gets a review kind: design compare pages and concept renders the owner must look at and pick from, viewable and answerable in Nest on phone and laptop.
- Keywords: nest, inbox, design review, compare page, concept, viewer, pick
- Use when: building the Inbox review rows or the in-app viewer for compare pages.
- Skip when: questions and mail rows (item_204), the ask dock fixes (item_208).

# Problem
- Visual picks (compare pages built by bin/crow-compare in the vault Research folder) only open on the laptop browser. On the phone the owner cannot see renders, so every visual decision waits for the laptop (2026-11-15: item_166 boot pick, item_204 Inbox shots).
- Owner decision 2026-11-16: Inbox holds only what the owner reads or answers: questions, mails, design reviews and concepts to view. Reviews are the missing kind.

# Scope
- In:
  - a review source: a compare spec (spec.json from bin/crow-compare) or a concept folder registered as waiting on the owner, served by core with its images.
  - Inbox "To answer" rows of kind review (icon, title, line 2 `review · <item>`), counted in the badge.
  - an in-app viewer: option images side by side on laptop, swipe with flip and zoom on phone, then pick an option (or free text) that answers the waiting session or mission.
- Out:
  - building new renders, the ask dock bugs (item_208), Desk changes.

# Acceptance criteria
- AC1: A compare page waiting on the owner shows as a review row in Inbox To answer and in the badge.
- AC2: Opening it shows every option image readable at 368x812 (swipe, zoom) and at 1440x900 (columns).
- AC3: Picking an option sends the answer back to whoever asked (session, run or mission) and the row leaves Inbox.
- AC4: Mockups approved by the owner before the build.

# AC Traceability
- AC1-AC4 -> this item. Proof: to fill at closeout.

# Decision framing
- Product framing: mockups first (owner pick), one screen at a time.
- Architecture framing: reuse bin/crow-compare spec.json as the source format; core serves the images.

# Links
- Related: item_204 (Inbox rows), item_208 (answering from the phone), item_209 (terminal mode).

# Priority
- Priority: High
- Rationale: every visual pick blocks until the owner is at the laptop.

# Notes
- 2026-11-16: owner asked for "questions, design reviews, mails, viewer for concepts" in Inbox.

# Executions
| When | Runner | Run id | Title | State | PR | Notes |
| --- | --- | --- | --- | --- | --- | --- |
