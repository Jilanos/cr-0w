## item_009_1_4_interrupted_sessions_view_and_no_model_mode - 1.4 interrupted-sessions view and no-model mode
> From version: 1.0.0
> Schema version: 1.0
> Status: In progress
> Understanding: 90%
> Confidence: 85%
> Progress: 75%
> Complexity: Medium
> Theme: Hub orchestration
> Reminder: Update status/understanding/confidence/progress and linked request/task references when you edit this doc.

# AI Context
- Summary: (unfilled: replace before this doc is used)
- Keywords: interrupted, sessions, view, model, mode
- Use when: (unfilled: replace before this doc is used)
- Skip when: (unfilled: replace before this doc is used)

# Problem
- Relaunching is a manual command and the owner has nothing to do while out of tokens.

# Scope
- In:
  - A crow watch view over the registry with relaunch, and a no-model list of useful work.
- Out:
  - Local model dispatch.

# Acceptance criteria
- AC1: the view fills the terminal like the other views and degrades on small terminals.
- AC2: selecting a session and an allowed account runs the guarded relaunch.

# AC Traceability
- request-AC5 -> This backlog slice. Proof: AC1: the view fills the terminal like the other views and degrades on small terminals.
- request-AC6 -> This backlog slice. Proof: AC2: selecting a session and an allowed account runs the guarded relaunch.

# Decision framing
- Product framing: Not needed
- Architecture framing: Not needed

# Links
- Product brief(s): `prod_002_keep_working_when_an_account_runs_out`
- Architecture decision(s): (none yet)
- Request: `req_001_crow_account_switching_and_session_resume`
- Primary task(s): `task_002_deliver_account_switching_and_session_resume_in_three_steps`

# Priority
- Priority: Medium
- Rationale: Set by scaffold input or defaulted for grooming.
