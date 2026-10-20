# Memory in local/

Claude memory is stored once, in `local/memory/<project-slug>/` (the private `local/` repo), and every allowed
cdx profile reaches it through a symlink: `<profile>/claude-home/.claude/projects/<slug>/memory -> local/memory/<slug>`.
Nothing is copied into a profile, so a shared account never holds a copy.

- Accounts and their memory mode live in `local/accounts.yaml` (`memory: permanent` keeps the links, `session` links for the length of a `crow` session only). Example: `docs/accounts.example.yaml`.
- `bin/crow-memory status`: every profile/project, as real dir, link or missing.
- `bin/crow-memory migrate <account>`: move that account's real memory dirs into `local/memory`, leave links, keep the old dir as `memory.premigrate` (delete it once you trust the result).
- `bin/crow-memory link|unlink <account>`: `crow open/hub` do this for `session` accounts and clean up on exit.
- `bin/crow-memory commit`: commit pending memory changes in `local/` (run it from `/wrap`).
- A real, non-empty memory dir in a profile is never overwritten by `link`; migrate or move it first.
- Not synced anywhere: `local/` has no remote. Add a private one if you want a backup.
