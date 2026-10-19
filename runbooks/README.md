# Runbooks

Short, tested procedures for things the hub does often. Read the matching runbook
before exploring; update it when reality differs. One file per procedure.

- `runbooks/`: generic, publishable (no names, companies or personal paths).
- `local/runbooks/`: private specifics (accounts, repos, people), indexed in `local/runbooks/README.md`.

Promote a runbook to a skill (`skills/` or `.claude/skills/`) once the user would
want to trigger it by name.

## Index
- [dispatch-background-runs](dispatch-background-runs.md): start, track and recover cdx background runs in project repos
