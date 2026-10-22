## req_002_sub_project_work_from_the_hub_with_the_repo_s_own_tools - Sub-project work from the hub with the repo's own tools
> From version: 1.0.0
> Schema version: 1.0
> Status: Draft
> Understanding: 90%
> Confidence: 85%
> Complexity: Medium
> Theme: Hub orchestration
> Reminder: Update status/understanding/confidence and linked backlog/task references when you edit this doc.

# AI Context
- Summary: Hub work on a registered project runs without that repo's skills, hooks and rules; hand it off to a repo session or index the repo's tools first, and guard the risky commands.
- Keywords: sub, project, work, hub, repo, own, tools
- Use when: changing how the hub works on registered projects (hand-off, crow work, hub guard hook).
- Skip when: the work is inside a repo session already.

# Needs
- Work on a sub-project from the hub should be as good as work done in that repo: the repo's skills, instructions, hooks and permission rules apply.
- Hub-side rules (MR template, push approval, commit format, worktree place, review ledgers) must reach repo sessions started from the hub.

# Context
- One week of retros listed ten cases: MR opened without the repo template, unapproved pushes, fixes stacked without the repo's approach, edits that skipped the repo's gate hooks, /tmp worktrees, hand-off prompts without an end state.
- Claude Code loads skills, commands and agents of an `--add-dir` directory, its CLAUDE.md only behind an env var, and never its hooks or permission rules.
- Decision doc: docs/sub-project-work.md. Runbook: runbooks/sub-project-work.md.

# Acceptance criteria
- AC1: `crow handoff <project>` opens a repo session whose first prompt carries task, required end state, the repo's skills and instructions, and the hub rules the repo cannot see; the note is saved in the state dir.
- AC2: `crow work <project>` lists the repo's instructions, skills, commands and agents, and what a hub session cannot run (hooks, denies).
- AC3: a hub hook asks before commit, push, rebase, merge or MR creation in a registered repo and before a /tmp worktree, and notes the hand-off option once per project when a prompt names one.
- AC4: CLAUDE.md states the rule; a runbook and tests cover it.

# Definition of Ready (DoR)
- [ ] Problem statement is explicit and user impact is clear.
- [ ] Scope boundaries (in/out) are explicit.
- [ ] Acceptance criteria are testable.
- [ ] Dependencies and known risks are listed.

# Companion docs
- Product brief(s): (none yet)
- Architecture decision(s): (none yet)

# References
- `bin/crow-project`
- `bin/crow-hub-guard`
- `tests/test_crow_project.py`

# Backlog
- none
