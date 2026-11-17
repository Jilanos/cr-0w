## req_045_periodic_tool_update_watch - Periodic tool update watch: cdx, logics-manager, Claude Code and other tools, mapped to crow
> From version: 1.0.0
> Schema version: 1.0
> Status: In progress
> Understanding: 85
> Confidence: 80
> Complexity: Medium
> Theme: Hub upkeep
> Reminder: Update status/understanding/confidence and linked backlog/task references when you edit this doc.
> Indicators reviewed: 2026-11-09 17:28:44

# AI Context
- Summary: crow checks the tools it is built on (cdx, logics-manager, Claude Code, Codex CLI, rtk) on a schedule, reads what changed since the last check, maps each change to what crow does today, and files proposals the owner decides on.
- Keywords: tool updates, changelog, cdx, logics-manager, claude code, codex, rtk, timer, ritual, upkeep
- Use when: building the watch ritual or changing which tools it follows.
- Skip when: installing or upgrading packages on the machine. That belongs to the owner's dotfiles repo.

# Needs
- The owner no longer has to ask "is there anything new in cdx or logics we should leverage". A scheduled check answers it.
- Each new release is read once. Changes that touch something crow does (a workaround, a hand-built path, a missing feature) become proposals with the crow file or Logics item they affect.
- An installed version behind the latest is visible, so the owner knows an update is due.

# Context
- 2026-11-09: a manual pass over cdx 0.26.0..0.26.11 and logics-manager 2.24.x found eight usable changes. They were filed as notes on item_116, item_133, item_136 and as item_142. This request makes that pass recurring.
- Existing pattern to reuse: `bin/crow-retro` (systemd user timer, no-model pre-filter, one batch run, dated report). See runbooks/session-retros.md.
- Machine package updates (pacman, AUR, npm globals, cdx install) move to the owner's dotfiles repo. This request only reads versions and changelogs.
- Installed versions: read `~/.local/state/archeotech-updates/versions.json` (schema 1, one entry per followed tool: version, method, last_update, last_run, last_result), written by the dotfiles daily user-tool job. Never run an updater to get a version. Format: archeotech-dotfiles `docs/UPDATES.md` (versions.json section).

# Acceptance criteria
- AC1: a tool list in `local/` (name, version command, changelog source, last version read) drives the check; adding a tool is one entry.
- AC2: a weekly timer runs a no-model pre-filter. When no followed tool has a new release, nothing else runs.
- AC3: on new releases, one run on the smallest fitting model writes a dated note in the vault crow folder: per tool, versions read, changes that matter to crow with the file or item they affect, and proposals. It never edits code.
- AC4: the brief shows the latest note while it holds open proposals. The owner picks proposals through a prompt; picked ones become Logics notes or items.
- AC5: a runbook describes the ritual and is in runbooks/README.md.

# Definition of Ready (DoR)
- [x] Problem statement is explicit and user impact is clear.
- [x] Scope boundaries (in/out) are explicit.
- [x] Acceptance criteria are testable.
- [x] Dependencies and known risks are listed.

# Companion docs
- Product brief(s): (none yet)
- Architecture decision(s): (none yet)

# References
- `bin/crow-retro`
- `runbooks/session-retros.md`
- `runbooks/install-and-update.md`
- archeotech-dotfiles `docs/UPDATES.md` (versions.json, update policy) and req_013

# Backlog
- `item_141_tool_update_watch_ritual`
- `item_142_logics_fleet_in_the_brief`
- `item_153_upgrade_claude_code_to_2_1_321_and_fix_the_dispatch_timeout_wording`
- `item_154_check_crow_against_rtk_1_x_before_upgrading`

# Executions
| When | Runner | Run id | Title | State | PR | Notes |
| --- | --- | --- | --- | --- | --- | --- |
