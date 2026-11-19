## item_263_optional_tool_bricks_and_install_profiles - Optional tool bricks and install profiles
> From version: 1.0.0
> Schema version: 1.0
> Status: Ready
> Understanding: 80
> Confidence: 75
> Progress: 0%
> Complexity: Medium
> Theme: General
> Reminder: Update status/understanding/confidence/progress and linked request/task references when you edit this doc.

# AI Context
- Summary: Split step 6 of adr_002: afk, retro, releases, design and the shell integration turn off cleanly, and `install.sh` asks which bricks to turn on and writes the starter crow.yaml.
- Keywords: modules, afk, retro, releases, design, install, profile
- Use when: finishing the module split and the public install path.
- Skip when: earlier splits.

# Problem
- A new install gets every brick and edits crow.yaml by hand.

# Scope
- In:
  - afk, retro, releases, design and integration-shell off: no skills, no hooks, no subcommands, no sections.
  - `install.sh --modules a,b,c` and an interactive prompt; default starter set from adr_002.
  - `crow modules on <brick>` and `off <brick>` edit crow.yaml and rerun the link step.
  - Install docs list each brick with one line.
- Out:
  - Separate packages per brick.

# Acceptance criteria
- AC1: A docker install with `--modules core` runs brief, doctor and Nest with no error.
- AC2: `crow modules off retro` then `on retro` returns the same installed set.
- AC3: With no crow.yaml, nothing changes (owner's setup).

# AC Traceability
- req_064_paul_s_feedback_and_a_modular_public_crow-AC1 -> This backlog slice. Proof: a second user installs with only the bricks they need, no local patches.

# Dependencies
- `item_262_mail_team_and_vault_bricks_optional`.

# Links
- Request: `req_064_paul_s_feedback_and_a_modular_public_crow`
- Architecture decision(s): `adr_002_crow_bricks_module_manifest_and_project_kinds`

# Priority
- Priority: Medium
- Rationale: Closes the public install path.

# Executions
| When | Runner | Run id | Title | State | PR | Notes |
| --- | --- | --- | --- | --- | --- | --- |
