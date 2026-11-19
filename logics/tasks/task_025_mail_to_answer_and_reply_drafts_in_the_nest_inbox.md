## task_025_mail_to_answer_and_reply_drafts_in_the_nest_inbox - Mail to answer and reply drafts in the Nest Inbox
> From version: 1.0.0
> Schema version: 1.0
> Status: In progress
> Understanding: 90%
> Confidence: 85%
> Progress: 60%
> Complexity: Medium
> Theme: Implementation delivery
> Reminder: Update status/understanding/confidence/progress and linked request/backlog references when you edit this doc.
> Owner: second user
> Indicators reviewed: 2026-11-19 18:09:16

# AI Context
- Summary: Backend slice of item_224: a generic reply-draft pipeline (`bin/crow-mail-draft`) with a backend switch (graph, com, connector), one input file per draft and a shared post-write check. The com backend drives classic Outlook from WSL through a fixed PowerShell action list that never exposes Send.
- Keywords: mail, reply, drafts, backend, outlook com, graph, connector, post-write check, never send
- Use when: changing the draft pipeline, a mail backend or the post-write check.
- Skip when: Nest pages and Inbox rows (later slices of item_224), calendar, send.

# Definition of Done (DoD)
- [ ] The backlog scope is implemented.
- [ ] Acceptance criteria are covered.
- [ ] Validation passes.
- [ ] Meaningful waves followed ADR 009: affected docs updated and the repo left commit-ready without automatic commits.

# Backlog
- `item_224_mail_to_answer_and_reply_drafts_in_the_nest_inbox`

# Scope of this task
- In: `bin/crow-mail-draft` (save, check, probe, inbox, delete-draft), `bin/crow-mail-draft-com.ps1`, `local/mail.yaml` config (`draft_backend: graph | com | connector`), example config, runbook, tests.
- Out: Nest UI pages and Inbox rows, the drafter run of item_092, Send (never), calendar.

# Acceptance criteria
- AC1: A mail that needs an answer shows in Inbox with its thread readable in full.
- AC2: Draft a reply → editable draft in Nest → Save draft → the draft is in the mailbox Drafts folder with the edited text; nothing is sent.
- AC3: Post-write check flags a missing signature or attachment.
- AC4: Backend switch in config; the graph backend works on the owner's mailbox.

# Plan
- [ ] Use `python3 -m logics_manager flow progress task task_025_mail_to_answer_and_reply_drafts_in_the_nest_inbox.md --progress <n>%` during multi-wave work.
- [ ] Run `python3 -m logics_manager flow finish task task_025_mail_to_answer_and_reply_drafts_in_the_nest_inbox.md` after implementation.

# Validation
- `uv run --no-project --with pytest --with pyyaml --with markdown pytest -q tests/`: 791 passed, 4 failed. The same 4 fail on a clean origin/main 1569e72 (crow-routine has no brick, dispatch sandbox and mission tests); none touch mail.
- `tests/test_crow_mail_draft.py`: 21 passed, including the two tests that run the PowerShell bridge (signature stripping, unknown action refused).
- `bin/crow-check --fast`: green.
- Live, classic Outlook on the second user's profile, 2026-11-19: `probe` connected; one reply-all draft on an internal message (3 internal recipients) with a text attachment; all six checks ok; independent `draft` readback: in Drafts, not sent, 1 signature, no `_MailAutoSig`, attachment present; deleted by EntryID, no longer in Drafts.

# Report
- Built `bin/crow-mail-draft` (save, check, probe, inbox, delete-draft) with `draft_backend: graph | com | connector` in `local/mail.yaml` (`docs/mail.example.yaml`), one draft file per reply (message id, mode, html or text, signature rule, cc, attachments), and one backend-independent post-write check.
- `bin/crow-mail-draft-com.ps1` is ported from the second user's tested panel bridge: fixed action list (probe, inbox, body, conversation, reply, draft, delete_draft), JSON request file, no Send, one attempt per write, lost answers reported uncertain.
- Duplicate signature: Outlook ReplyAll inserts the automatic signature. The bridge drops it before inserting the reply; `signature_once` counts the configured signature outside the quote and `no_native_signature` fails on any `_MailAutoSig` bookmark left in the draft.
- AC proofs: AC2 backend part (draft lands in Drafts with the given text, nothing sent) proved live on com. AC3 proved by tests (missing signature, duplicated signature, missing attachment) and live. AC4 config switch done; graph backend built and tested against a fake Graph only.
- Left for later slices: Inbox rows and the Nest draft flow (AC1, AC2 UI part), the graph live proof on the owner's mailbox.

# Questions for the upstream owner
- Graph drafts need `Mail.ReadWrite`; `docs/graph.example.yaml` lists `Mail.Read`. Can the owner's app get it, and will the owner run the graph live proof (AC4)?
- `crow-today draft` already writes a Graph reply with a plain comment. Keep both, or route it through `crow-mail-draft`?
- Signatures are text lines. The second user's panel also adds an external image signature (cid). Wanted in the engine?
- Nest hook: which core route should call `crow-mail-draft save` (next slice)?
- The 4 failing tests on origin/main above.

# Links
- Request: `req_063_nest_pages_and_inbox_as_the_home_for_everything_that_waits`
- Product brief(s): (none yet)
- Architecture decision(s): (none yet)

# Executions
| When | Runner | Run id | Title | State | PR | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11-19T17:18:15.864370+00:00 | second user | item-224-com | Outlook COM backend and draft pipeline | succeeded | https://github.com/Jilanos/cr-0w/tree/item-224-com | crow-mail-draft + COM bridge; live COM draft created, checked, deleted |

