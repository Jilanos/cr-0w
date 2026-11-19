## item_232_private_skills_from_local_and_capabilities_per_account - Private skills from local and capabilities per account
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
- Summary: crow loads private skills from `local/skills/*/SKILL.md` (or `skills_dirs` in config) without symlinks; accounts get capabilities (mail, m365, network, ...) and a dispatch that needs a missing one is refused; `--account` flag replaces the per-account wrapper scripts.
- Keywords: skills, local, private, accounts, capabilities, dispatch, policy
- Use when: touching skill loading or account policy.
- Skip when: account picking by quota (item_027).

# Problem
- Paul symlinks private skills into .claude/skills (git-ignored) and writes wrapper scripts per account (§4.1, §4.5, §4.7).
- His real rules (workb never does mail, only claude has M365) live as prose.

# Scope
- In:
  - `skills_dirs` (default `local/skills`) linked or exposed at session start; doctor lists them.
  - `capabilities:` per account in `local/accounts.yaml`; jobs declare `needs:`; dispatch refuses with a clear reason.
  - `crow --account <name>` on every command that picks an account.
  - Docs in the README config section.
- Out:
  - Policy for hub rules (req_047).

# Acceptance criteria
- AC1: A skill in local/skills/x/SKILL.md is listed and usable in a hub session without a symlink.
- AC2: A dispatch needing `mail` on an account without it is refused with the reason.
- AC3: `crow --account workb dispatch ...` uses workb.

# AC Traceability
- req_064_paul_s_feedback_and_a_modular_public_crow-AC -> This backlog slice. Proof: A skill in local/skills/x/SKILL.md is listed and usable in a hub session without a symlink.

# Dependencies
- None.

# Links
- Request: req_064_paul_s_feedback_and_a_modular_public_crow.

# Priority
- Priority: Medium
- Rationale: Little code, removes most of Paul's local workarounds.

# Executions
| When | Runner | Run id | Title | State | PR | Notes |
| --- | --- | --- | --- | --- | --- | --- |
