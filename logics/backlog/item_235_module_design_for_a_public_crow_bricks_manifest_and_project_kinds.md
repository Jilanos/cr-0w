## item_235_module_design_for_a_public_crow_bricks_manifest_and_project_kinds - Module design for a public crow: bricks, manifest and project kinds
> From version: 1.0.0
> Schema version: 1.0
> Status: Ready
> Understanding: 85
> Confidence: 80
> Progress: 0%
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
- req_064_paul_s_feedback_and_a_modular_public_crow-AC -> This backlog slice. Proof: ADR in logics/architecture with the inventory table and the manifest schema; owner OK.

# Dependencies
- Paul's code and bug items done first (owner order).

# Links
- Request: req_064_paul_s_feedback_and_a_modular_public_crow.

# Priority
- Priority: High
- Rationale: Gates every later split and Paul's onboarding.

# Executions
| When | Runner | Run id | Title | State | PR | Notes |
| --- | --- | --- | --- | --- | --- | --- |
