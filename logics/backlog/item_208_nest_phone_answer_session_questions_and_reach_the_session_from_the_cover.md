## item_208_nest_phone_answer_session_questions_and_reach_the_session_from_the_cover - Nest phone: answer session questions and reach the session from the cover
> From version: 1.0.0
> Schema version: 1.0
> Status: Ready
> Understanding: 90
> Confidence: 75
> Progress: 0%
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
- AC6: Live test on a hidden tmux session at 1440x900, 707x691 and 368x812; tsc, vitest, pytest, go test pass.

# Links
- Builds on item_193 (AskUserQuestion buttons) and item_170 (free text send).

# Priority
- Priority: High
- Rationale: the owner answers sessions from the phone; both paths failed in real use.

# Notes
- Raised by the owner 2026-11-16. Until fixed, hub sessions keep AskUserQuestion text short when the owner is on the phone.

# Executions
| When | Runner | Run id | Title | State | PR | Notes |
| --- | --- | --- | --- | --- | --- | --- |
