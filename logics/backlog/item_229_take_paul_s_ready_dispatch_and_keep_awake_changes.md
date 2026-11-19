## item_229_take_paul_s_ready_dispatch_and_keep_awake_changes - Take Paul's ready dispatch and keep-awake changes
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
- Summary: Port Paul's generic changes into the repo: `crow dispatch --cwd <repo>.wt/<name>`, `crow dispatch --model`, a configurable default permission for one-shots and dispatches, `crow-keep-awake` with the WSL preflight check and the afk skill step.
- Keywords: dispatch, cwd, worktree, model, permission, keep-awake, wsl, afk, paul
- Use when: porting Paul's §2 changes.
- Skip when: his private local/ files.

# Problem
- Paul runs these changes daily from an uncommitted checkout (feedback 2026-11-17 §2). They are generic and tested on his machine.

# Scope
- In:
  - Get his diff as a patch file (only bin/ and runbooks/ changes listed in §2), review it, apply on a branch.
  - `--cwd`: only a worktree under `<project path>.wt/`.
  - `--model`: overrides the model picked by `--power`.
  - Permission default: a config key (`dispatch.permission` per account or project, default stays today's `auto`/`default`), not a hardcoded `full`.
  - `crow-keep-awake` (systemd-inhibit on Linux, EncodedCommand on WSL), `crow-afk-preflight` WSL check, afk skill step at go.
  - Runbooks: claude-and-codex, dispatch-background-runs, codex-download-relay updated.
- Out:
  - Paul's private skills and state.

# Acceptance criteria
- AC1: A dispatch with `--cwd <repo>.wt/x` runs in that worktree; a path outside is refused.
- AC2: `--model` shows in the run record.
- AC3: Default permission comes from config; unset keeps today's behaviour.
- AC4: On WSL the preflight reports the sleep block; on Linux keep-awake uses systemd-inhibit.
- AC5: `bin/crow-check` green.

# AC Traceability
- req_064_paul_s_feedback_and_a_modular_public_crow-AC -> This backlog slice. Proof: A dispatch with `--cwd <repo>.wt/x` runs in that worktree; a path outside is refused.

# Dependencies
- Patch from Paul (ask him for it; draft the Teams/mail text for owner approval).

# Links
- Request: req_064_paul_s_feedback_and_a_modular_public_crow.

# Priority
- Priority: High
- Rationale: Ready code, used every night by a second user.

# Executions
| When | Runner | Run id | Title | State | PR | Notes |
| --- | --- | --- | --- | --- | --- | --- |
