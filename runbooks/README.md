# Runbooks

Short, tested procedures for things the hub does often. Read the matching runbook
before exploring; update it when reality differs. One file per procedure.

- `runbooks/`: generic, publishable (no names, companies or personal paths).
- `local/runbooks/`: private specifics (accounts, repos, people), indexed in `local/runbooks/README.md`.

Promote a runbook to a skill (`skills/` or `.claude/skills/`) once the user would
want to trigger it by name.

## Index
- `logics-task-closeout.md`: close a Logics orchestration task (scoped AC proof, validation, repair side effects).
- [install-and-update](install-and-update.md): engine vs data dir, install, `crow update`, restore on a new machine
- [dispatch-background-runs](dispatch-background-runs.md): start, track and recover cdx background runs in project repos; isolated runs (`--isolate`) and `crow-isolation-probe`
- [review-findings](review-findings.md): read-only review run of one MR, its findings JSON schema, resume for the apply phase
- [cost-audit](cost-audit.md): measure token spend by context size, model, project and skill; re-measure after a change
- [archeotech-crow-agents](archeotech-crow-agents.md): test the crow agents bar/panel module with fixtures and headless renders
- [archeotech-crow-usage](archeotech-crow-usage.md): test the crow usage bar/panel module (fixtures, render script, sandbox gotchas)
- [sub-project-work](sub-project-work.md): hand repo work off with `crow handoff`, or `crow work` for lookups; the hub guard hook
- [open-project-session](open-project-session.md): open a project session in a new kitty window from the hub (HOME + inherited Claude markers)
- [session-retros](session-retros.md): daily retro batch (Mon–Fri timer → no-model pre-filter → one /retro run → dated report with skipped list)
- [tool-update-watch](tool-update-watch.md): weekly read of crow's tool changelogs (no-model check → one Sonnet run → vault note with proposals, last_read bumped after)
- [agent-tooling](agent-tooling.md): third-party agent tools installed (code graph, graphify, ast-grep, claude-hud), pinned versions, verdicts, undo
- [service-tokens](service-tokens.md): personal API tokens in the keyring via `crow secret` (store, read without printing, rotate, revoke), registry in local/tokens.yaml
- [ci-secrets](ci-secrets.md): prod-scoped CI variables and secrets (owner runs the generator script; scope/protect rules)
- [interrupted-sessions](interrupted-sessions.md): quota warning before a usage limit, `crow rescue` for every session it stopped, relaunch one by id
- [new-account](new-account.md): bring a fresh cdx profile up to crow parity (memory links, env, hooks, skills, MCP); `crow doctor` checks it
- [memory](memory.md): memory lives in local/memory, linked into allowed cdx profiles (never copied)
- [design-sessions](design-sessions.md): design work that survives compaction: `design-notes.md` convention, post-compact hook, `crow-crop` crops and contact sheets
- [design-canvas](design-canvas.md): add or change boards in a Design canvas artifact without losing the owner's layout (live index merge, one file per publish)
- [design-references-in-items](design-references-in-items.md): cite only files a Decision.md approves; re-check Sources copied from parent items
- [visual-concepts](visual-concepts.md): purpose, content, flat sketches, then image-model prompts before any render run for a visual world
- [tui-render](tui-render.md): render a TUI (or ANSI mockup) to PNG in the kitty theme at real monitor sizes; fallback-glyph and contrast checks
- [afk-runs](afk-runs.md): unattended AFK runs (night or day): queue, guardrails, pre-push denylist, return report
- [repo-tidy](repo-tidy.md): daily repo hygiene via `bin/crow-tidy` (safe auto-cleanup in the brief) and the by-hand cleanup steps
- [own-routines](own-routines.md): write your own daily/weekly-style skills in local/hub-skills from the generic examples
- [live-claude-session-test](live-claude-session-test.md): drive a hidden tmux Claude session to live-test hooks and permission prompt answers
- [readme-showcase](readme-showcase.md): method for a marketing README per repo (visuals, header options, structure, audit, preview)
- [claude-and-codex](claude-and-codex.md): what changes on a Codex account (instructions, skills, permission, models) and what the hub guard covers
- [codex-download-relay](codex-download-relay.md): hub-side downloader (`crow-download-relay`) for signed URLs a run without network cannot open
- [long-sessions](long-sessions.md): context cap at 150k, warning at 120k, when to wrap and how to split one session into scoped handoffs
- [vault-capture](vault-capture.md): `crow note`, `crow notes` JSON, the `eod` skill and the capture tags that feed every recap
- [tui-review-ux](tui-review-ux.md): review-tool UX research for the deck MR page: stage rail, whose-move rule, badge options, TUI constraints
- [tui-home-ux](tui-home-ux.md): home dashboard UX research: triage table, day timeline, project cards
- [tui-agents-ux](tui-agents-ux.md): agent monitor UX research: process table, day lanes, inbox-first
- [tui-projects-ux](tui-projects-ux.md): project portfolio UX research: ledger, runway gantt, who-acts lanes
- [tui-usage-ux](tui-usage-ux.md): token and cost usage UX research: ledger, runway timeline, account cards
- [tui-themes-ux](tui-themes-ux.md): TUI theme research: axes a theme can change, four skeleton-level theme specs
- [open-threads](open-threads.md): the three-section format (me, crow, waiting) of `Open Threads.md`, the done and stale rules, who reads and writes it
- [pending-items](pending-items.md): one schema over Open Threads and pending files (`crow-pending`): loss check, overdue follow-ups for brief and Inbox, purge of settled rows
- [graph-today](graph-today.md): Entra app + device-code login for `bin/crow-today`, the Graph calendar and mail feed of the deck Today box
- [releases](releases.md): VERSION, per-release changelogs, the aggregate and the version-bump gate, `crow release propose`
- [mission-e2e-scratch](mission-e2e-scratch.md): real cheap mission run (dispatch, park, answer, resume) in a scratch core store, and how to read a failed run
- [headless-webgl-render](headless-webgl-render.md): render WebGL pages to PNG and bench frame time headless (SwiftShader and real GPU)
- [core-service](core-service.md): install and probe the crow-core service (read API under /api, Nest at /, tailnet identity, socket)
- [nest-screenshots](nest-screenshots.md): headless screenshots of the Nest PWA at the board sizes, both themes; hero layout, idle and perf scripts
- [nest-phone-install](nest-phone-install.md): serve Nest on the tailnet and install it as an app on Android (Play parks it while the VPN is up)
- [vault-sync-new-device](vault-sync-new-device.md): add a machine to the vault Syncthing mesh (direct pairing, ignore patterns, conflict cleanup)
- [remote-computer-use-windows](remote-computer-use-windows.md): give a Windows Claude Code session desktop control from the phone (RC + Windows-MCP, no admin)
- [office-documents](office-documents.md): office brick: DOCX build (`simpledoc.py`), tracked-changes redline (`crow-docx-redline`), mail text (`crow-mailtxt`), PDF render and xlsx form gotchas; needs `uv`
