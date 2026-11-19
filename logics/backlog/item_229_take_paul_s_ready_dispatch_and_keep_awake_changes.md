## item_229_take_paul_s_ready_dispatch_and_keep_awake_changes - Take Paul's ready dispatch and keep-awake changes
> From version: 1.0.0
> Schema version: 1.0
> Status: In progress
> Understanding: 95
> Confidence: 90
> Progress: 90%
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
- AC1 -> `--cwd` was already on main (crow-runs dispatch). Proof: tests/test_crow_dispatch_cwd_model.py (worktree runs there; sibling folder, missing worktree and main checkout refused). Source: `3560b51`
- AC2 -> `--model` was already on main. Proof: same file, `model` and pinned `model_id` in the ledger record. Source: `3560b51`
- AC3 -> `permission` in `local/headless.json` (`default` or `full`, same value for both providers), `default` when the file or key is absent, anything else stops the launch. Proof: tests/test_crow_headless_permission.py, incl. `crow dispatch --dry-run` passing `--permission full`. Source: `9147b74`
- AC4 -> `crow-keep-awake` runs `systemd-inhibit` on Linux, an encoded PowerShell sleep block on WSL, and is a no-op elsewhere; the preflight reports the Windows sleep block on WSL. Proof: tests/test_crow_keep_awake.py (no-op path, both `--print` commands, preflight OK/WARN with a mocked `/proc/version` and `pgrep`). Source: `000f681`, `913f622`
- AC5 -> `bin/crow-check` green, 728 passed. Source: `913f622`
- item_230 residual bug 2 -> a Codex run that stopped before its final message: `crow-runs report` returns `Report file: <path>` plus the file when the run changed or named a markdown report. Proof: tests/test_crow_runs_actions.py (`test_codex_stopped_before_final_message_reads_the_report_file` fails on the old code). Source: `095f8ee`

# Patch review (second user's 1-generic-changes.patch)
| Hunk | Decision | Why |
| --- | --- | --- |
| crow-accounts usage line | taken | |
| crow-afk-preflight WSL check | taken | `/proc/version` path overridable (`CROW_PROC_VERSION`) for tests |
| crow-keep-awake | taken, extended | added the Linux `systemd-inhibit` branch (item scope), a no-op when no inhibitor exists, `--print`, a numeric seconds check |
| crow-download-relay | taken, hardened | HTTPS only; a dest must be absolute and under the manifest's folder (or a given root), else `REFUSED` |
| crow_lib.permission | taken, changed | exits with the file path on bad JSON or an unknown value instead of a traceback; `env` param for tests |
| examples/headless.json | taken | |
| afk-runs keep-awake step | taken, reworded | dropped the dated night anecdote |
| afk-runs mail check line | dropped | out of item scope (mail jobs) |
| claude-and-codex | taken, reworded | kept the "no network in default mode" note the patch removed: still true |
| codex-download-relay runbook | taken, reworded | dropped dates; documents the new guard |
| folder-restructure runbook | dropped | out of item scope; French status words in a generic runbook |
| dispatch-background-runs permission line | taken, reworded | kept "Deletions in auto mode" (the patch orphaned its next line) |
| dispatch-background-runs failover line | dropped | `--failover` is still on every non-isolated run on main; the replacement text was wrong for this repo |

# Notes
- Permission home: `local/headless.json` stays. The crow.yaml loader (adr_002, item_260) does not exist yet; when it lands the key can move there with headless.json kept as a fallback. adr_002 keeps policy in policy.yaml, which may be the better home: owner decision.
- Not done: the afk skill "go" step (`.claude/skills/afk/SKILL.md`) still says "start the sleep inhibitor printed by the preflight"; the run had no write permission on `.claude/`. One-line change: "start `bin/crow-keep-awake` as a background command and check it prints `awake for`".
- Scope said per account or project; the patch is one global value. Kept global.

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
| 2026-11-19T14:44:47.940059+00:00 | cdx | f89feb9d4f2b4ef3acc96518b9b090d2 | item-229-paul-generic | succeeded |  | 5 commits 000f681..913f622; afk skill step left (no .claude write) |

