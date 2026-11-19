## prod_008_crow_on_the_tower - crow on the tower
> Date: 2026-11-10
> Status: Proposed
> Related request: `req_056_crow_on_the_windows_tower`
> Related backlog: `item_183_crow_runs_on_the_windows_tower_in_wsl_arch`, `item_184_crow_helps_manage_game_mods_on_the_tower`
> Related task: `task_022_orchestrate_crow_on_the_windows_tower`
> Related architecture: (none yet)
> Reminder: Update status, linked refs, scope, decisions, success signals, and open questions when you edit this doc.
> Indicators reviewed: 2026-11-18 11:14:28

# Overview
crow runs on the Windows tower in WSL Arch and helps manage game mods.

# Goals
- crow works on the tower like on the laptop.
- Game mods are managed from crow with backups.
- The owner drives the tower from Nest: power, missions, desktop control (2026-11-18).

# Non-goals
- Local AI benchmarks (req_029): later.
- Homelab services (Syncthing peer, ntfy, aggregator, DNS, media, photos): later, in the homelab repo.
- Shared crow state across machines (req_016 step 4 sync).

# Scope and guardrails
- In: scaffolded request, product, backlog, orchestration task, validation, and handoff context.
- Out: unrelated workflow docs and implementation of generated tasks.

# Key product decisions
- Use structured input as the source of truth for generated docs.
- Keep generated write paths local and repo-bounded.

# Success signals
- Generated docs pass lint and audit without broad manual rewrites.
- Context-pack output can be handed to an implementation agent directly.

# References
- Product back-reference: `req_056_crow_on_the_windows_tower`
- Task back-reference: `task_022_orchestrate_crow_on_the_windows_tower`
