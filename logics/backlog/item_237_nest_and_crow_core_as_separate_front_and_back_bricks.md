## item_237_nest_and_crow_core_as_separate_front_and_back_bricks - Nest and crow-core as separate front and back bricks
> From version: 1.0.0
> Schema version: 1.0
> Status: Ready
> Understanding: 85
> Confidence: 80
> Progress: 0%
> Complexity: Medium
> Theme: Nest
> Reminder: Update status/understanding/confidence/progress and linked request/task references when you edit this doc.

# AI Context
- Summary: Package crow-core (API) and Nest (web front) as their own bricks: own install step, config for the core URL and auth, Nest reads enabled modules from core, works on a setup without MR or mail modules.
- Keywords: nest, crow-core, front, back, packaging, install, api contract
- Use when: packaging Nest or core separately.
- Skip when: Nest features.

# Problem
- Nest and core ship inside the hub repo and assume the owner's modules and machine.

# Scope
- In:
  - `/api/modules` in core; Nest hides tabs and panels of off modules.
  - Nest config: core URL, token; build once, serve anywhere (static dist).
  - Install docs per brick; contract versioned and checked in CI.
  - Try it on Paul's setup (WSL, no forge) as the acceptance run.
- Out:
  - Hosting outside the tailnet.

# Acceptance criteria
- AC1: Nest built with no MR/mail modules shows no empty tabs.
- AC2: Paul runs Nest against his core from the install docs only.
- AC3: Contract check passes in crow-check.

# AC Traceability
- req_064_paul_s_feedback_and_a_modular_public_crow-AC -> This backlog slice. Proof: Nest built with no MR/mail modules shows no empty tabs.

# Dependencies
- Module design ADR; first split.

# Links
- Request: req_064_paul_s_feedback_and_a_modular_public_crow.

# Priority
- Priority: Medium
- Rationale: Turns Nest into something another user can run.

# Executions
| When | Runner | Run id | Title | State | PR | Notes |
| --- | --- | --- | --- | --- | --- | --- |
