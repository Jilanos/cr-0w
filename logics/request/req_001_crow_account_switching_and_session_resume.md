## req_001_crow_account_switching_and_session_resume - crow account switching and session resume
> From version: 1.0.0
> Schema version: 1.0
> Status: Draft
> Understanding: 90%
> Confidence: 85%
> Complexity: High
> Theme: Hub orchestration
> Reminder: Update status/understanding/confidence and linked backlog/task references when you edit this doc.

# AI Context
- Summary: (unfilled: replace before this doc is used)
- Keywords: crow, account, switching, session, resume
- Use when: (unfilled: replace before this doc is used)
- Skip when: (unfilled: replace before this doc is used)

# Needs
- When the current account runs out of its 5-hour allowance the owner is blocked and cannot do much; crow should offer to continue on another allowed account instead.
- Only accounts the owner allows may be used: one is personal, one is shared and must always be confirmed, the others belong to teammates and are never used.
- Sessions cut off by a usage limit must be listed and relaunchable on any allowed account, whenever the owner wants.
- A handoff must name the exact source conversation: without an id the provider tool takes the newest transcript, which once handed off an automatic retro session instead of the owner's real one.
- While no tokens are left the owner should still have something useful to do from the hub.

# Context
- cdx offers `status --json` (5h and weekly usage, block, reset times per account), `can-resume <name>` and `handoff <source> <target> --source-conversation ID`. cdx is not owned by the hub's owner and must stay untouched and unaware of crow.
- crow-usage already reads `cdx status --json` for limits; crow-watch already shows agents and usage and can host another view.
- Automatic retros run as their own sessions in the same profile and workspace, so a 'newest transcript' lookup picks them up.
- A first registry of limit-cut sessions exists at local/state/interrupted-sessions.md (11 sessions on 2026-10-20), built by scanning every profile's transcripts for a final limit message and excluding retros.
- Account policy lives in local/context.md today, in prose; it must become machine-readable config in local/.

# Acceptance criteria
- AC1: An allowed-accounts config in local/ lists each account with a policy (use, ask-first, never); crow never targets an account marked never.
- AC2: A scanner builds the interrupted-sessions registry from transcripts (last turn is a limit message, retros and automatic jobs excluded) and is cheap on repeated runs.
- AC3: Relaunching a session always passes its conversation id to the handoff and refuses to run without one.
- AC4: When the active account is blocked, crow shows the recommended allowed target and asks for confirmation before any handoff; ask-first accounts always require an explicit yes.
- AC5: A crow watch view lists interrupted sessions with project, age, size and first prompt, and relaunches the selected one on a chosen allowed account.
- AC6: With no usable account, crow offers a no-model mode listing work that needs none (pipeline checks, diff review, registry triage).
- AC7: Nothing in the change requires a change to cdx or relies on crow-specific markers inside cdx.

# Definition of Ready (DoR)
- [x] Problem statement is explicit and user impact is clear.
- [x] Scope boundaries (in/out) are explicit.
- [x] Acceptance criteria are testable.
- [x] Dependencies and known risks are listed.

# Companion docs
- Product brief(s): `prod_002_keep_working_when_an_account_runs_out`
- Architecture decision(s): (none yet)

# References
- bin/crow
- bin/crow-usage
- bin/crow-runs
- bin/crow-retro
- tools/crow-watch/main.go
- tools/crow-watch/agents.go
- runbooks/dispatch-background-runs.md
- runbooks/session-retros.md

# Backlog
- `item_006_1_1_account_policy_config_and_interrupted_session_registry`
- `item_007_1_2_guarded_relaunch_and_block_detection`
- `item_008_1_3_interrupted_sessions_view_and_no_model_mode`
