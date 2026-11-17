## item_226_nest_agenda_page - Nest Agenda page
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
- Summary: Agenda tab: today's and the week's meetings from `/api/state/today`, due open threads and follow-ups, MR deadlines; each row actionable.
- Keywords: nest, agenda, calendar, meetings, due, threads
- Use when: building the Agenda tab.
- Skip when: RSVP and slot picking (item_179).

# Problem
- The Agenda tab shows a placeholder. Core script sections (item_169) already read today's meetings.

# Scope
- In:
  - Today and next 7 days: meetings, due threads (Open Threads dates), follow-ups with due dates (Inbox `followup`), release or sprint dates.
  - Row actions: open meeting notes (vault), prep (start a session with the meeting context), snooze a due item.
  - Mockups first (phone, laptop).
- Out:
  - RSVP, slot picker (item_179).

# Acceptance criteria
- AC1: Owner approved the Agenda board first.
- AC2: Today's meetings match the calendar on live data.
- AC3: A due thread shows on its day and can be snoozed.

# AC Traceability
- req_063_nest_pages_and_inbox_as_the_home_for_everything_that_waits-AC -> This backlog slice. Proof: Owner approved the Agenda board first.

# Dependencies
- item_169 core sections (done). Inbox `followup` kind for follow-ups.

# Links
- Request: req_063_nest_pages_and_inbox_as_the_home_for_everything_that_waits.

# Priority
- Priority: Medium
- Rationale: Placeholder tab; data already in core.

# Executions
| When | Runner | Run id | Title | State | PR | Notes |
| --- | --- | --- | --- | --- | --- | --- |
