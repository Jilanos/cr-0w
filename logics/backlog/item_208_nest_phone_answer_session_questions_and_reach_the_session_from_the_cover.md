## item_208_nest_phone_answer_session_questions_and_reach_the_session_from_the_cover - Nest phone: answer session questions and reach the session from the cover
> From version: 1.0.0
> Schema version: 1.0
> Status: Done
> Understanding: 90
> Confidence: 90
> Progress: 100%
> Complexity: Medium
> Theme: General
> Reminder: Update status/understanding/confidence/progress and linked request/task references when you edit this doc.

# AI Context
- Summary: on the phone (Fold cover and inner) the owner cannot answer a session's AskUserQuestion and a "tell you" message from the cover never reaches the session.
- Keywords: nest, phone, fold, cover, AskUserQuestion, AskDock, tell you, send, scroll
- Use when: fixing how the phone answers or messages a live session.
- Skip when: the render viewer in the app (separate item).

# Problem
- Seen 2026-11-15 by the owner on the phone, answering the hub session:
  - Cover: the docked AskUserQuestion showed only Cancel, no options.
  - Inner: options showed but the dock did not scroll; with long descriptions the last option and the Other field were out of reach.
  - Cover "tell you" button: Nest said "sent", the session never received the text.
- Seen 2026-11-16 on the phone and on the laptop web Nest (owner):
  - Assistant text written in the same turn as a tool call (text, then Bash or AskUserQuestion) shows in the terminal but not in the Nest chat. Text that ends a turn shows.
  - Shift+Enter in the send box sends the message instead of adding a new line (laptop web): a one-letter message "a" went out by mistake.
  - Owner messages arrive with stray digits in front ("123what's…", "1ok…"): likely option-digit keys from the ask dock left in the session's input line.

# Scope
- In:
  - Reproduce each bug on a hidden tmux session with a 4-question AskUserQuestion carrying long descriptions, at cover 368x812 and inner 707x691.
  - Cover renders the options (item_193 option cards) and the Other field.
  - The ask dock scrolls inside the viewport on every layout; submit and Other stay reachable.
  - "tell you" delivers to the session or shows the real error; "sent" only after core confirms delivery.
- Out:
  - Viewing images and renders in the app.

# Acceptance criteria
- AC1: Cover shows every option of a session's AskUserQuestion and answers it (single, multi, Other).
- AC2: On inner and cover a long 4-question ask scrolls; the last option and Other are tappable.
- AC3: A "tell you" message from the cover lands in the session; a failed delivery shows an error, never "sent".
- AC4: Every assistant text block of a turn shows in the Nest chat on every layout (laptop web, inner, cover), including text before a tool call.
- AC5: On every layout, answering an ask from Nest leaves no stray keys in the session's input; the next typed message arrives clean.
- AC6: Shift+Enter adds a new line in the send box on every layout; Enter sends; a multi-line message reaches the session with its line breaks.
- AC7: Live test on a hidden tmux session at 1440x900, 707x691 and 368x812; tsc, vitest, pytest, go test pass.

# Links
- Builds on item_193 (AskUserQuestion buttons) and item_170 (free text send).

# Priority
- Priority: High
- Rationale: the owner answers sessions from the phone; both paths failed in real use.

# Notes
- 2026-11-16: owner decision: a send shows 'sending' until the message appears in the session transcript, then 'delivered'. Build in the follow-up run.
- 2026-11-16: delivery built (bde0836): chat box and cover Tell it show "sending…" until a new user turn in the transcript holds the text (whitespace and line breaks fold, so a multi-line send matches one turn), then "delivered"; after 20 s "not delivered" with Retry. Reads reuse the chat's 3 s conversation poll; the cover watches only while a send is open. vitest covers sending to delivered, timeout and multi-line. Live test pending (AC7).
- 2026-11-16: live test passed on a hidden tmux Haiku session through a branch core: multi-line send arrived as one message and showed "delivered"; text before a Bash call showed in the chat; permission approved from Nest; 4-question ask (single, multi, Other, last option) answered exactly at 368x812, 707x691 and 1440x900 with a clean prompt after. Found and fixed: ask options shrank in the scroll body and clipped their descriptions (de6ac0c). Shots in the vault Research/nest-design/item_208/live. No Go changes, go test not needed.
- Raised by the owner 2026-11-16. Until fixed, hub sessions keep AskUserQuestion text short when the owner is on the phone.
- Root causes (2026-11-16):
  - Cover ask: Desk.tsx `Ask` rendered `prompt.options` only, which an AskUserQuestion carries as [Cancel]; `prompt.questions` was ignored and the ask styles applied to `.chat-cv` only.
  - Ask scroll: `.ask` was `flex:none` with no max-height or overflow, so a long dock grew past the viewport on every layout.
  - Tell you: `crow-focus --send` typed into the window whatever the session state and replied "sent"; while the session waited on the AskUserQuestion the text went into the dialog. A failed kitty or tmux command crashed instead of reporting.
  - Text before a tool call: not found in the static path (cdx reader, crow-runs, core, `blocksOf` keep every text block); needs a live capture of `GET /api/sessions/<pid>/conversation` next to the transcript.
  - Stray digits: `crow-prompt answer` checked the prompt against Claude's status file, which lags the dialog; a second answer (double tap, retry) passed the check and typed the option digits into the input line.
  - Shift+Enter: the send boxes were single-line inputs that submit on Enter, and `crow_term` typed line breaks as keystrokes, each one a submit.

# Executions
| When | Runner | Run id | Title | State | PR | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11-16T09:12:21.209101+00:00 | cdx | 38e5ab90330d4d4b8f63ed7a6fc6a79d | item_208 delivery confirmed | succeeded |  |  |
| 2026-11-16T09:08:29.022026+00:00 | cdx | b845f64b011c4f3887df1cf253ccd86d | item_208 delivery confirmed | failed |  | limit |
| 2026-11-16T08:55:53.031352+00:00 | cdx | f470e8459fa84b08a9854288f6916e80 | item_208 Nest chat fixes | succeeded |  |  |
