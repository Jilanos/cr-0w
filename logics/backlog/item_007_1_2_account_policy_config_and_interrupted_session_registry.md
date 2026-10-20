## item_007_1_2_account_policy_config_and_interrupted_session_registry - 1.2 account policy config and interrupted-session registry
> From version: 1.0.0
> Schema version: 1.0
> Status: In progress
> Understanding: 90%
> Confidence: 85%
> Progress: 25%
> Complexity: Medium
> Theme: Hub orchestration
> Reminder: Update status/understanding/confidence/progress and linked request/task references when you edit this doc.

# AI Context
- Summary: (unfilled: replace before this doc is used)
- Keywords: account, policy, config, interrupted, session, registry
- Use when: (unfilled: replace before this doc is used)
- Skip when: (unfilled: replace before this doc is used)

# Problem
- Account rules exist only as prose and the registry was built by a one-off script.

# Scope
- In:
  - Machine-readable accounts file in local/ and a bin/ scanner that writes the registry as JSON plus a readable list.
- Out:
  - Any UI, any handoff execution.

# Acceptance criteria
- AC1: accounts file with policies is read by one helper used by every crow command.
- AC2: the scanner excludes retros and automatic jobs and reuses a cache keyed by file mtime and size.

# AC Traceability
- request-AC1 -> This backlog slice. Proof: AC1: accounts file with policies is read by one helper used by every crow command.
- request-AC2 -> This backlog slice. Proof: AC2: the scanner excludes retros and automatic jobs and reuses a cache keyed by file mtime and size.
- request-AC7 -> This backlog slice. Proof: AC2: the scanner excludes retros and automatic jobs and reuses a cache keyed by file mtime and size.

# Decision framing
- Product framing: Not needed
- Architecture framing: Not needed

# Links
- Product brief(s): `prod_002_keep_working_when_an_account_runs_out`
- Architecture decision(s): (none yet)
- Request: `req_001_crow_account_switching_and_session_resume`
- Primary task(s): `task_002_deliver_account_switching_and_session_resume_in_three_steps`

# Priority
- Priority: High
- Rationale: Set by scaffold input or defaulted for grooming.
