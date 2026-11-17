# Set up a new cdx account for crow

A fresh cdx profile is bare: no crow env, no hooks, no memory links, no crow skills. `crow doctor` (profiles check)
lists what a `use` account with permanent memory still misses.

1. Log in with cdx, then add the account to `local/accounts.yaml` (policy, memory mode).
2. `bin/crow-memory link <account>`: links every `local/memory/<slug>` into the profile. Empty real dirs are fine.
3. Settings: back up `<profile>/claude-home/.claude/settings.json`, then copy from the default account's settings:
   `env` (CROW_HOME, CLAUDE_CODE_AUTO_COMPACT_WINDOW, BROWSER, gh/glab config dirs), `hooks` (cdx notify,
   `crow-ctx idle-hook`, the RTK PreToolUse hook, `<hub>/bin/crow-prompt hook` as PermissionRequest so
   Nest shows the prompt), `attribution: {commit: "", pr: ""}`, `effortLevel`, `tui`.
   Skip account-specific blocks such as `autoMode`. `jq -s` merges them in one step.
4. Skills: symlink each `skills/<name>` of the hub into `<profile>/claude-home/.claude/skills/` (replace plain copies). Design skills are not linked: `bin/crow-skills-ext link` installs the crow-design plugin, disabled, and the hub project gets `"disabledMcpServers": ["playwright"]` in the profile `.claude.json`.
5. Status line (optional): copy `plugins/claude-hud/` and `plugins/cache/claude-hud/` from the default profile and
   point `statusLine.command` at the new profile path.
6. MCP connectors are per account: run `/mcp` in a session on the new account and authenticate what it needs.
7. `crow doctor` shows `profiles ok`.
