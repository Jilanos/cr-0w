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
- Summary: The butler process runs as a CR-0W hub Claude session: cwd cr-0w, project CLAUDE.md and settings, skills, Bash and the crow CLI, hub hooks, on the owner's account; the persona stays as an appended system prompt.
- Keywords: butler, hub session, cwd, CLAUDE.md, skills, hooks, stream-json, append-system-prompt
- Use when: changing how the butler process is launched.
- Skip when: Nest chat UI.

# Problem
- The req_032 butler is locked down on purpose (empty folder, `--tools ""`, core MCP only, dontAsk). It cannot read the registry, runbooks or repos, run `crow`, or check its own claims, so the owner keeps a hub terminal open next to Nest.

# Scope
- In:
  - butler_cmd.go launches `claude -p` stream-json through cdx on the picked account with cwd the hub checkout, the normal project settings and hooks, all built-in tools, the user's MCP servers plus the core MCP server, model opus (hub default), persona via `--append-system-prompt` instead of a replaced system prompt.
  - Persona rewrite: hub rules come from CLAUDE.md; the persona keeps voice, surface tags and "check before you claim" only.
  - The core MCP tools stay (cheap state reads); the butler may also run any crow command.
  - Keep the session id per conversation so a core restart resumes it (`--resume`).
- Out: permission relay (item_253), context cap (item_254).

# Acceptance criteria
- AC1: In the Nest chat, "read local/projects.yaml and list my work projects" answers from the file.
- AC2: "crow runs" and "crow-activity" run from the chat and their output is summarised.
- AC3: A commit or push in a registered repo from the chat triggers bin/crow-hub-guard exactly as in a terminal hub session.
- AC4: A core restart keeps the conversation (same session resumed).

# AC Traceability
- request-AC2, request-AC4 -> AC1 to AC4. Proof: live test per runbooks/live-claude-session-test.md.

# Decision framing
- Product framing: Needed: reverses the req_032 lock-down at the owner's request (2026-11-19).
- Architecture framing: Not needed

# Links
- Request: `req_065_nest_butler_is_the_cr_0w_hub_and_queued_missions_start_on_their_own`
- Architecture decision(s): `adr_001_core_missions_and_inbox_architecture`
- Primary task(s): (none yet)

# Priority
- Priority: High
- Rationale: the owner's main ask; depends on item_253 to be usable (without a relay, any prompt stalls the turn).

# Notes
- Generated locally by logics-manager.
- Risk: headless `-p` cannot show permission prompts; build item_253 in the same task or launch with a permission-prompt tool from the start.

# Executions
| When | Runner | Run id | Title | State | PR | Notes |
| --- | --- | --- | --- | --- | --- | --- |

