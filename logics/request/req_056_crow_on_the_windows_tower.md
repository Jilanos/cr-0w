## req_056_crow_on_the_windows_tower - crow on the Windows tower
> From version: 1.0.0
> Schema version: 1.0
> Status: Draft
> Understanding: 95%
> Confidence: 90%
> Complexity: Medium
> Theme: Hosts
> Reminder: Update status/understanding/confidence and linked backlog/task references when you edit this doc.

# AI Context
- Summary: crow runs on the Windows tower and drives it from Nest: power, missions, desktop control, game mods.
- Keywords: crow, windows, tower, wake, nest, windows-mcp, rustdesk
- Use when: Any work that sets up or uses the tower from crow or Nest.
- Skip when: Homelab server work (homelab repo).

# Needs
- crow runs on the Windows tower and helps the owner manage game mods there.
- Every tool crow needs works on the tower (WSL Arch, Tailscale, git, gh, claude, cdx, tmux, rtk, logics-manager).
- Owner, 2026-11-18: launch work on the tower at any time from the phone through Nest, not through Remote Control: wake it and put it to sleep, start missions and sessions, follow them, and let crow open apps, click and download on the Windows desktop like a Remote Control session with windows-mcp does.

# Context
- Owner 2026-11-10: focus for 2026-11-11 is the tower and the homelab.
- Tower: Windows. crow is bash and Python, cdx sandboxes with bubblewrap, pasta and nftables, Linux only. crow runs in WSL2. Distro: Arch, same as the laptop (owner 2026-11-10).
- Tower network: Tailscale on Windows with WSL mirrored networking (req_016).
- Games: crow helps manage mods. Other game features wait until a need shows (owner 2026-11-10).
- The Yoga homelab is planned in its own local homelab repo (owner 2026-11-10: local, not pushed).
- Decisions 2026-11-18 (owner):
  - core stays on the laptop for now. The always-on server (Yoga or a new small PC) is decided in the homelab repo later (item_181).
  - Remote Control on the tower stays as the fallback when the laptop sleeps.
  - Wake from sleep, not from shutdown. Wake-on-LAN is in scope now (reverses req_029 decision D3). Sender: the Bbox Ultym WOL proxy on the public IP, reachable from the laptop anywhere and from a phone WOL app.
  - RustDesk installed as a service, emergency only (UAC prompts, login screen).
  - Smart plug for hard reset and power state: Shelly Plug S MTR Gen3 recommended, owner checking it.
- State 2026-11-18: windows-mcp works in a Remote Control session on the tower (user scope, no admin). Vault syncs via Syncthing. WSL not installed. Tailscale not installed.
- Why one visit is needed: UAC prompts run on the secure desktop and an unelevated process cannot click them. After the visit, admin goes over OpenSSH (admin accounts get a full token, no prompt).

# Acceptance criteria
- AC1: crow doctor passes on the tower and the tower is on the tailnet.
- AC2: From a tower crow session, the owner lists one game's mods and changes one with a backup taken first.
- AC3: From Nest, the owner wakes the sleeping tower, puts it to sleep, and sees its state.
- AC4: From Nest, the owner starts a mission on the tower and follows it next to laptop runs.
- AC5: A desktop mission from Nest opens an app on the tower, downloads a file, and Nest shows the screen.
- AC6: With the laptop asleep, the owner wakes the tower from the phone and reaches its Remote Control session.

# Definition of Ready (DoR)
- [x] Problem statement is explicit and user impact is clear.
- [x] Scope boundaries (in/out) are explicit.
- [x] Acceptance criteria are testable.
- [x] Dependencies and known risks are listed.

# Companion docs
- Product brief(s): `prod_008_crow_on_the_tower`
- Architecture decision(s): (none yet)

# References
- logics/request/req_016_crow_everywhere_multi_machine_and_mobile_control.md
- logics/specs/req_029_hosts/README.md
- logics/backlog/item_120_tower_as_a_mission_host_for_claude_missions.md
- logics/backlog/item_181_core_reachable_when_the_laptop_sleeps.md
- runbooks/remote-computer-use-windows.md
- Bbox WOL proxy: https://www.bbox-mag.fr/box/proxy-wol-bbox-wake-on-lan/47766647
- Plug: https://www.shelly.com/fr/products/shelly-plug-s-gen3

# Backlog
- `item_183_crow_runs_on_the_windows_tower_in_wsl_arch`
- `item_184_crow_helps_manage_game_mods_on_the_tower`
- `item_241_tower_windows_groundwork_in_one_visit`
- `item_242_host_registry_and_crow_host_commands`
- `item_243_tower_power_and_status_from_nest`
- `item_120_tower_as_a_mission_host_for_claude_missions`
- `item_244_desktop_mission_kind_driving_the_windows_desktop`
- `item_245_tower_screen_view_in_nest`

# Executions
| When | Runner | Run id | Title | State | PR | Notes |
| --- | --- | --- | --- | --- | --- | --- |
