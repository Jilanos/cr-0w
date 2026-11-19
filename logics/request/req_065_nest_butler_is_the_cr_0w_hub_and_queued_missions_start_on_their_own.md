## req_065_nest_butler_is_the_cr_0w_hub_and_queued_missions_start_on_their_own - Nest butler is the CR-0W hub and queued missions start on their own
> From version: 1.0.0
> Schema version: 1.0
> Status: Draft
> Understanding: 85
> Confidence: 75
> Complexity: High
> Theme: Nest
> Reminder: Update status/understanding/confidence and linked backlog/task references when you edit this doc.
> Indicators reviewed: 2026-11-19 10:29:55

# AI Context
- Summary: The Nest butler becomes a real CR-0W hub session (cr-0w folder, CLAUDE.md, skills, Bash, crow CLI, hooks) driven from Nest, and queued core missions start without a hand-run tick.
- Keywords: nest, butler, hub session, stream-json, permission relay, mission tick, dispatch slots, 409
- Use when: changing how the butler chat runs, what it can do, or how queued missions get admitted.
- Skip when: Nest layouts (req_057), persona wording only (item_118).

# Needs
- Owner, 2026-11-19: "I want butler to be CR-0W hub, not some random tool. It needs to be as smart as you, know everything about all my projects and run everything else. Today it forces me to keep a hub session open on the side, so back to the terminal."
- Owner, 2026-11-19: the butler orchestrates more than it works. It knows everything and starts the right run or session; repo work happens there.
- Owner, 2026-11-19: the butler chat rail is too thin to read; make it resizable.
- Owner, 2026-11-19: asked the butler to run review threads on !235 and !239 and find why their pipelines were red. It queued two missions that never started, told the owner crow would pick them up, then retracted.
- Queued missions must start on their own when slots are free.
- Starting background work from Nest must not fail with an unexplained 409.

# Context
- Today (req_032, option A): `claude -p` stream-json in the butler state folder (XDG state crow-butler), an empty folder outside every repo, persona from tools/crow-core/internal/butler/persona.md, only the core MCP tools (brief, usage, mission_get, mission_new, session_new, dispatch_run). No CLAUDE.md, owner-prefs, runbooks, skills, Bash or crow CLI. It cannot check its own claims.
- `crow-core tick` admits queued missions, but nothing calls it: item_133 left "the service loop calls it every 2 min" to slice 3 and no item owns it. Every queued mission waits forever.
- Phase gate: the tick only starts kinds with phase <= 1 (LivePhase in internal/mission/tick.go). review-fix (own MR threads) is phase 2, build and repair phase 3. The butler cannot know this.
- Missions linked by `crow mission ensure` (handoffs, dispatch) show `running` with no core run, which reads as running work.
- /api/dispatch refused the second run with 409 while the dispatch section said 1 of 2 busy. Either the live section was stale (liveFail maps errStale to 409) or the butler's own process counts as a slot (`crow-runs list` shows crow-butler under Background runs).
- `dispatch_run` drops the account although /api/dispatch accepts one; owner rule: background runs only on the allowed dispatch account.
- Background runs could not read GitLab: glab was not in the run allowlist and `glab api` is denied. Fixed 2026-11-19: bin/crow-forge-read (GET only: threads, pipeline, trace) and read-only glab ci/mr commands in the task and review kinds (bin/crow_lib.py _FORGE_READ).
- Nest already answers permission prompts of live sessions (item_177: POST /api/sessions/{pid}/answer, chat with answer buttons). req_057 makes laptop Nest drive headless sessions.

# Acceptance criteria
- AC1: A mission queued from Nest or the CLI starts within 2 minutes when a slot is free and its kind is live, with no manual `crow core tick`. A mission whose kind is not live is refused at creation with the reason.
- AC2: The butler chat runs as a hub session in the cr-0w folder: it reads CLAUDE.md, owner-prefs, runbooks and skills, runs Bash and the crow CLI, and the hub hooks (hub-guard, commit-msg) apply as in a terminal session.
- AC3: When the butler needs a permission or a hub-guard OK, the prompt shows in the Nest chat and the owner answers it there; nothing waits silently.
- AC4: Asked "start review threads and check the red pipelines on my MRs", the butler starts the work and reports run ids and accounts that exist, with no terminal open.
- AC5: Two dispatches in a row from Nest both start when two slots are free; a refusal names its cause.
- AC7: Delegated work reports back into the chat when it ends.
- AC8: The butler chat width is adjustable on the laptop.
- AC6: The butler keeps under the context cap: it wraps and restarts fresh from the open threads without the owner losing the chat.

# Scope
- In: tick loop in the core service; dispatch slot accounting and 409 causes; account on dispatch_run; butler process as a hub session; permission relay to Nest; context cap and restart.
- Out: Nest laptop layouts (req_057); voice and chat bots (req_032 surfaces); new mission kinds going live (item_152).

# Backlog
- `item_250_core_runs_the_mission_tick_every_2_minutes`
- `item_251_dispatch_slots_and_the_409_refusal_from_nest`
- `item_252_butler_runs_as_a_hub_session_in_cr_0w`
- `item_253_butler_permission_prompts_answered_from_nest`
- `item_254_butler_context_cap_wrap_and_fresh_start`
- `item_255_butler_hears_when_delegated_runs_and_sessions_finish`
- `item_256_resizable_butler_chat_rail_in_nest`
- Order: 250, 251 and 256 first (small, independent), then 252 with 253 and 255 together, then 254.

# Companion docs
- Product brief(s): `prod_005_crow_jarvis_layer`
- Architecture decision(s): `adr_001_core_missions_and_inbox_architecture` (the tick calls no model: unchanged)

# References
- Butler transcript 2026-11-19 10:10 (butler conversation main)
- `tools/crow-core/butler_cmd.go`, `tools/crow-core/mcp_cmd.go`, `tools/crow-core/internal/butler/persona.md`
- `tools/crow-core/internal/mission/tick.go`, `tools/crow-core/internal/api/live.go` (dispatchRun)
- `req_032_spike_butler_engine_and_persona`, `req_057_nest_on_the_laptop_replaces_the_owner_s_terminals`, `item_133`, `item_177`

# Executions
| When | Runner | Run id | Title | State | PR | Notes |
| --- | --- | --- | --- | --- | --- | --- |
