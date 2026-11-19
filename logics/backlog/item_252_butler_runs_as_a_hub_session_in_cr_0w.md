## item_252_butler_runs_as_a_hub_session_in_cr_0w - Butler runs as a hub session in cr-0w
> From version: 1.0.0
> Schema version: 1.0
> Status: Ready
> Understanding: 90%
> Confidence: 85%
> Progress: 0%
> Complexity: Medium
> Theme: Nest
> Reminder: Update status/understanding/confidence/progress and linked request/task references when you edit this doc.

# AI Context
- Summary: The butler process runs as a CR-0W hub session that orchestrates: it knows everything the hub knows (CLAUDE.md, owner-prefs, registry, open threads, runbooks, skills) and reads freely, but it does repo work only by delegating (dispatch, handoff, missions). It writes only hub files: Logics plans, vault notes, open threads.
- Keywords: butler, hub session, orchestrator, delegate, read-only repos, cwd, CLAUDE.md, skills, hooks, append-system-prompt
- Use when: changing how the butler process is launched or what it may do.
- Skip when: Nest chat UI.

# Problem
- The req_032 butler is locked down (empty folder, `--tools ""`, core MCP only, dontAsk). It cannot read the registry, runbooks or repos, run `crow`, or check its own claims, so the owner keeps a hub terminal open next to Nest.
- The owner wants an orchestrator, not a worker (2026-11-19): it must know everything about all projects and start the right work, while the work itself runs in background runs and repo sessions.

# Design
- Same session shape as a terminal hub session: cwd the hub checkout, project settings, hooks and skills load as usual. Model opus (knowledge and judgement); the cost stays low because heavy work leaves the conversation.
- Tools by role:
  - Know: Read, Grep, Glob anywhere; read-only Bash (crow runs/brief/activity/doctor, crow-forge-read, logics-manager read verbs, git log/status/diff, glab/gh view); core MCP reads; the user's MCP servers (Jira, mail, calendar) for reads.
  - Delegate: crow dispatch, crow handoff, crow term, crow mission, core MCP mission_new/session_new/dispatch_run. Every delegation prompt carries owner-prefs and an end state, as the hub rules ask.
  - Write: Edit and Write only under the hub checkout `logics/`, `local/` notes and the vault crow folder; `crow note`, `crow-state`. Commits in the hub repo for those files.
  - Not allowed: Edit, Write or mutating git in registered project repos; push, merge, MR creation, mail send, Teams posts, Jira writes. Those go to a repo session or come back to the owner as an ask.
- Enforced by a butler settings layer (permissions allow and deny lists passed with `--settings`) on top of the hub project settings; hub-guard stays as the second guard.
- Persona via `--append-system-prompt`: voice, surface tags, "check before you claim", and "delegate repo work; say which run or session got it".
- Keep the session id per conversation so a core restart resumes it (`--resume`).

# Scope
- In: launch change in butler_cmd.go; butler permission layer; persona rewrite; resume.
- Out: permission relay (item_253), finish notices (item_255), context cap (item_254).

# Acceptance criteria
- AC1: "Which of my work projects have red pipelines?" answers from the registry and forge reads, with no run started.
- AC2: "Fix the review threads on my MR" starts a background run or repo session with owner-prefs and an end state in its prompt, and the reply names the run id and account.
- AC3: An Edit in a registered repo is denied by the butler layer with a message that names the delegate path.
- AC4: The butler can create a Logics item and a vault note from the chat.
- AC5: A core restart keeps the conversation (same session resumed).

# AC Traceability
- request-AC2, request-AC4 -> AC1 to AC5. Proof: live test per runbooks/live-claude-session-test.md plus a settings test for the deny list.

# Decision framing
- Product framing: Needed: reverses the req_032 lock-down at the owner's request; orchestrator role chosen 2026-11-19.
- Architecture framing: Not needed

# Links
- Request: `req_065_nest_butler_is_the_cr_0w_hub_and_queued_missions_start_on_their_own`
- Architecture decision(s): `adr_001_core_missions_and_inbox_architecture`
- Primary task(s): (none yet)

# Priority
- Priority: High
- Rationale: the owner's main ask. Ship with item_253 and item_255: without the relay, any ask stalls; without finish notices, the orchestrator cannot follow its own work.

# Notes
- Generated locally by logics-manager.

# Executions
| When | Runner | Run id | Title | State | PR | Notes |
| --- | --- | --- | --- | --- | --- | --- |

