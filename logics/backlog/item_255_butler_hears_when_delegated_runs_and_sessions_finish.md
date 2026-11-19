## item_255_butler_hears_when_delegated_runs_and_sessions_finish - Butler hears when delegated runs and sessions finish
> From version: 1.0.0
> Schema version: 1.0
> Status: Ready
> Understanding: 90%
> Confidence: 85%
> Progress: 0%
> Complexity: Medium
> Theme: General
> Reminder: Update status/understanding/confidence/progress and linked request/task references when you edit this doc.

# AI Context
- Summary: When a run or repo session the butler started ends (done, failed, blocked, waiting on a question), core posts a notice into the butler conversation; the butler reads the report and tells the owner in Nest with the next step.
- Keywords: butler, run finished, notice, inbox, orchestrator, follow-up
- Use when: delegated work ends and nobody hears about it.
- Skip when: run summaries for the runs tab (item_149).

# Problem
- Nothing reports a finished run to the butler today. The hub rule is "after every dispatch, wait on the run and report it unprompted"; the butler has no way to follow it, so an orchestrator would lose track of its own work.

# Scope
- In:
  - Core records which conversation started each run, session or mission.
  - On a state change to done, failed, blocked or needs-answer, core queues a system turn in that conversation with the run id, state, cost and the report path; the butler turn runs when the conversation is idle (never mid-turn) and its reply lands in the Nest chat.
  - Batching: several notices within a minute go in one turn.
  - Decisions the report asks for come out as answer buttons (item_253 rows).
- Out: runs not started by the butler (the brief covers them).

# Acceptance criteria
- AC1: A run started from the chat ends; within 1 minute the chat shows a short report and the next step, unprompted.
- AC2: A run that asks a question shows the question in the chat with answer buttons.
- AC3: Two runs ending together give one turn.

# AC Traceability
- request-AC4 -> AC1 to AC3. Proof: fake run state change in a core test; live check with a oneshot run.

# Decision framing
- Product framing: Not needed
- Architecture framing: Needed if notices go through the inbox instead of a conversation queue (adr_001).

# Links
- Request: `req_065_nest_butler_is_the_cr_0w_hub_and_queued_missions_start_on_their_own`
- Architecture decision(s): `adr_001_core_missions_and_inbox_architecture`
- Primary task(s): (none yet)

# Priority
- Priority: High
- Rationale: an orchestrator that cannot see results is the same gap as today.

# Notes
- Generated locally by logics-manager.

# Executions
| When | Runner | Run id | Title | State | PR | Notes |
| --- | --- | --- | --- | --- | --- | --- |

