## item_225_nest_mrs_page - Nest MRs page
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
- Summary: MRs tab on live `/api/state/mrs`: mine, to review, CI state, threads; each row opens review, threads or the MR on the forge. Optional brick (req_064 modules).
- Keywords: nest, mrs, prs, review, ci, forge, threads
- Use when: building the MRs tab.
- Skip when: the review run itself (deck items 043-048).

# Problem
- The MRs tab shows a placeholder. Core already serves `/api/state/mrs` (crow-mrs) for the deck.

# Scope
- In:
  - Sections: To review (unblock devs first, per priorities), Mine (CI, approvals, threads open), Merged today.
  - Row actions: review (dispatch review run), answer threads (review-threads session), open on forge, open repo session.
  - Mockups first (phone, laptop), reuse the deck MR board layout ideas (item_049/050).
  - Hidden when the forge module is off (req_064).
- Out:
  - Posting comments from Nest (stays a gated action in the review flow).

# Acceptance criteria
- AC1: Owner approved the MRs board first.
- AC2: Rows match `crow-mrs` output on live data for both forges.
- AC3: Each row action works from phone and laptop.

# AC Traceability
- req_063_nest_pages_and_inbox_as_the_home_for_everything_that_waits-AC -> This backlog slice. Proof: Owner approved the MRs board first.

# Dependencies
- Module flag from the module design item (can build before, flag added after).

# Links
- Request: req_063_nest_pages_and_inbox_as_the_home_for_everything_that_waits.

# Priority
- Priority: Medium
- Rationale: Reviews rank second in the owner's priorities.

# Executions
| When | Runner | Run id | Title | State | PR | Notes |
| --- | --- | --- | --- | --- | --- | --- |
