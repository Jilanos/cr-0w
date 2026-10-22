# cdx compatibility: Claude and Codex

Crow drives Claude Code and Codex through cdx. It talks to cdx only through its public JSON
commands (`cdx <command> --json`) in `bin/crow_cdx.py`. It never imports cdx internals and does
not care whether the `cdx` executable is a Node launcher or a Python script.

## Tested versions

| cdx | Status |
|---|---|
| 0.21.5 | tested: offline fixtures in `tests/fixtures/cdx-0.21.5`, live read-only checks |
| 0.21.4 | minimum accepted (`MIN_VERSION`); contracts inspected, same envelopes |
| older | refused before any launch with `cdx_too_old` (`cdx update`) |

Every envelope is checked: `schema_version` must be 1 and `ok` true. A missing CLI, a timeout,
non-JSON output, another schema version or `ok: false` stops the command with an actionable
message and a stable code (`cdx_missing`, `cdx_timeout`, `cdx_not_json`, `cdx_schema_unsupported`,
or cdx's own error code).

## Capability matrix

| What crow needs | cdx command | Claude | Codex |
|---|---|---|---|
| Account inventory, provider, enabled, limits | `status --cached` | yes | yes |
| Profile paths | `configs`, `config <name>` | yes | yes |
| Provider enum | `schema` | yes | yes |
| Interactive session | `cdx <account> --dir D [--prompt P]` | yes | yes |
| Headless run, detached run | `run <account> --cwd D ... [--detach]` | yes | yes |
| Run lifecycle and artifacts | `runs`, `run-status`, `run-report` | yes | yes |
| Final message | stdout artifact | `result` envelope | last `agent_message` event |
| Usage and list-price cost | crow reads native files, crow-owned prices | yes | yes (cumulative snapshots) |
| Native resume of one exact conversation | `can-resume` + `resume` | when `can-resume` names it | when `can-resume` names it |
| Transfer to another account or provider | `handoff SRC TGT --source-native-transcript P --json` | yes | yes |
| Hub guard hook (`crow-hub-guard`) | `.claude/settings.json` hooks | yes | no |
| Write sandbox (cwd only, no network) | `run --permission default` | n/a | yes |
| Read-only sandbox | `run --permission review` | n/a | yes |

Crow never passes an account and `--provider` together to `cdx run` (cdx refuses it). It never
enables `cdx run --failover`: cdx would rank targets beyond the accounts crow may use.

## Guarded operations

The hub guard asks the owner before a commit, push, rebase or MR in a registered repo from the
hub. Only Claude enforces it (a hook). For Codex, crow uses what cdx can enforce and refuses the rest:

| Operation | Claude | Codex |
|---|---|---|
| `crow` (interactive hub session) | hook | **unavailable** (`guard_unenforceable`): an interactive owner can leave a sandbox |
| `crow brief/daily/weekly`, retros (hub one-shots) | hook | `default` sandbox: writes stay in the hub, no network |
| Session titles (read-only helper) | hook | `review` sandbox |
| `crow open/term/handoff <project>` | the repo's own rules | the repo's own rules (`AGENTS.md`) |
| `crow dispatch` | `auto` | `default` unless `--permission` names another cdx value |

Crow never substitutes full access for a missing guard. A brief on Codex has no network, so
it cannot reach the forge; run it on Claude for the full brief.

## Provider-specific flags

- `--model`: a Claude name (`claude-*`, opus, sonnet, haiku, fable) is refused on Codex and a
  Codex name (`gpt-*`, `o<N>`, `codex*`) on Claude.
- `--permission`: any value `cdx schema` accepts. Defaults: `auto` on Claude, `default` on Codex.
- Titles: `CROW_TITLE_MODEL` (Claude, default haiku), `CROW_TITLE_CODEX_MODEL` (Codex, default
  the account's model). Retros: `CROW_RETRO_MODEL`, `CROW_RETRO_CODEX_MODEL`.
- `CROW_TITLE_CMD` stays an operator-owned shell override; crow never runs a model on its own
  when no account may run it.

## Context

Claude loads `CLAUDE.md` and its linked memory (`local/memory`) natively. Codex loads
`AGENTS.md` (here: `LOGICS.md`). Each Codex launch, dispatch and hub one-shot starts with a short
list of files to read first: the repo instruction files, `local/owner-prefs.md` and the
account's memory folder. Codex never gets a fake Claude memory directory. A `never` account gets
no memory and no context.

## Schema changes and caches

All payload changes are additive. Old consumers keep working.

| Payload | Version | New fields |
|---|---|---|
| `crow json` (agents) | `schema_version: 2` | `provider`, `native_id`, `identity`, `context_window`; finished: `provider`, `account` |
| `crow usage --json` | `schema_version: 2` | `provider`, `identity`, `reasoning_tokens` on sessions; `by_provider`, `cost_complete`, `legacy_days` on rollups; `provider`, `windows`, `source`, `updated_at`, `age_s` on limits; `prices` |
| `crow sessions --json` | entries | `provider`, `identity`; relaunch `mode`, `target_provider` |

Cost: `cost_usd` is the sum of what is priced. It is `null` when nothing in it is priced, and
`cost_complete` is false when part of it is unpriced. Prices are list-price estimates from
`bin/crow_prices.py` (versioned, overridable with `CROW_TOKEN_PRICES` or `CDX_TOKEN_PRICES`),
not subscription charges. Quota percentages are per account and window; they are never compared
across providers.

Caches rebuild themselves when their version changes: `usage-cache.json` (version 10),
`sessions-cache.json` (version 3), `activity-cache.json` (per-provider parser version). They are
derived data. Deleting them is safe; source transcripts are never modified. Frozen usage days
(`usage-days.json`) are kept as they were: days frozen before this change carry no
`by_provider` and count as `legacy_days`.

## Rollback

1. `git checkout <commit before the Codex work>` in the crow repo (the private `local/` repo is untouched).
2. Delete the derived caches in the state dir: `usage-cache.json`, `sessions-cache.json`,
   `activity-cache.json`, `slots.json`. They rebuild in the old format on the next poll.
3. Keep `runs.jsonl`, `relaunches.jsonl`, `consents.jsonl`, `helper-runs.jsonl` and
   `usage-days.json`: the old code ignores the extra fields.
4. Remove `provider:` lines from `local/accounts.yaml` only if the old version complains (it ignores them).
5. Native transcripts and cdx state are never touched by crow and need nothing.
