# Core contract (item_119)

Formats shared by the Go core (`tools/crow-core`), the Python CLI (`bin/`) and the Python sidecars. Each format has a JSON Schema here and fixtures that a Go test and a Python test both read. The run contract (kinds, crow block, questions, validation line) stays in `../req_037_run_contract/` and is part of this contract.

Contract version: **1**. It is the `v` field of every sidecar message and the `contract` field of crow blocks and questions files. A breaking change bumps it on both sides in the same commit.

## Files

| Path | What |
|---|---|
| `schemas/request.schema.json` | Sidecar request envelope and the data of each message |
| `schemas/reply.schema.json` | Sidecar reply envelope, the data of each reply, the error shape |
| `schemas/event.schema.json` | One line of `missions/<id>/events.jsonl`, with the data of each event type |
| `schemas/mission.schema.json` | Mission record (`crow mission list/show --json`) |
| `schemas/run.schema.json` | Run entry of a mission |
| `schemas/inbox.schema.json` | Inbox row (`crow inbox list/show --json`) |
| `fixtures/messages/<type>.request.json`, `<type>.reply.json` | One pair per message |
| `fixtures/errors/<case>.request.json`, `<case>.reply.json` | Error replies |
| `fixtures/events/<mission>.jsonl` | A full mission log for slices 1 and 2 |
| `fixtures/records/missions.json`, `runs.json`, `inbox.json` | List outputs |
| `schemas/ops.schema.json` | Data of `GET /api/state/ops` (item_257) |
| `fixtures/records/ops.json` | One ops answer |
| `schemas/run-report.schema.json` | Data of `GET /api/runs/{id}` (item_257) |
| `fixtures/records/run-report.json` | One run report |

Fixtures from `../req_037_run_contract/` read by both sides: the 8 kind files, every crow block under `examples/`, `examples/gates/questions.json`, `examples/20261109-build-item-095/events.jsonl`.

## Transport

- core starts each sidecar as a child process and talks to it over stdin and stdout.
- One JSON object per line, UTF-8, `\n` terminated. A line is at most 1 MiB; larger payloads go in a file and the message carries the path.
- stderr is the sidecar's log. core appends it to `<state>/sidecars/<name>.log`.
- No socket files and no auth: a sidecar is reachable only by the process that started it, and it dies with core.

## Envelope

Request:

```json
{"v": 1, "id": "c-1", "type": "hello", "data": {}}
```

Reply, same `id` and `type`:

```json
{"v": 1, "id": "c-1", "type": "hello", "ok": true, "data": {}}
{"v": 1, "id": "c-2", "type": "nope", "ok": false, "error": {"code": "unknown_type", "message": "..."}}
```

- `id` is chosen by core, unique per sidecar process, at most 64 characters.
- core may send a new request before the previous reply. The sidecar may answer out of order. core matches replies by `id`.
- A sidecar never sends a line that is not a reply.
- Error codes: `bad_request` (not JSON, missing field, wrong data), `unknown_type`, `unsupported_contract` (`v` differs), `timeout` (the sidecar gave up on its own work), `internal`.
- A line that is not a JSON object gets a `bad_request` reply with `id` `"?"` and `type` `"?"`.

## Messages

Every sidecar handles the three lifecycle messages. Each AI sidecar (butler, STT, embeddings) adds its own messages here, with schemas and a fixture pair, in the item that builds it.

| Type | Request data | Reply data | Notes |
|---|---|---|---|
| `hello` | `contract`, `core` (core version) | `name`, `version`, `contract`, `messages` | First message after start. A `contract` mismatch gets `unsupported_contract`. |
| `health` | none | `status` (`ok`, `degraded`), optional `detail` | Sent when idle. |
| `shutdown` | `grace_s` | none | The sidecar replies, finishes in-flight work and exits 0. |

## Supervision

core applies these rules to every sidecar. The values are defaults in the core config.

- **Start:** at core start for sidecars marked `eager`, else on first use. core sends `hello` and waits 10 s for the reply. No reply or a refusal kills the process and counts as a crash.
- **Health:** a `health` every 30 s while no request is in flight, 5 s timeout. A timeout counts as a crash.
- **Requests:** each message type has a timeout (default 30 s). On timeout core answers the caller with `timeout`, kills the sidecar and restarts it.
- **Restart:** backoff 1 s, 2 s, 4 s, up to 60 s. Five crashes within 10 min mark the sidecar down: core writes an `incident` event, stops restarting it and refuses its messages until the owner restarts it or core restarts.
- **Stop:** `shutdown` with `grace_s` 5, then SIGTERM after the grace, then SIGKILL 5 s later.
- **Exit:** a sidecar exits when stdin closes.

## Mission formats

- **Event line:** `{ts, mission, type, actor, data}`. `actor` is `owner`, `core` or `run`. Types: `created`, `state`, `run_start`, `run_end`, `gate`, `question`, `answer`, `validation`, `validation_dropped`, `publish`, `incident`, `action`. `action` (item_147) records an owner stop, cancel or hide with the surface it came from. The `data` of each type is closed. Later slices add types (adr_001 also names `manual_gesture` and `push_sent`), each with its data schema, Go type and fixture line in the same change. The mission starts in `preflight` at `created`; every later state move is a `state` event, `done` included.
- **Mission record:** the fields of adr_001 "Mission record", plus `created` and `updated`. `runs` holds run entries. Nullable fields (`batch`, `validation`, `branch`, `worktree`, `mr`) are always present.
- **Run entry:** `run` (cdx run id), `mission`, `account`, `version`, `cold`, `started`, `ended`, `cause`, `exit`. The last three are null while the run is live.
- **Inbox row:** id `<mission>/v<N>` for a gate, `<mission>/v<N>/<question id>` for a parked question. `type` follows the source: plan is `approval`, report is `review` (`fyi` for a straight-through kind), mockup and questions are `choice`. `verbs` are the gate verbs of req_037; a parked question takes `answer`.
- **Live action line** (`live-action.schema.json`, item_170): `{ts, actor, surface, action, target, text?, account?, project?, ok, code, message, run_id?}` in `<state>/actions.jsonl`, one line per session, run or mail action the owner ran through core. `actor` is `owner`. `code` follows the script contract: 0 done, 1 refused, 2 failed. Fixtures: `fixtures/api/live-*.json`, requests `send`, `run`, `session`.
- **Ops answer** (`ops.schema.json`, item_257): `GET /api/state/ops?day=YYYY-MM-DD` or `?week=YYYY-Www` (ISO week, Monday first), today when neither is set, 400 on a bad value. One lane per session or same-titled run set per day, from the shared lanes package over crow-usage activity buckets. Spans: active buckets are `working`, gaps between them `idle`, a live lane waiting on the owner is `waiting` from when it went quiet until now, and a finished run's crow-runs status sets its last span (`done`/`stopped` done, `stuck`/`limit` stuck, `failed`/`budget` failed). A session with cost on a day but no buckets (crow-usage keeps buckets two days) gets a lane without spans. Kind is `mission` when a store mission ran it, `routine` when its title names a crow timer, else `run` or `interactive`. The queue lists queued and preflight missions, crow timers by next start, then AFK jobs (`<state>/afk/job-*.md`). Totals per project and per kind are the sums of the lanes. Fixtures: `fixtures/api/state-ops*.json`.
- **Ops state log** (item_257): every serve tick appends today's live lanes to `<state>/ops-states.jsonl`, one line `{ts, lane, keys, project, title, account, kind, state}` per lane per state change. `needs` and `idle` lanes log `waiting`, `working` and `run` lanes log `working`. A lane that is no longer live gets a closing line: `stuck` when it ended paused or stuck, `failed` when failed, else `done`. At 4 MiB the file moves to `ops-states.jsonl.1`, replacing the older one. The ops answer lays the logged spans over the derived spans between the first and last logged instant of a lane on each day; days without lines keep the derived spans. A lane only the log knows gets its own lane.
- **Run report** (`run-report.schema.json`, item_257): `GET /api/runs/{id}` reads the crow-runs ledger `<state>/runs.jsonl` first. The id matches exactly, or as a prefix of at least 6 characters naming one run (400 when it names several). The dispatch section adds the status (`running` for a live run, the crow-runs status for a run finished in its window, else `unknown`), end, cost and commits; `crow-runs final` gives the report, empty when its stdout is gone. Without a ledger match a mission run of the core store answers with `source` `mission`, its cause as status and its mission's goal, branch and worktree. 404 when neither knows the id. Fixtures: `fixtures/api/run-report*.json`, `error-no-run.json`.

## Shared Go module boundary with crow-deck

- Package `crow-core/contract` holds the types of this contract and their strict decoders. It imports only the standard library and `gopkg.in/yaml.v3`, and does no I/O beyond decoding bytes it is given.
- crow-deck imports `crow-core/contract` and `crow-core/lanes` and nothing else from crow-core, through a `replace crow-core => ../crow-core` line in its `go.mod`, when the deck first reads missions or the inbox. Store, event log, tick and dispatch live under `crow-core/internal/`, which Go forbids other modules to import.
- Package `crow-core/lanes` (item_257) builds the day lanes of the deck Agents tab and the core ops answer. It imports only the standard library and does no I/O. The deck imports it through the same `replace` line and maps its own rows to `lanes.Session` and `lanes.Agent`.
- The deck keeps its own UI types. Its read-only fallback over the store decodes rows with the `contract` types.
- The UI kit of req_020 stays a separate module and never depends on core.

## How drift fails CI

- **Python:** every fixture validates against its schema. Schemas close every object (`additionalProperties: false`), so a field added to a fixture without the schema fails. `bin/crow_sidecar.py` answers each request fixture with exactly its reply fixture.
- **Go:** every fixture decodes into the `contract` types with unknown fields refused, and encodes back to the same JSON. A field added, renamed or retyped in a fixture without the Go type fails.
- **Schema against Go:** a Go test walks each schema next to its Go type and compares the property names at every level. A schema edit without the Go edit fails, and the reverse.
- **Messages:** the message types in `fixtures/messages/`, in the table above, in the Go `Messages` list and in the Python sidecar must be the same set.
- **Cross-process:** a Go test starts `bin/crow_sidecar.py` and runs the lifecycle fixtures over a real pipe.

CI runs the Python side in `bin/crow-check` and the Go side in the Go tests loop. The Go tests read files outside the module, which the Go test cache does not track. Run them with `go test -count=1 ./...` after a spec edit.
