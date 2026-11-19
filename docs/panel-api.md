# Local panel backend

`bin/crow-panel serve --no-browser` starts a Python standard-library HTTP server on
`127.0.0.1:8790`. It uses PyYAML, which the other command-line tools already use.
There is no frontend build step. The server serves `bin/panel_ui/` when present and
an API navigation page otherwise. This backend never writes that directory.

Copy `docs/panel.example.yaml` to the private `local/panel.yaml`. Set `pending_md`
to a disposable copy for initial use. Keep `mode: dry_run` during verification.
Configuration selection is `--config`, `CROW_PANEL_CONFIG`, the data home's
`local/panel.yaml`, then the example. An explicit missing path is an error.

```sh
bin/crow-panel check-config
bin/crow-panel serve --port 8790 --no-browser
bin/crow-panel probe
bin/crow-panel build
```

`probe` queues a recorded read-only mailbox scan and capability probe. It reuses a
running server. With no server, it persists the operation and attempts admission;
`serve` monitors and resumes the durable queue. `build` writes an optional local
HTML digest into the configured state directory. It does not build the UI.

The state and lock directories are private. A second server using the same state
directory is refused. Set `CROW_LOCKS_DIR` or use the same private panel config for
other writers. `crow-lock pending -- command args` shares the pending writer lock.
`crow-maj night` owns the pending lock for its entire run. Dispatch and panel
launches share the admission lock. A maintenance script suspends admissions and
waits for existing runs. Manual cdx launches can bypass the shared lock; the cdx
parallel-run cap remains in effect.

`limits` maps account names to capacities and includes `total` (default 5).
Account defaults are 3 for Claude and 1 for Codex. `max_parallel` remains the
legacy fallback for the total, followed by `CROW_MAX_RUNS`. `/api/config` exposes
normalized `limits` and the effective `max_parallel`. `/api/state` exposes
`admissions.slots` with `busy`, `max`, `unknown`, and an `accounts` mapping of
`{busy, max}` rows. `crow runs json` exposes the same slot shape. Queued model
steps wait for their own account capacity and total capacity. Finished registry
entries supply missing account metadata without occupying slots. Unknown live
accounts count conservatively against admission until metadata is available.

## HTTP contract

The JSON examples in `tests/fixtures/panel/` mirror the private specification's
fixtures. An error is `{error: {code, message, retryable, details}}`. Mutations
return a durable operation, except triage planning, terminal and file-open
responses, whose fixture defines a separate shape. HTTP 202 means accepted.
Inspect the operation for the business result and its evidence.

First fetch `/` to receive the HttpOnly, SameSite=Strict session cookie. Then fetch
`/api/session` with that cookie. Every mutation requires the cookie, its
`X-Crow-Token`, an exact loopback `Origin`, and JSON content. Bodies are limited to
256 KiB. Host headers must include the actual loopback port. There is no CORS.

Every POST requires a client `request_id`. Reusing the id with the same route and
body returns the original operation or result; a different body returns 409.
Topic history is read-only; topic POST and PUT routes return 404.

| Routes | Methods |
| --- | --- |
| `/api/session`, `/api/config`, `/api/state`, `/api/capabilities` | GET |
| `/api/state/visit` | POST |
| `/api/pending` | GET |
| `/api/pending/{id}/done`, `/api/pending/{id}/snooze` | POST |
| `/api/afk/decisions/{n}/answer` | POST |
| `/api/operations`, `/api/operations/{id}` | GET |
| `/api/operations/{id}/undo`, `/cancel`, `/reconcile` | POST |
| `/api/operations/{id}/events`, `/api/runs/{id}/events` | GET, SSE |
| `/api/search?q=...&limit=20` | GET |
| `/api/notifications` | GET |
| `/api/mail`, `/api/mail/{id}`, `/api/mail/folders`, `/api/drafts` | GET |
| `/api/mail/sync`, `/api/mail/{id}/fetch`, `/api/mail/{id}/reply-all` | POST |
| `/api/mail/triage/plan`, `/api/mail/triage/execute` | POST |
| `/api/topics`, `/api/topics/{id}`, `/api/topics/{id}/messages` | GET |
| `/api/terminal`, `/api/terminal/screen` | GET |
| `/api/terminal/start`, `/api/terminal/keys`, `/api/terminal/resize`, `/api/terminal/handoff` | POST |
| `/api/runs`, `/api/runs/{id}`, `/api/accounts`, `/api/routines` | GET |
| `/api/routines/maj`, `/api/routines/daily_update`, `/api/routines/backup` | POST |
| `/api/dues`, `/api/dossiers`, `/api/dossiers/{slug}`, `/api/afk` | GET |
| `/api/files/{id}` | GET |
| `/api/files/{id}/open` | POST |

SSE events persist sequence numbers in SQLite and a JSONL mirror. Reconnect with
`Last-Event-ID`. Finished streams replay and close. Eight clients can stream at
once. Provider transcripts supply live events when cdx stdout is buffered. User
prompts and tool result bodies are excluded. Signed URL parameters and bearer
tokens are masked before event persistence.
Nested JSON values and displayed run reports are also redacted. Raw subprocess
logs remain private source artifacts and can retain credentials. Do not include
their directory in file roots until a redacting script runner is available.

## Dossiers

`GET /api/dossiers[?hidden=1]` returns `dossiers` and `discovery: {enabled, roots,
days, scanned_at, partial, hidden_count}`. Each row adds `source` (`pending`,
`custom`, `auto`), `pinned`, `hidden`, `keywords`, `links` (row id to `chemin` or
`mots-clés`), `mail_ids`, `mail_count`, `files_active_at` and `recent_count`.
`GET /api/dossiers/{slug}` adds `mails: [{id, subject, from, received}]`.
`POST /api/dossiers/{slug}/pin` and `/hide` take `{on: bool}`.
`GET /api/dossiers/directories?q=` searches folders (depth 4) and returns
`{file_id, label}`; `POST /api/dossiers/create {file_id, title?}` creates and pins a
dossier. A file or a path outside the roots is refused.

## Routines

`POST /api/routines/{name}` executes the configured argv for real in both modes,
unless `simulate_in_trial` is true in dry-run mode. One routine runs at a time
(423 or 409 otherwise). A finished routine operation has `result: {exit_code,
duration_s, started_at, ended_at}`; its `done` event carries `exit_code` and
`duration_s`. `GET /api/routines` reports `dry_run` per routine (true only when
simulated) and `last: {at, status, exit_code, duration_s, simulated, run_id}`.

## Global search

`GET /api/search?q=...&limit=20` requires the session cookie. The query has at most
200 characters. Each group returns at most `limit` items (1 to 50) and an exact
`total` for the local data searched. Empty queries return empty groups. All words
must match, with case and accents ignored. Groups are `mail`, `pending`,
`decision`, `dossier` and `run`. Each result has `key`, `view`, `title` and
`subtitle` for opening the existing view. Decision rows appear only in the
decision group. Completed pending rows remain searchable.

`sources.mail` reports snapshot coverage, timestamp and staleness. Search reads
published subjects, sender names/addresses and previews, across all mailbox
pages. It never requests a body or starts a sync. `GET /api/mail?id=...` resolves
an exact published row when opening a result beyond the first page. Run search
covers a year of local registry entries and up to 200 recent cdx rows;
`sources.runs` reports availability. No query is written to access logs or browser
storage.

## Actions and evidence

Pending edits preserve unrelated bytes. Item revisions, duplicate identities,
file fingerprints, mtime and inode checks protect against stale edits. Every
write journals its intention and saves a backup before atomic replacement.
Undo applies an inverse edit for ten seconds, with two seconds of network
tolerance. It preserves independent intervening changes. Keep other writers on
the shared lock: external editors can race with the final atomic replacement.
An unavailable update status blocks edits. Queued edits and pending inverses stay
bound to their accepted mode and resolved target file. A changed mode or target
requires a fresh click. Legacy queued mutations without that binding are refused.

Mail and calendar reads use classic Outlook COM. Partial collections preserve the
published snapshot. If classic Outlook is unavailable the server returns an
explicit error without launching a model or discarding cached data. Filing
proposals come from native conversations, sender/domain history and rules.
Unresolved messages have no proposal. Legacy model suggestions are discarded.

Dry-run pending actions write the configured copy. Mail writes are simulated;
mailbox reads still use COM. Routines execute for real unless their own
`simulate_in_trial` flag is set. The terminal can be read in dry-run, but its
startup and keys are refused. Native live replies use `compose` (worka, high
effort), `create_draft` and `verify` (COM). No endpoint sends mail.

`GET /api/topics` and `/api/topics/{id}/messages` keep stored history readable,
including settled/orphan topics. Topic creation, message submission and default
changes are disabled. Settled pending rows preserve their topic and history.
Search returns stored conversations with `view: conversation`. Queued legacy
chat/model-read/model-triage jobs fail with `model_disabled` before launch.
Only explicit native mail composition can enter `Launcher.start_run`.

## Shared hub Terminal

`GET /api/terminal` returns `{running, sessions: [{session,pid,attach}], dry_run}`.
Discovery uses Crow tmux sessions in the configured data-home directory. No
arbitrary browser-supplied PID can be controlled. Screen requests carry query
`session` and `pid`; the server resolves that exact current pane before invoking
`crow-screen show`. The response includes ANSI `lines`, `history`, `cols`, `rows`
and `cursor`. The browser reuses Nest's ANSI and key mappings.

POST bodies include the normal `request_id` and, except startup, `session` and
`pid` from discovery. `/keys` accepts upstream `keys: [{text: string}|{key: name}]`;
`/resize` accepts integer `cols` (20–400), `rows` (5–200). The upstream validation
and `crow-screen` implementation own key sending and resizing. `/start` takes no
session arguments and reuses `CROW_TERMINAL=headless crow term --account claude
--on-busy fail crow` under a startup lock. Register `crow` as the data-home project.
It returns the session list and does not start another hub when one exists.

`/handoff` takes `topic_id` and optional `note` (up to 1500 characters). The server
resolves the stored topic context, constructs one bounded literal line with title
and pending path/line, dossier directory, mail link/reference or run source.
Control characters are removed. It calls upstream keys with one `{text: ...}`
and no Enter; the result has `submitted: false`. Reusing its request id replays
the response without typing twice. The UI switches to Terminal; the owner submits
with an explicit Enter. The displayed `tmux attach -t <name>` attaches another
terminal to the same session. The session survives panel restart.

## Operational limits

Classic Outlook must be open for live mailbox actions. A missing or incomplete
native conversation stops drafting. COM writes with lost results remain unknown
and require read-only verification before any retry. File opens require allowed
roots and Windows integration. Terminal startup requires tmux, the project `crow`
and an available Claude account. The terminal contains interactive hub output,
which is kept in the hub session, not copied into panel conversations.

`bin/crow-panel-api --config <config> [--method POST] [--body-file <json>|-]
/api/...` uses the same cookie, CSRF token and origin as the browser. A reply
request posts `{request_id, instructions}` to `/api/mail/{id}/reply-all` and polls
the returned operation. Worka owns its configured model; no chat model is selected.

## Visit checkpoint

State returns `since_last_visit: null` before the first visit. Later it returns
`visited_at`, `total`, `items` and `truncated`. Items carry `change`, `text` and
`ref`. At most 100 changes are returned. Pending additions, revisions and removals,
new snapshot mail and completed panel operations are compared with the last
checkpoint. A missing mail never proves an action succeeded.

`POST /api/state/visit` accepts `request_id` and saves the current checkpoint in
SQLite. It returns a completed `state.visit` operation. Reads never move this
checkpoint. The browser reads the delta before posting the new visit and retains
that delta during the open page's lifetime. Reloading starts the next visit.

## Pending clicks during updates

`done` and `snooze` accept `queue: true`. A locked writer returns 202 with a durable
queued operation. Without this opt-in, a locked request still returns 423. The
queue captures the item revision and converts relative snooze dates at click time.
After the lock clears, the worker rechecks that exact revision under the writer
lock. An edited or ambiguous line fails visibly without writing. Unrelated edits
are preserved. The undo window starts after the queued edit is applied.

Queued clicks survive restart and appear in Jobs with `waiting_for: maj`. Use the
operation's `/cancel` route to remove a click before application. Undo itself is
never queued. Buttons explain that the click will wait; rows stay visible while
waiting. No mail action is placed in this pending-file queue.

## Recent dossier files

Set each private `dossiers.<slug>.path` to an existing directory within `files.roots`.
The detail's `recent_files` contains the ten newest files by mtime, including two
levels of subdirectories. Symlinks are skipped. Each row has an opaque `file_id`,
a relative `name`, `modified`, `size` and `modified_after_crow`. The latter is null
unless `last_crow_at` supplies a timezone-aware timestamp or `crow_version_file`
identifies a reference version inside that dossier. It is true only for later
mtimes. No date is inferred from a filename. `recent_files_note` explains the
reference or its absence. A scan inspects at most 10,000 entries and reports
partial access or truncation. An unavailable folder returns null; an empty one
returns an empty array. Dossier lists do not recursively scan directories.

## AFK decision answers

`POST /api/afk/decisions/{n}/answer` accepts `request_id`, `night` (ISO date),
`item_rev` and `answer` (one exact displayed option). It returns a completed
`afk.answer` operation. A stale revision, duplicate number or previously answered
question returns 409. A forged option or invalid date returns 400. Recording a
choice performs no external action.

Structured questions in `afk_dir/decisions-<date>.md` use this format. Keep numbers
unique in the whole file. English and French field names are accepted for the
recommendation and answer. Existing bullet logs remain displayed as answered.

```markdown
## 1. Which trial should run next?
- Job: example
- Option: Keep trial
- Option: Review first
- Recommendation: Keep trial
```

The writer appends `- Answer: <choice>` to that block, preserves all other bytes,
and saves the previous file under `state_dir/afk/backups/`. In dry-run mode it
reads the configured source and writes an overlay under `state_dir/afk/`; the
original decision log stays untouched. Subsequent reads show that overlay.
Interrupted writes are reconciled by the recorded content hash, without replay.

## Follow-up requests

The old `/api/pending/{id}/followup` model pipeline is removed. **Envoyer au hub**
passes a pending row to the shared terminal. Réglé, Reporter and settled history
remain deterministic local actions.

## Calendar deadlines

`/api/dues` adds `calendar: {synced_at, stale, coverage, time_zone, note, sync}`.
`sync` reports the last calendar run (`running`, `status`, `at`, `error`). Each row
has `category` (`followup`, `deadline`, `meeting`, `draft`, `decision`, `reset`);
pending rows add `section`, `prio` and `who` (the person column). `undated` lists
draft and decision rows without a date. `POST /api/calendar/sync` starts a
read-only calendar run; `POST /api/mail/sync` starts one too, with request id
`<request_id>:calendar`. An active calendar run is returned instead of a new one. Calendar
rows have `kind: calendar`, an opaque occurrence reference, local `date`, `start`,
`end`, `all_day`, `location`, `url` and `stale`. Finished and cancelled events are
excluded. Ongoing events appear on today. Recurring instances remain distinct.
Only HTTPS links are exposed. Calendar rows have no pending-file actions.

The default source is `CROW_HOME/local/state/maj/calendar.json`. Override it with
`calendar.snapshot`, the display zone with `calendar.time_zone` (IANA), and age
with `calendar.stale_after_minutes`. The server reads classic Outlook through COM and publishes through the same validation. The night
`/maj` prompt collects 16 days of occurrences using read tools and writes an
incoming JSON file. The launcher validates and atomically publishes it after a
successful run. `crow-maj calendar schema` prints the format; `calendar import
<file>` publishes a collected file for interactive use.

The snapshot envelope contains `synced_at`, `time_zone`, `coverage` with `status`,
`window_start`, `window_end`, and `events`. Events carry `id`, `subject`, `start`,
`end`, `all_day`, `cancelled`, `location`, `web_link`. Times require explicit UTC
offsets. All-day dates may use ISO dates with an IANA snapshot zone; end is
exclusive. Partial or invalid imports preserve a valid previous snapshot and
record the failed attempt. An older snapshot cannot overwrite a newer one.
Missing data is shown as unavailable. A short collection window is labelled
partial even when the source exhausted that shorter window.

## Mail capability activation

The native read-only COM probe checks the running application and resolvable
folders. Every move resolves both frozen folder ids before writing. Closing
Outlook disables live actions and preserves readable snapshots. Persisted
connector proofs do not reactivate the removed connector fallback.

## Native Outlook operations

Set `mail.outlook_com.enabled: true` privately to use the running classic
Outlook profile. Native mail and calendar jobs run locally without model admission.
The durable job records its running intent before COM; interrupted writes become
unknown and are never replayed. A connector snapshot and a native snapshot use
different identities. Switching backend requires sync before fetching or writing.

Native sync publishes EntryID/StoreID identities and a full folder tree. It reads
the native conversation for each Inbox message, then the capped filing history.
Conversation, sender/domain and configured rules are the only proposal sources.
Unresolved messages show no proposal. A failed history scan is reported;
its previous index is retained. Non-mail folders cannot be filing targets.

Native replies have `compose`, `create_draft`, `verify` steps. The drafting account
runs at high effort with apps and shell tools disabled, with the private owner
preferences and mail-style text included. It returns the response HTML only. COM
calls ReplyAll on the selected latest message and prepends that HTML to its
original quoted body. Draft and newer-message checks run before composition and
again before creation. A draft or a newer message stops creation.

Private `reply_closing_internal` and `reply_closing_external` are arrays of closing
lines. `signature_image` is an allowed local file, embedded as a CID only for an
external To/Cc recipient. The response wrapper uses Times New Roman, 12 pt and
rgb(0,36,81). The reply endpoint also accepts explicit `cc`, `attachments` (local
paths), and `inline_images` (`{path,cid}`); files must resolve inside allowed roots.
The model cannot choose recipients or attachment paths. Original quoted inline
images are preserved. A separate COM read verifies recipients, closing, images,
attachments, size, quoted text and continued presence in Drafts.

Links can be HTTPS or `outlook:` followed solely by a hexadecimal EntryID. Only
mail-specific links accept that native protocol. No sending action is exposed.

## Separate header actions and calendar cache

The header separates sync and three routines: **Synchro Outlook** posts `/api/mail/sync` with
`fast: true` and refreshes only mail/calendar snapshots, **Maj** runs the configured
night routine, and **Mise à jour outils** runs its configured update script and **Save OneDrive**
runs its independent backup command.
All sync modes publish deterministic proposals without a model phase.
`state.mail.connection` reports the current backend and its French display label.

A valid complete calendar snapshot younger than 30 minutes that covers the requested
window is reused. The calendar operation succeeds with `result.skipped: true` and
launches no backend call. Partial, expired or short-window snapshots are reread.
Folder discovery exclusions are private `dossiers_discover.exclude` globs relative
to each discovery root; exclude both a directory and its descendants as needed.

With several mailbox stores, each triage item freezes its actual source folder.
Archive resolution uses that message's store. An unrelated shared Inbox or Archive
cannot silently become the source or automatic archive destination.
