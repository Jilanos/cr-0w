## item_242_host_registry_and_crow_host_commands - Host registry and crow host commands
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
- Summary: A host registry and `crow host` commands so crow knows each machine, how to reach it and how to wake it.
- Keywords: hosts, registry, wake, sleep, ssh, multi-machine
- Use when: Any crow action that targets a machine other than the laptop.
- Skip when: Nest buttons (item_243).

# Problem
- crow assumes one machine. Tower actions need its tailnet name, shells, MAC and wake method in one place, with one driver per OS.

# Scope
- In:
  - `local/hosts.yaml` (private) with a generic schema: name, os, roles, tailnet name, ssh targets (windows and wsl), mac, wake methods (lan magic packet, Bbox WOL proxy on the public IP, smart plug), sleep command, plug address, gpu, accounts, power policy.
  - `crow host ls|status|wake|sleep|ssh <host>`. status: tailnet ping, ssh reachable, windows-mcp up, plug power reading. wake waits until ssh answers or times out.
  - Drivers: linux (systemctl suspend), windows (rundll32 powrprof or a scheduled task), plug (Shelly local HTTP API).
  - `crow doctor --host <name>` runs the checks on a remote host.
- Out:
  - Mission dispatch to a host (item_120).
  - Nest UI (item_243).

# Acceptance criteria
- AC1: `crow host status tower` reports asleep, awake or off, from ping, ssh and plug power.
- AC2: `crow host wake tower` from the laptop away from home wakes the sleeping tower through the Bbox WOL proxy and returns when ssh answers.
- AC3: `crow host sleep tower` puts it to sleep and status shows asleep.

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
- Priority: High
- Rationale: Shared base for power, missions and Nest.

# Notes
- Links req_016 (crow on several machines): the registry is the generic part of that request.

# Executions
| When | Runner | Run id | Title | State | PR | Notes |
| --- | --- | --- | --- | --- | --- | --- |
