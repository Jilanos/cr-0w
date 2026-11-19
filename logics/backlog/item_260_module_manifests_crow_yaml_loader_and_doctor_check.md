## item_260_module_manifests_crow_yaml_loader_and_doctor_check - Module manifests, crow.yaml loader and doctor check
> From version: 1.0.0
> Schema version: 1.0
> Status: In progress
> Understanding: 85
> Confidence: 80
> Progress: 0%
> Complexity: Medium
> Theme: General
> Reminder: Update status/understanding/confidence/progress and linked request/task references when you edit this doc.
> Owner: crow
> Indicators reviewed: 2026-11-19 15:49:06

# AI Context
- Summary: Split step 1 of adr_002: engine module manifests per brick, the crow.yaml loader in Python, Go and `crow modules`, and a doctor modules check. No behaviour change.
- Keywords: modules, manifest, crow.yaml, loader, doctor, bricks
- Use when: building the module foundation every later split reads.
- Skip when: turning a specific brick off (items 261, 236, 237, 262, 263).

# Problem
- Bricks exist only as tags in `logics/specs/module_inventory/bricks.tsv`. Nothing reads which bricks are on.

# Scope
- In:
  - `modules/<brick>.yaml` per brick, fields as in adr_002 (requires, scripts, skills, hooks, core sections and routes, gather, doctor, nest, deck, config).
  - The inventory test reads the manifests; `bricks.tsv` is removed.
  - Loader: `crow_lib.modules()`, `config.Modules` in crow-core, `crow modules` and `crow modules json`. Defaults from adr_002 when `crow.yaml` or a key is missing; CROW_HOME root or `local/crow.yaml`.
  - `crow-doctor` `modules` check: parse, unknown names and keys, `requires`, needed tools.
  - `docs/crow.example.yaml`.
- Out:
  - Acting on an off brick (item_261 onward).

# Acceptance criteria
- AC1: With no crow.yaml, `crow modules json` lists the adr_002 defaults and every command behaves as before.
- AC2: An unknown brick, unknown key or unmet `requires` makes `crow doctor` fail with the file and key named.
- AC3: Python and Go loaders return the same on set for the same file (shared fixture test).
- AC4: The inventory test passes against the manifests.

# AC Traceability
- req_064_paul_s_feedback_and_a_modular_public_crow-AC2 -> This backlog slice. Proof: inventory test reads the module manifests.
- req_064_paul_s_feedback_and_a_modular_public_crow-AC3 -> This backlog slice. Proof: loader and doctor check that later splits build on.

# Dependencies
- adr_002 accepted by the owner.

# Links
- Request: `req_064_paul_s_feedback_and_a_modular_public_crow`
- Architecture decision(s): `adr_002_crow_bricks_module_manifest_and_project_kinds`
- Next: `item_261_skills_hooks_and_gather_follow_the_module_switch`

# Priority
- Priority: Medium
- Rationale: Every module split reads this loader.

# Executions
| When | Runner | Run id | Title | State | PR | Notes |
| --- | --- | --- | --- | --- | --- | --- |
