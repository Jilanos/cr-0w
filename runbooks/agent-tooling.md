# Agent tooling: what's installed, pinned versions, verdicts

Install third-party tools from releases at least two weeks old, verify checksums when published, and never let them phone home.

| Tool | Install | Version | Use | Verdict (trial date) |
|---|---|---|---|---|
| rtk | existing | — | shell output compression (PreToolUse hook) | keep |
| codebase-memory-mcp | release tarball (checksum verified) in `~/.local/share/codebase-memory-mcp/<ver>/`, symlink `~/.local/bin/codebase-memory-mcp` | v0.11.0 | code graph MCP: `detect_changes`, `trace_path`, `search_graph`; indexes Python **and Terraform/shell**; added to a repo via its (gitignored) `.mcp.json` as `codebase-memory` | adopt: indexed a 4.7k-node monorepo in 8s; code-review-graph only saw Python (2026-10-20) |
| code-review-graph | existing | — | Python-only graph, `detect-changes --base` on the checked-out tree | keep until codebase-memory has proven itself, then drop |
| graphify | `uv tool install graphifyy==<ver>` (CLI only, never `graphify install`) | 0.9.77 | visual map: `graphify extract <repo> --code-only` (local AST, 0 tokens) then `cluster-only` → `graph.html`. It writes `graphify-out/` **into the repo**: move it to `~/.local/share/graphify/<project>/`. Terraform needs `graphifyy[terraform]` | try: good overview, no Terraform yet (2026-10-20) |
| ast-grep | `uv tool install ast-grep-cli` (pacman's needs sudo) | 0.51.0 | structural search for review checks | adopt |
| claude-hud | `claude plugin marketplace add "jarrodwatts/claude-hud#<tag>"`, `claude plugin install claude-hud@claude-hud`, then `node <plugin>/scripts/setup.mjs install --shell posix` (per cdx profile) | 0.11.2 | statusline: context, 5h/7d limits, cost | try (2026-10-20) |

Skipped after research (2026-10-20): caveman (telemetry on by default, ~4% over a plain "be brief"), ccusage/codeburn (overlap `crow usage`, no cdx profile awareness), context-mode (hook clash with rtk), claude-mem / claude-reflect (overlap retros), GitNexus (non-commercial license), pr-agent (needs API key, no learning).

## Undo
- claude-hud: restore `statusLine` from `settings.json.bak.*` in the profile, `claude plugin uninstall claude-hud@claude-hud`.
- graphify / ast-grep: `uv tool uninstall graphifyy` / `ast-grep-cli`.
- codebase-memory: remove the `codebase-memory` entry from the repo's `.mcp.json`, delete the symlink and `~/.local/share/codebase-memory-mcp`; index cache lives in `<profile home>/.cache/codebase-memory-mcp`.
