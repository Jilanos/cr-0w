## item_235_module_design_for_a_public_crow_bricks_manifest_and_project_kinds - Module design for a public crow: bricks, manifest and project kinds
> From version: 1.0.0
> Schema version: 1.0
> Status: Done
> Understanding: 95
> Confidence: 85
> Progress: 100%
> Complexity: High
> Theme: General
> Reminder: Update status/understanding/confidence/progress and linked request/task references when you edit this doc.

# AI Context
- Summary: Architecture decision: split crow into a small core plus optional bricks (forge/MRs, mail, calendar, Jira/Confluence, vault, AFK queue, deck TUI, Nest web front, core API back) turned on in one manifest, with project kinds (git repo, folder) so a solo or non-dev user like Paul gets only what fits.
- Keywords: modules, bricks, manifest, public, config, project kinds, front, back, architecture
- Use when: deciding how crow is split or configured.
- Skip when: building a single module.

# Problem
- Owner 2026-11-17: make crow a real public project anyone can configure; Paul works alone and needs no MR brick; the web app could be a separate brick with front and back split.
- Today every script assumes forge, MR, Jira and vault. Paul's WORK folder has no git (§6.11); `crow-activity` and commit rules make no sense there.
- Related: req_047 (hub rules in policy.yaml), item_122 (CROW_HOME is the private config repo), req_051 (publishable engine ideas).

# Scope
- In:
  - Inventory: every bin/ script, skill, runbook, hook and core route tagged with the brick it belongs to (table in the ADR).
  - Manifest: `local/crow.yaml` `modules:` on/off plus per-module config; doctor checks it; skills and hooks of an off module are not installed.
  - Project kinds in `projects.yaml`: `repo` (forge, MR, commit rules) and `folder` (no git steps).
  - Front/back: crow-core (Go API) as the back brick with a versioned contract (`logics/specs/script_contract`), Nest as a front brick that reads which modules are on and hides their tabs; deck TUI the same way.
  - Paul's panel idea (§4.6) answered: Nest is the panel; pluggable Nest sections from module manifests instead of a second server.
  - Migration order and the backlog items it creates (each brick split = one item).
  - Owner reviews the ADR before any split.
- Out:
  - Doing the split (follow-up items).

# Acceptance criteria
- AC1: ADR in logics/architecture with the inventory table and the manifest schema; owner OK.
- AC2: Every script and skill has a brick in the table.
- AC3: Follow-up items created for each split, in order.

# AC Traceability
- AC1 -> `adr_002_crow_bricks_module_manifest_and_project_kinds`: inventory table, `crow.yaml` `modules:` schema, project `layout`, front/back split, Nest as the panel, migration order. Accepted by the owner 2026-11-19, all five proposed choices kept.
- AC2 -> `logics/specs/module_inventory/bricks.tsv` tags 170 pieces (bin/ scripts, skills, runbooks, Claude and git hooks, core routes and sections, tools, integrations). `tests/test_module_inventory.py` fails crow-check on any untagged, stale or unknown row.
- AC3 -> split items in adr_002 Migration order: item_260, item_261, item_236, item_237, item_262, item_263; listed in req_064 Backlog and Execution order.
- req_064_paul_s_feedback_and_a_modular_public_crow-AC2 -> AC2 above.

# Progress
- 2026-11-19: inventory script and tags, adr_002 drafted, four split items created, items 236 and 237 aligned (`layout` key, dependencies, ADR links). Owner accepted adr_002 2026-11-19 with all five proposed choices.

# Dependencies
- Paul's code and bug items done first (owner order).

# Links
- Request: req_064_paul_s_feedback_and_a_modular_public_crow.
- Architecture decision(s): `adr_002_crow_bricks_module_manifest_and_project_kinds`
- Next: `item_260_module_manifests_crow_yaml_loader_and_doctor_check`

# Priority
- Priority: High
- Rationale: Gates every later split and Paul's onboarding.

# Executions
| When | Runner | Run id | Title | State | PR | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11-19T10:30:12.612132+00:00 | cdx | 5bfe282ec6074fccbbf29b53a884892d | item-235-modules | succeeded |  | commits ad2cb52, b270f96, e321e3d; ADR awaits owner review |

