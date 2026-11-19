# Claude and Codex accounts

Crow drives any cdx account. The provider comes from `cdx status --cached --json` (`crow-accounts provider <name>`);
an account cdx does not describe counts as Claude. Policy (`use`, `ask-first`, `never`) in `local/accounts.yaml` is unchanged.

## What differs on Codex

| Area | Claude | Codex |
|---|---|---|
| Hub instructions | `CLAUDE.md` and linked memory, loaded by the client | `AGENTS.md` only; the prompt lists the files to read first (`CLAUDE.md`, `AGENTS.md`, `LOGICS.md`, owner prefs, context, memory index) |
| Hub skills (`brief`, `daily`, `weekly`, `retro`) | slash command | prompt names the skill file under `.claude/skills/`, `skills/` or `local/skills/`; a missing file stops the run |
| One-shot permission | headless permission (below) | headless permission (below) |
| Background dispatch | headless permission | headless permission, prompt starts with the read-first list |
| Retro model | `CROW_RETRO_MODEL` (default `sonnet`) | `CROW_RETRO_CODEX_MODEL` (default: the account's own model) |
| Model name | `claude-*`, opus, sonnet, haiku, fable | `gpt-*`, `o<N>`, `codex*`; a name from the other provider is refused |

## Guarded operations

The hub guard (`bin/crow-hub-guard`) is a Claude hook. Codex has no hook, so crow does not rely on it there.

| Operation | Claude | Codex |
|---|---|---|
| `crow` (interactive hub session) | hook asks before commit, push, rebase, MR | refused (`crow-accounts hub-session`) |
| `crow brief`, `daily`, `weekly`, retros | hook | one-shot run (headless permission) |
| `crow open/term/handoff <project>` | the repo's own rules | the repo's own rules (`AGENTS.md`) |
| `crow dispatch` | headless permission | headless permission |

In `default` mode a Codex run has no network, so a brief cannot reach the forge. Run it on Claude, or set `full`.

## Headless permission

`permission` in `local/headless.json` (template: `examples/headless.json`) sets the cdx permission of one-shots and
dispatches on both providers:
- `default` (also when the file is absent): Claude runs only the kind's sandbox allowlist; Codex writes in the workspace, no network.
- `full`: no sandbox, network on.

Review runs (`--permission review`) and isolated runs keep their own mode. Any other value stops the launch.

## Not covered yet

- Live activity of a Codex session (transcript reading): `crow watch` lists the process only.
- Session titles use the `claude` CLI directly (`CROW_TITLE_CMD`).
- Cross-provider relaunch, Codex usage and cost.

## Check

`crow-accounts provider <name>`, `crow-accounts permission <name>`, `crow-accounts prompt <name> brief`.
