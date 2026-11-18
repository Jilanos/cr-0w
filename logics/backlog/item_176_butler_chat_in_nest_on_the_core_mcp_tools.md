## item_176_butler_chat_in_nest_on_the_core_mcp_tools - Butler chat in Nest on the core MCP tools
> From version: 1.0.0
> Schema version: 1.0
> Status: Ready
> Understanding: 80%
> Confidence: 70%
> Progress: 0%
> Complexity: High
> Theme: General
> Reminder: Update status/understanding/confidence/progress and linked request/task references when you edit this doc.
> Indicators reviewed: 2026-11-18 13:47:43

# AI Context
- Summary: a chat in Nest with the butler (CR-0W persona), run by the req_032 engine: one long-lived `claude -p` stream-json process per conversation, core MCP tools only, a core bridge that streams replies to Nest. The butler starts missions first, and sessions or dispatch only when asked.
- Keywords: butler, chat, orchestrator, claude -p, stream-json, mcp, core bridge, nest
- Use when: building the butler conversation or its core bridge.
- Skip when: chat inside one run (item_177), persona text (item_118).

# Problem
- Every request to crow today starts with a terminal hub session. The owner wants to talk to the orchestrator from Nest (2026-11-10). The engine is decided (req_032, owner 2026-11-07) but nothing runs it.

# Scope
- In:
  - Core bridge: start, keep and stop one butler process per conversation; `POST /api/butler/<conv>/say`, replies streamed over SSE (item_146) with a polling fallback; transcript kept in core state; one process idles out after 30 min and resumes from the transcript.
  - Flags per req_032: `--tools "" --strict-mcp-config --allowedTools "mcp__core__*" --permission-mode dontAsk`, on an account allowed by the cdx policy.
  - Account choice (owner 2026-11-16): `say` takes `account?`; the core validates it with `s.account` (never and unknown are 400, empty = auto pick). A conversation keeps its account until the owner changes it; a change restarts the process on the new account and resumes from the transcript. The chat input reuses Desk `AccountField` (allowed accounts, default auto).
  - Desk ask box: free text (not /dispatch, /session) goes to the butler conversation and replaces the "Free chat with CR-0W: later" reply in `submitAsk`.
  - Core MCP server exposes the item_169 reads and the item_147/170 actions. Missions first: `mission.new` with a kind, then session and dispatch.
  - Any action that needs a tap (confirmation, approval) becomes an inbox item. The butler never confirms for the owner.
  - Persona from item_118 ("Sir", formal and calm).
  - Nest placement (owner 2026-11-12, replaces the 2026-11-10 Home-only plan):
    - Laptop: an always-on butler rail on the right of every screen (about 320px): small hero on top whose mood follows core state (item_158 order fail > ask > run > idle, so it reacts to sessions and runs, not only to the chat), the typed butler line, the transcript, the input. A hotkey folds it to a thin strip (hero head + mood dot). On Home the rail hides its hero; the holotable hero is the full scene.
    - Phone and Fold: no rail. A mini hero badge in the header shows the mood and opens the chat. Home keeps the approved D layout (text box under the holotable, reply in the holotable line).
    - Action chips the butler proposes (tap = the same core action) show in the transcript.
    - First step: render 2-3 rail boards (rail width, folded strip, hero size, Home without duplicate hero, phone badge) and get the owner's pick before any build. The rail footprint also feeds the item_189 side-by-side board.
- Out:
  - Voice. Several parallel butler conversations in the UI (one is enough at first). Butler editing files directly.

# Acceptance criteria
- AC1: "Start a review of api!412" in Nest creates a review mission; the reply links it.
- AC2: "What's running?" answers from the core sections, matching Home.
- AC3: An action that needs approval lands in the inbox; the butler says so and nothing runs before the tap.
- AC4: Closing Nest and coming back an hour later shows the same conversation; the next message continues it.
- AC5: The butler process has no tool outside `mcp__core__*` (checked from its init event).
- AC6: The owner approved rendered rail boards before the build; on the laptop the rail shows on every screen, folds by hotkey, and its hero mood changes when a run starts or a session asks.
- AC7: The chat lets the owner pick an allowed account (default auto); the butler process runs on it (checked from its launch args), and the core refuses never and unknown accounts.
- AC8: Free text in the Desk ask box reaches the butler; no "later" reply remains.

# AC Traceability
- request-AC1 -> AC1, AC2, AC3, AC5. Proof: talk to the orchestrator from the phone under the same rules.

# Decision framing
- Product framing: Not needed (prod_005, req_032)
- Architecture framing: Not needed (req_032 decided the engine)

# Links
- Product brief(s): `prod_005_crow_jarvis_layer`
- Request: `req_055_a_work_day_from_nest_without_a_terminal`
- Depends on: `item_169_core_serves_every_deck_source_as_read_only_sections`, `item_170_core_actions_on_live_sessions_and_dispatch_runs`, `item_146_section_change_stream_over_sse_with_a_polling_fallback`
- Related: `item_118_butler_persona_file_steward_with_a_droid_flavour`, `req_032_spike_butler_engine_and_persona`
- Primary task(s): `task_021_orchestrate_a_work_day_from_nest`

# Priority
- Priority: High
- Rationale: the main surface the owner asked for.

# Notes
- 2026-11-18 boards approved (vault `Research/nest-design/item_176/design-notes.md`, pages `options/round2.html`, `options/round3.html`):
  - Laptop: rail A, hero on top (320px rail, 240px hero block) showing the whole droid with no background box. The Desk "Ask CR-0W" panel goes; Live sessions takes its space. Alt+B folds to a 56px strip. Home rail has no hero.
  - Phone: badge top left before the wordmark. Typing in the bottom Ask box opens the chat sheet; on other tabs the badge opens it.
  - Phone Home: cover is D plus the Desk Ask bar under the holotable. Fold inner is G: HUD row, big centred holotable, Ask bar, then Needs you and Running in two columns. Source `home-phone/mockup.html?v=G`.
  - Cyber versions approved 18/11 (round 4, `options/round4.html`). Ready to build.
- Owner 2026-11-18 (slice 2 build):
  - Fold key is Ctrl+B (Alt+B clashed).
  - Home: the rail is pinned as the right column. Always open, no fold key, no hero line (the hero says it already). The mood label stays.
  - Home left column: Needs you (top 3, then "N more in Inbox"), Next event, Running. MRs and reports join as one-line counts once their live data exists. No placeholders, no duplicated info.
  - The hero stays the main thing on Home; the rest is toned down. Panel boxes and frames stay.
- Owner 2026-11-16 (header gauges hand-off): free chat needs an account choice like /dispatch and /session.
- Owner 2026-11-10: "when i talk to the butler i want the hero to respond". Placement on Home under the holotable, transcript on Desk. Layout base: item_171 approved design D.

- Owner 2026-11-12: on the laptop Home is rarely open, so the hero must be visible while working → butler rail on every laptop screen, badge on phone.
- Progress 2026-11-18: slice 2 built 2c7b7a1 (laptop rail, Home pinned rail), head clip fix 9a86b3d. Open: slice 3 (phone badge + sheet, cover D + Ask bar, Fold inner G); the rail chat opens without scrolling to the bottom (scroll likely runs before the head lays out).
- Owner 2026-11-18 (slice 3 build): the cover header hides the theme button and the clock at 368px. The Fold inner chat keeps the 380px right side panel. The hub makes the board compares.
- Progress 2026-11-18: slice 3 built on branch item-176-s3. Rail chat opens at the bottom d0f4ab4 (each message is observed). Phone badge + chat sheet 58190f6. Home cover D + Ask bar 19f54aa. Fold inner G 86c876a. Shots in vault `Research/nest-design/item_176/build-s3/`. Open: the head inside the Desk Ask box waits for the item_246 Desk rewrite.


# Executions
| When | Runner | Run id | Title | State | PR | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11-18T15:45:56.241856+00:00 | cdx | 1ecba0382a11411cb668ead8ded4746f | item_176-s3b | running |  |  |

