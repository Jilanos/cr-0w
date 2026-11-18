## task_022_orchestrate_crow_on_the_windows_tower - Orchestrate crow on the Windows tower
> From version: 1.0.0
> Schema version: 1.0
> Status: Ready
> Understanding: 95%
> Confidence: 90%
> Progress: 0%
> Complexity: Medium
> Theme: Implementation delivery
> Reminder: Update status/understanding/confidence/progress and linked request/backlog references when you edit this doc.

# AI Context
- Summary: Execution order for the tower: Windows groundwork, WSL crow, host registry, power from Nest, missions, desktop kind, screen view, mods.
- Keywords: orchestrate, crow, windows, tower
- Use when: Picking the next tower step.
- Skip when: Homelab server work.

# Context
- Orchestrate the scaffolded request chain and keep sibling implementation slices linked.

# Plan
- [ ] 1. item_241 prep, from a Remote Control session (no admin): inventory, no sign-in on wake, Startup launcher, admin script written.
- [ ] 2. item_241 visit: owner runs the admin script once, BIOS settings, `tailscale up`, wake test on the LAN.
- [ ] 3. item_183: WSL Arch, crow and cdx, ssh from the laptop (needs Tailscale from step 2).
- [ ] 4. item_242: host registry and `crow host` (wake through the Bbox WOL proxy).
- [ ] 5. item_243: power and status in core and Nest; Shelly plug once bought.
- [ ] 6. item_120: tower missions from Nest, idle and gaming signals. Recheck cdx remote `--continue-run` first.
- [ ] 7. item_244: desktop mission kind with windows-mcp.
- [ ] 8. item_245: tower screen view in Nest.
- [ ] Any time after step 3: item_184 game mods.
- [ ] Hands-on steps: the owner types on the tower, the laptop session guides and writes the runbook.
- [ ] ADR 009 checkpoint: update affected Logics docs during each meaningful wave and leave the repo commit-ready.
- [ ] Keep commit creation under operator control; do not force one commit per micro-step.
- [ ] GATE: do not close until lint, audit, and scaffold validation pass.

# Backlog
- `item_183_crow_runs_on_the_windows_tower_in_wsl_arch`
- `item_184_crow_helps_manage_game_mods_on_the_tower`
- `item_241_tower_windows_groundwork_in_one_visit`
- `item_242_host_registry_and_crow_host_commands`
- `item_243_tower_power_and_status_from_nest`
- `item_120_tower_as_a_mission_host_for_claude_missions`
- `item_244_desktop_mission_kind_driving_the_windows_desktop`
- `item_245_tower_screen_view_in_nest`

# Definition of Done (DoD)
- [ ] Generated request, product, backlog, and task docs are present.
- [ ] Context-pack handoff is available when requested.
- [ ] Validation passes.
- [ ] Meaningful waves followed ADR 009: affected docs updated and the repo left commit-ready without automatic commits.

# AC Traceability
- request-AC1 -> `item_183_crow_runs_on_the_windows_tower_in_wsl_arch`. Proof deferred to slice closeout.
- request-AC2 -> `item_184_crow_helps_manage_game_mods_on_the_tower`. Proof deferred to slice closeout.
- request-AC3 -> `item_241`, `item_242`, `item_243`. Proof deferred to slice closeout.
- request-AC4 -> `item_120`. Proof deferred to slice closeout.
- request-AC5 -> `item_244`, `item_245`. Proof deferred to slice closeout.
- request-AC6 -> `item_241`, `item_243`. Proof deferred to slice closeout.

# Validation
- (no validation recorded yet)

# Report
- Not started.

# Links
- Request: `req_056_crow_on_the_windows_tower`
- Product brief(s): `prod_008_crow_on_the_tower`
- Architecture decision(s): (none yet)

# Executions
| When | Runner | Run id | Title | State | PR | Notes |
| --- | --- | --- | --- | --- | --- | --- |
