## item_244_desktop_mission_kind_driving_the_windows_desktop - Desktop mission kind driving the Windows desktop
> From version: 1.0.0
> Schema version: 1.0
> Status: Ready
> Understanding: 90%
> Confidence: 85%
> Progress: 0%
> Complexity: Medium
> Theme: Hosts
> Reminder: Update status/understanding/confidence/progress and linked request/task references when you edit this doc.

# AI Context
- Summary: A mission kind that gets the tower's windows-mcp so a mission can open apps, click and download on the Windows desktop.
- Keywords: mission kind, desktop, windows-mcp, computer use, allowlist
- Use when: Missions that need the Windows GUI.
- Skip when: Code missions (item_120 covers plain tower missions).

# Problem
- The owner wants crow to open, click and download on the tower like a Remote Control session with windows-mcp, from a mission started in Nest.

# Scope
- In:
  - Kind data file `desktop` (logics/specs/req_037_run_contract/kinds/): host tower, windows-mcp as the only extra MCP server, allowed tools listed, gates.
  - cdx run in WSL reaches windows-mcp on the Windows localhost (mirrored networking); the sandbox allows that one port.
  - Yield: the mission stops when the owner is gaming or at the seat (idle signals from item_120).
  - Downloads land in one folder that the mission report lists.
- Out:
  - Admin actions through the GUI (UAC cannot be automated; admin goes over ssh).

# Acceptance criteria
- AC1: A desktop mission from Nest opens a browser on the tower, downloads a named file and reports its path.
- AC2: A mission of another kind has no windows-mcp tools.
- AC3: The mission stops when the owner starts a game.

# AC Traceability
- request-AC3 to AC6 -> This backlog slice. Proof: the acceptance criteria above.

# Decision framing
- Product framing: Not needed
- Architecture framing: Not needed

# Links
- Product brief(s): `prod_008_crow_on_the_tower`
- Architecture decision(s): (none yet)
- Request: `req_056_crow_on_the_windows_tower`
- Primary task(s): `task_022_orchestrate_crow_on_the_windows_tower`

# Priority
- Priority: Medium
- Rationale: The capability the owner asked for.

# Notes
- Background runs deny by default: this kind is the whitelist for desktop control.

# Executions
| When | Runner | Run id | Title | State | PR | Notes |
| --- | --- | --- | --- | --- | --- | --- |
