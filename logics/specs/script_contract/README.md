# Script JSON contract

The deck, crow-core and the phone app read these scripts. Each JSON payload carries `"schema": 1`.

| Payload | Command | Schema |
|---|---|---|
| accounts | `crow-accounts json` | `schemas/accounts.schema.json` |
| checks | `crow-checks json [-f] [--now ISO]`, `crow-checks replay FILE` | `schemas/checks.schema.json` |
| mrs | `crow-mrs json [-f]` (cached 60 s in the machine state dir) | `schemas/mrs.schema.json` |
| ready | `crow-ready json [--limit N]` (Logics backlog items with status Ready) | `schemas/ready.schema.json` |
| registry | `crow-registry json` | `schemas/registry.schema.json` |
| runs | `crow-runs json` (reads `<state>/runs.jsonl` and `cdx runs --json`) | `schemas/runs.schema.json` |
| sessions | `crow-sessions list --json`, `crow-sessions scan --json` | `schemas/sessions.schema.json` |
| today | `crow-today json [-f]` | `schemas/today.schema.json` |
| usage | `crow-usage --json` | `schemas/usage.schema.json` |
| usage_summary | `crow-usage --json --summary` (under 5 kB) | `schemas/usage_summary.schema.json` |
| action | `crow-focus --send/--interrupt/--stop --json`, `crow-runs stop ID --json`, `crow-runs retry ID --json`, `crow-today done/snooze ID --json` | `schemas/action.schema.json` |

## Action results

An action prints one line `{schema, ok, action, target, message, code}` and exits with `code`:
0 done, 1 refused (bad target, nothing to act on), 2 error (missing argument, not signed in, a failing call).

## Versioning

- Adding a field keeps the version. Readers ignore fields they do not know.
- Renaming or removing a required field, or changing its type, bumps `schema` in `bin/crow_lib.py` and in every schema `const`.
- Schemas list required keys and object or array structure. Scalar values are unconstrained. Maps keyed by name or date stay opaque objects.

## Fixtures

`fixtures/` holds synthetic payloads, one per schema, with placeholder values. `tests/test_script_contract.py`
validates them, checks that removing or renaming any required field fails, and runs every script offline
against a throwaway hub to validate its real output.
