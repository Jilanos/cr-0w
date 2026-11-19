## item_266_move_the_shell_integration_brick_to_its_own_git_repo - Move the shell integration brick to its own git repo
> From version: 1.0.0
> Schema version: 1.0
> Status: Ready
> Understanding: 75
> Confidence: 70
> Progress: 0%
> Complexity: Small
> Theme: General
> Reminder: Update status/understanding/confidence/progress and linked request/task references when you edit this doc.

# AI Context
- Summary: Pilot of separate repos per brick. The integration-shell brick leaves the engine, lives in its own git repo, and installs with `crow modules add`.
- Keywords: modules, pilot, integration-shell, separate repo, git install
- Use when: proving the user module path on a real engine brick.
- Skip when: before item_265 lands.

# Problem
- adr_002 deferred separate repos per brick. Nothing proves that a brick can live outside the engine.

# Scope
- In:
  - New personal git repo holding the integration-shell files listed in bricks.tsv, with its module.yaml and a README.
  - Engine drops those files and the bricks.tsv rows; the inventory test still passes.
  - Owner's install: `crow modules add <repo url>`; the lock pins the first tag.
  - Install docs: integration-shell is an optional brick from its own repo.
  - Write down what broke or felt heavy in the pilot (in this item's Notes), to decide on more moves.
- Out:
  - Moving any other brick.

# Acceptance criteria
- AC1: After the move, the owner's shell integration works as before (same commands, same prompt hooks).
- AC2: A fresh docker install without the brick has no shell integration and no error.
- AC3: `crow-check` passes on the engine without the moved files.
- AC4: Notes list the friction points and a go or no-go for moving more bricks.

# AC Traceability
- req_064_paul_s_feedback_and_a_modular_public_crow-AC1 -> This backlog slice. Proof: one brick ships from its own repo.

# Dependencies
- `item_265_user_modules_from_a_local_folder_or_a_git_url`.
- `item_263_optional_tool_bricks_and_install_profiles` (integration-shell already a switch).

# Links
- Request: `req_064_paul_s_feedback_and_a_modular_public_crow`
- Architecture decision(s): `adr_002_crow_bricks_module_manifest_and_project_kinds`

# Priority
- Priority: Low
- Rationale: Pilot before deciding on more separate repos.

# Notes
- Creating the repo and pushing to it needs the owner's OK.

# Executions
| When | Runner | Run id | Title | State | PR | Notes |
| --- | --- | --- | --- | --- | --- | --- |
