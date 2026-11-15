## item_179_mail_and_calendar_actions_from_nest - Mail and calendar actions from Nest
> From version: 1.0.0
> Schema version: 1.0
> Status: Ready
> Understanding: 90%
> Confidence: 80%
> Progress: 0%
> Complexity: High
> Theme: General
> Reminder: Update status/understanding/confidence/progress and linked request/task references when you edit this doc.

# AI Context
- Summary: from the Work screen, read a flagged mail in full, ask a write mission for a reply draft, approve it on the exact text to send, and accept, decline or move a meeting, all through `crow-today` and Microsoft Graph.
- Keywords: mail, calendar, graph, crow-today, reply draft, approval, accept, decline, slot
- Use when: building mail or calendar actions.
- Skip when: the read-only Work list (item_172).

# Problem
- Nest will list mail and meetings (item_172) but the owner still answers them in Outlook or a terminal session.

# Scope
- In:
  - `crow-today` subcommands with `--json` (item_173 contract): `mail ID` (body), `reply ID --text-file F` (draft only), `send DRAFT`, `rsvp EVENT accept|decline|tentative [--note]`, `slots --with A,B --len 30`.
  - Check the Graph scopes `crow-today login` holds (Mail.ReadWrite, Mail.Send, Calendars.ReadWrite) before building; re-login if missing.
  - "Draft a reply" starts a write mission with the thread as input; its draft becomes an approval (item_175, action `mail`); send runs only on Approve with the hash check.
  - RSVP is a confirmation tap, not a text approval, unless a note is attached (then approval on the note).
  - Nest: mail detail, reply flow, meeting row actions, slot picker.
- Out:
  - Teams messages. Inbox rules. Bulk triage.

# Acceptance criteria
- AC1: A flagged mail opens in full in Nest.
- AC2: A drafted reply is sent only after Approve on the exact text; the sent mail matches it.
- AC3: Accept and decline update the meeting in Outlook.
- AC4: The slot finder returns free slots shared with the named people.

# AC Traceability
- request-AC3 -> AC1, AC2, AC3, AC4. Proof: mail and calendar from the phone under the hard rules.

# Decision framing
- Product framing: Not needed (prod_005 hard rules)
- Architecture framing: Not needed (scripts stay the single source)

# Links
- Request: `req_055_a_work_day_from_nest_without_a_terminal`
- Depends on: `item_172_nest_work_and_system_screens_on_the_deck_sources`, `item_175_work_approvals_given_from_nest_on_the_exact_text`, `item_173_deck_scripts_get_a_stable_json_contract_for_the_app`
- Primary task(s): `task_021_orchestrate_a_work_day_from_nest`

# Priority
- Priority: Medium
- Rationale: daily need, but reading already works in Outlook.

- 2026-11-15 owner: mail lives in Inbox (approved board item_138 fold-inbox: To answer, Drafts ready, FYI), not on a Work screen. Mail detail, reply and send flows go in Inbox.

# Executions
| When | Runner | Run id | Title | State | PR | Notes |
| --- | --- | --- | --- | --- | --- | --- |
