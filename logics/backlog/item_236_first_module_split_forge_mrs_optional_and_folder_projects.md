## item_236_first_module_split_forge_mrs_optional_and_folder_projects - First module split: forge/MRs optional and folder projects
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
- Summary: Apply the ADR to the first brick: forge/MR features (crow-mrs, review skills, MR hooks, Nest MRs tab, deck MRs tab) turn off with one manifest switch, and folder projects skip git steps.
- Keywords: modules, forge, mrs, optional, folder projects, manifest
- Use when: making the MR brick optional.
- Skip when: other bricks.

# Problem
- Paul works alone in a folder with no forge; MR features are noise for him.

# Scope
- In:
  - Manifest flag `modules.forge`; when off: MR scripts not run by brief/gather, skills not installed, tabs hidden, doctor quiet.
  - `kind: folder` projects: crow-activity reads file changes, commit/push rules skip.
  - Test both settings in crow-check.
- Out:
  - Other bricks.

# Acceptance criteria
- AC1: With forge off, brief, gather, doctor and Nest run without any forge call or error.
- AC2: A folder project shows activity in brief.
- AC3: With forge on, nothing changes (owner's setup).

# AC Traceability
- req_064_paul_s_feedback_and_a_modular_public_crow-AC -> This backlog slice. Proof: With forge off, brief, gather, doctor and Nest run without any forge call or error.

# Dependencies
- Module design ADR approved.

# Links
- Request: req_064_paul_s_feedback_and_a_modular_public_crow.

# Priority
- Priority: Medium
- Rationale: Smallest split with the most value for a solo user.

# Executions
| When | Runner | Run id | Title | State | PR | Notes |
| --- | --- | --- | --- | --- | --- | --- |
