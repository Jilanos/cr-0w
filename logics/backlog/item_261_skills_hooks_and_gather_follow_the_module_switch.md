## item_261_skills_hooks_and_gather_follow_the_module_switch - Skills, hooks and gather follow the module switch
> From version: 1.0.0
> Schema version: 1.0
> Status: Ready
> Understanding: 85
> Confidence: 80
> Progress: 0%
> Complexity: Medium
> Theme: General
> Reminder: Update status/understanding/confidence/progress and linked request/task references when you edit this doc.

# AI Context
- Summary: Split step 2 of adr_002: an off brick installs no skills or git hooks, its Claude hooks exit at once, gather skips its keys and its `crow` subcommands refuse with a clear line.
- Keywords: modules, skills, hooks, gather, install, switch
- Use when: making the generic off behaviour work for any brick.
- Skip when: a single brick's own code paths (items 236, 262, 263).

# Problem
- Skills, hooks and gather keys are installed and run for every brick, whatever the setup.

# Scope
- In:
  - `crow-memory link` links only skills of on bricks; doctor's skill link check follows the on set.
  - Hub skills move from `.claude/skills/` to `skills/`; install links on bricks into `.claude/skills/` (git-ignored).
  - Claude hook scripts exit 0 when their brick is off.
  - Git hooks installed only in `repo` projects while `git` is on.
  - `crow-gather` collects only the gather keys of on bricks and lists the on set in its JSON; brief, daily and weekly skills read it.
  - `crow` subcommands of an off brick print `crow: module <name> is off (crow.yaml)` and exit 2.
- Out:
  - Brick-specific code paths.

# Acceptance criteria
- AC1: Turning `design` off removes its skills and makes its hook a no-op, with no other change.
- AC2: `crow-gather brief` with `afk` off has no afk key and the brief renders.
- AC3: With no crow.yaml, installed skills and hooks match today's set.

# AC Traceability
- req_064_paul_s_feedback_and_a_modular_public_crow-AC3 -> This backlog slice. Proof: gather and install follow the on set.

# Dependencies
- `item_260_module_manifests_crow_yaml_loader_and_doctor_check`.

# Links
- Request: `req_064_paul_s_feedback_and_a_modular_public_crow`
- Architecture decision(s): `adr_002_crow_bricks_module_manifest_and_project_kinds`
- Next: `item_236_first_module_split_forge_mrs_optional_and_folder_projects`

# Priority
- Priority: Medium
- Rationale: Gives every brick its off switch at once.

# Executions
| When | Runner | Run id | Title | State | PR | Notes |
| --- | --- | --- | --- | --- | --- | --- |
