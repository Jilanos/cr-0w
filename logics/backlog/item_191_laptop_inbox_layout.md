## item_191_laptop_inbox_layout - Laptop Inbox layout
> From version: 1.0.0
> Schema version: 1.0
> Status: Ready
> Understanding: 90%
> Confidence: 85%
> Progress: 0%
> Complexity: Medium
> Theme: Nest
> Reminder: Update status/understanding/confidence/progress and linked request/task references when you edit this doc.
> Indicators reviewed: 2026-11-19 10:59:19

# AI Context
- Summary: Laptop layout of the Inbox: list, reading pane and inline answer. Folded into item_223 (Inbox kinds and viewers); build both together.
- Keywords: laptop, inbox, layout
- Use when: building the Inbox page on the laptop, with item_223.
- Skip when: the inbox kinds model in core (item_238).

# Problem
- Inbox on the laptop renders the Fold inner layout and has no laptop board.

# Scope
- In:
  - Render laptop Inbox options (list plus reading pane plus answer, using the width) and get the owner's pick.
  - Build the picked layout on live data, inline answer and hide kept from item_168.
- Out:
  - Mail and calendar items (item_179).

# Acceptance criteria
- The owner approved a rendered laptop Inbox board before the build.
- Answering and hiding work from the laptop as on the Fold.
- Compare page of the build vs the board gets the owner's OK.

# AC Traceability
- request-AC6 -> This backlog slice. Proof: The owner approved a rendered laptop Inbox board before the build.

# Decision framing
- Product framing: Not needed
- Architecture framing: Not needed

# Links
- Product brief(s): `prod_009_nest_laptop_parity`
- Architecture decision(s): (none yet)
- Request: `req_057_nest_on_the_laptop_replaces_the_owner_s_terminals`
- Primary task(s): `task_023_orchestrate_nest_laptop_parity`

# Priority
- Priority: Medium
- Rationale: Set by scaffold input or defaulted for grooming.

# Executions
| When | Runner | Run id | Title | State | PR | Notes |
| --- | --- | --- | --- | --- | --- | --- |
