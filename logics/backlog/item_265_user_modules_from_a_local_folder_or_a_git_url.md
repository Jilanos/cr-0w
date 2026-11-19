## item_265_user_modules_from_a_local_folder_or_a_git_url - User modules from a local folder or a git url
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
- Summary: A user adds a brick of their own. It lives in `CROW_HOME/modules/<name>/` with the same manifest as engine bricks, or comes from a git url that `crow modules add` clones, pins and records in a lock file.
- Keywords: modules, user modules, git install, lock file, crow.yaml, manifest
- Use when: a second user wants their own skills, scripts, sections or pages without patching the engine.
- Skip when: turning engine bricks on or off (item_260, item_263).

# Problem
- A second user's own tools (scripts, skills, runbooks) only fit by patching the engine or keeping symlinks in local/.
- Sharing a brick between users means copying files by hand, with no version.

# Scope
- In:
  - Loader reads `CROW_HOME/modules/<name>/module.yaml` next to the engine manifests; same schema (skills, bin, runbooks, hooks, gather keys, core sections, nest folder).
  - `crow modules add <git url> [--ref <tag|sha>]` clones into `CROW_HOME/modules/<name>/`, checks the manifest, pins the commit in `CROW_HOME/modules.lock`, turns it on in crow.yaml.
  - `crow modules update [<name>]` moves to the newest tag (or the given ref) and rewrites the lock; `crow modules remove <name>` turns it off and deletes the clone.
  - `crow modules list` shows engine and user bricks, source, pinned ref, on/off.
  - Doctor: a user brick with no manifest, a name clash with an engine brick, a dirty clone or a lock mismatch is a finding.
  - A user brick may declare `requires: [<brick>]`; the loader refuses to turn it on when one is off.
  - Docs: how to write a brick (manifest fields, folder layout, script contract).
- Out:
  - A registry or index of public bricks.
  - Runtime code loading in Nest (pages build in at Nest build time, item_267).

# Acceptance criteria
- AC1: A brick in `CROW_HOME/modules/hello/` with one skill and one bin script shows in `crow modules list`, links its skill, and runs its script from `crow`.
- AC2: `crow modules add <file:// test repo> --ref v1` clones, writes the lock with the sha, and turns it on; `update` to v2 rewrites the lock; `remove` leaves no trace in crow.yaml or the lock.
- AC3: A user brick named `forge` is refused with a clear message.
- AC4: Doctor flags a clone whose HEAD differs from the lock.
- AC5: With no user bricks, nothing changes for the owner.

# AC Traceability
- req_064_paul_s_feedback_and_a_modular_public_crow-AC1 -> This backlog slice. Proof: a second user adds their own bricks without local patches.

# Dependencies
- `item_260_module_manifests_crow_yaml_loader_and_doctor_check`.
- `item_261_skills_hooks_and_gather_follow_the_module_switch`.

# Links
- Request: `req_064_paul_s_feedback_and_a_modular_public_crow`
- Architecture decision(s): `adr_002_crow_bricks_module_manifest_and_project_kinds`

# Priority
- Priority: Medium
- Rationale: The way a second user brings their own tools.

# Executions
| When | Runner | Run id | Title | State | PR | Notes |
| --- | --- | --- | --- | --- | --- | --- |
