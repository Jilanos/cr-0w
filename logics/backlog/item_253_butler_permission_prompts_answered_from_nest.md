## item_253_butler_permission_prompts_answered_from_nest - Butler permission prompts answered from Nest
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
- Summary: Permission and hub-guard prompts of the butler session reach the Nest chat as answer buttons; the owner's answer goes back to the waiting turn.
- Keywords: permission-prompt-tool, canUseTool, hub-guard, answer, Nest chat, item_177
- Use when: the butler waits on a permission.
- Skip when: prompts of other live sessions (item_177 covers them).

# Problem
- A headless hub session meets permission asks (hub-guard asks before commit, push, rebase, MR in a registered repo; unlisted Bash). With no relay the turn stalls or the call is denied without the owner seeing it.

# Scope
- In:
  - Launch the butler with `--permission-prompt-tool` pointing at a core MCP tool that parks the ask, publishes it to the butler conversation as a prompt row, and returns the owner's allow or deny (with a timeout that denies and says so).
  - hub-guard "ask" decisions arrive the same way.
  - Nest chat reuses the item_177 answer buttons for these rows; the phone shows them too.
- Out: auto-approve rules beyond the project settings.

# Acceptance criteria
- AC1: An unlisted Bash command from the chat shows Allow and Deny in Nest; Allow runs it, Deny tells the model it was denied.
- AC2: A push asked from the chat shows the exact command and runs only after the tap.
- AC3: An unanswered ask times out after 10 min as deny and the chat says so.

# AC Traceability
- request-AC3 -> AC1 to AC3. Proof: live test plus a fake-claude test of the MCP tool.

# Decision framing
- Product framing: Not needed
- Architecture framing: Needed if the relay changes the core event model.

# Links
- Request: `req_065_nest_butler_is_the_cr_0w_hub_and_queued_missions_start_on_their_own`
- Architecture decision(s): `adr_001_core_missions_and_inbox_architecture`
- Primary task(s): (none yet)

# Priority
- Priority: High
- Rationale: required for item_252 to work unattended.

# Notes
- Generated locally by logics-manager.

# Executions
| When | Runner | Run id | Title | State | PR | Notes |
| --- | --- | --- | --- | --- | --- | --- |

