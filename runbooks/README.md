# Runbooks

Short, tested procedures for things the hub does often. Read the matching runbook
before exploring; update it when reality differs. One file per procedure.

- `runbooks/`: generic, publishable (no names, companies or personal paths).
- `local/runbooks/`: private specifics (accounts, repos, people), indexed in `local/runbooks/README.md`.

Promote a runbook to a skill (`skills/` or `.claude/skills/`) once the user would
want to trigger it by name.

## Index
- [dispatch-background-runs](dispatch-background-runs.md): start, track and recover cdx background runs in project repos
- [archeotech-crow-agents](archeotech-crow-agents.md): test the crow agents bar/panel module with fixtures and headless renders
- [archeotech-crow-usage](archeotech-crow-usage.md): test the crow usage bar/panel module (fixtures, render script, sandbox gotchas)
- [open-project-session](open-project-session.md): open a project session in a new kitty window from the hub (HOME + inherited Claude markers)
- [session-retros](session-retros.md): automatic retrospective after every session (SessionEnd hook → queue → /retro on Sonnet)
- [agent-tooling](agent-tooling.md): third-party agent tools installed (code graph, graphify, ast-grep, claude-hud), pinned versions, verdicts, undo
