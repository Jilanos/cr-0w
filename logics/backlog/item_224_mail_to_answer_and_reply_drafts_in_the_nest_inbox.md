## item_224_mail_to_answer_and_reply_drafts_in_the_nest_inbox - Mail to answer and reply drafts in the Nest Inbox
> From version: 1.0.0
> Schema version: 1.0
> Status: In progress
> Understanding: 90
> Confidence: 85
> Progress: 40%
> Complexity: Medium
> Theme: Nest
> Reminder: Update status/understanding/confidence/progress and linked request/task references when you edit this doc.
> Indicators reviewed: 2026-11-19 18:09:16

# AI Context
- Summary: Mail that needs an answer shows in Inbox; the owner asks for a draft, reads and edits it in Nest, and crow saves it as a draft in the mailbox. Never sends. Backend is configurable so Paul's M365 setup and the owner's Graph setup both work.
- Keywords: nest, inbox, mail, draft, reply, graph, m365, backend, never send
- Use when: building mail rows, the draft flow or a mail backend.
- Skip when: calendar actions (item_179 keeps them), Teams.

# Problem
- The owner answers mail in Outlook or a terminal session; item_179 and item_092 planned the pieces but nothing is built.
- Owner rule: mail is drafts only, never sent, even when asked to reply. item_179 planned a `send` step; it is dropped here.
- Paul built the same flow by hand (hub skeleton, worka formatting, post-write checks) and asks for a generic draft pipeline with a configurable backend (req_064).

# Owner decisions (2026-11-19)
- The second user builds the Outlook COM backend (from WSL), next to Graph on a branch from main and sends a patch; review it here like item_229.

# Scope
- In:
  - Mail rows in Inbox (kind `mail`): sources from `crow-today` (`/api/state/today`), rule file `local/mail-rules.md` (item_091) decides what needs an answer.
  - Draft pipeline: input one file per draft (message id, body, tone, signature, attachments); backend adapter (`graph` via crow-today, `connector` hub session, `codex-app`); post-write check (body visible, one signature, attachments present).
  - Nest: mail detail, 'Draft a reply' (starts a small run from item_092), draft shown editable, 'Save draft' writes it to the mailbox and the row moves to Done.
  - Background drafter of item_092 feeds the same rows.
- Out:
  - Send. Calendar and RSVP (item_179). Teams.

# Acceptance criteria
- AC1: A mail that needs an answer shows in Inbox with its thread readable in full.
- AC2: Draft a reply → editable draft in Nest → Save draft → the draft is in the mailbox Drafts folder with the edited text; nothing is sent.
- AC3: Post-write check flags a missing signature or attachment.
- AC4: Backend switch in config; the graph backend works on the owner's mailbox.

# AC Traceability
- req_063_nest_pages_and_inbox_as_the_home_for_everything_that_waits-AC -> This backlog slice. Proof: A mail that needs an answer shows in Inbox with its thread readable in full.

# Dependencies
- Inbox kind model item. item_091 rules file. Graph scopes check (item_179 note).

# Links
- Request: req_063_nest_pages_and_inbox_as_the_home_for_everything_that_waits.

# Priority
- Priority: High
- Rationale: Mail is the biggest daily answer load and has no flow yet.

# Notes
- Merges the draft parts of item_179 and item_092; those items keep calendar and the timer.

# Executions
| When | Runner | Run id | Title | State | PR | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11-19T17:18:15.712328+00:00 | second user | item-224-com | Outlook COM backend and draft pipeline | succeeded | https://github.com/Jilanos/cr-0w/tree/item-224-com | crow-mail-draft + COM bridge; live COM draft created, checked, deleted |

# Tasks
- `task_025_mail_to_answer_and_reply_drafts_in_the_nest_inbox`
