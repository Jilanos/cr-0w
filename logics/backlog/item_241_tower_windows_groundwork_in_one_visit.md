## item_241_tower_windows_groundwork_in_one_visit - Tower Windows groundwork in one visit
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
- Summary: Prepare and run one admin script at the tower so every later step works remotely without UAC.
- Keywords: tower, windows, uac, tailscale, openssh, rustdesk, wake, autologon
- Use when: Setting up the tower's Windows side for remote control.
- Skip when: WSL Arch and crow tools (item_183).

# Problem
- An unelevated session (Remote Control, windows-mcp) cannot click a UAC prompt: the prompt runs on the secure desktop and Windows blocks input from lower integrity processes. Every admin step needs the owner at the tower once.
- After this visit, admin work goes over OpenSSH: an administrator account gets a full token over ssh, no prompt.

# Scope
- In:
  - Inventory from Remote Control (no admin): motherboard and BIOS model, NIC and MAC, Windows edition, GPU and VRAM, `powercfg /a`, `powercfg /devicequery wake_armed`. Saved in the vault crow Research folder.
  - No-admin settings from Remote Control: no sign-in on wake, no screensaver lock, Startup folder launcher for windows-mcp (HTTP on localhost) and a Remote Control session.
  - `tower-admin-setup.ps1`, idempotent, generic in `bootstrap/windows/`, private values in `local/`: Tailscale unattended mode, OpenSSH Server with the firewall rule limited to the tailnet, RustDesk installed as a service (direct IP over the tailnet, no public relay), NIC wake on magic packet and allowed to wake the PC, Fast Startup off, Autologon (Sysinternals) as the fallback after a reboot or power cut, Windows Update active hours, WSL feature.
  - BIOS checklist from the inventory: restore on AC power loss = on (for the smart plug), wake from S5 on LAN.
  - Runbook: generic part in `runbooks/remote-computer-use-windows.md`, private part in `local/runbooks/`.
- Out:
  - WSL Arch and crow (item_183).
  - Power and status actions in crow and Nest (item_242, item_243).

# Acceptance criteria
- AC1: The laptop opens an elevated PowerShell on the tower over ssh on the tailnet, no prompt.
- AC2: The tower sleeps, a magic packet sent on the LAN wakes it, and the desktop is usable (no sign-in screen) with windows-mcp answering.
- AC3: After a reboot the tower logs in alone, joins the tailnet and starts windows-mcp and Remote Control.
- AC4: RustDesk from the phone over the tailnet shows the login screen and a UAC prompt and can click them.

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
- Rationale: Every other tower item depends on it. One visit at the tower.

# Notes
- Prepared from a Remote Control session with windows-mcp on 2026-11-18 (no admin needed for the inventory and the script).
- Security: auto-login plus a PowerShell-capable MCP gives the tailnet full control of the tower. Tailscale ACL limits the tower ports to the owner's devices.

# Executions
| When | Runner | Run id | Title | State | PR | Notes |
| --- | --- | --- | --- | --- | --- | --- |
