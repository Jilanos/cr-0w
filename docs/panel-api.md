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
return a durable operation, except triage planning, topic defaults and file-open
responses, whose fixture defines a separate shape. HTTP 202 means accepted.
Inspect the operation for the business result and its evidence.

First fetch `/` to receive the HttpOnly, SameSite=Strict session cookie. Then fetch
`/api/session` with that cookie. Every mutation requires the cookie, its
`X-Crow-Token`, an exact loopback `Origin`, and JSON content. Bodies are limited to
256 KiB. Host headers must include the actual loopback port. There is no CORS.

Every POST requires a client `request_id`. Reusing the id with the same route and
body returns the original operation or result; a different body returns 409.
PUT topic defaults accepts an optional request id for compatibility with its
fixture. Supply one when retrying it.

| Routes | Methods |
| --- | --- |
| `/api/session`, `/api/config`, `/api/state`, `/api/capabilities` | GET |
| `/api/state/visit` | POST |
| `/api/pending` | GET |
| `/api/pending/{id}/done`, `/api/pending/{id}/snooze` | POST |
| `/api/pending/{id}/followup`, `/api/afk/decisions/{n}/answer` | POST |
| `/api/operations`, `/api/operations/{id}` | GET |
| `/api/operations/{id}/undo`, `/cancel`, `/reconcile` | POST |
| `/api/operations/{id}/events`, `/api/runs/{id}/events` | GET, SSE |
| `/api/search?q=...&limit=20` | GET |
| `/api/notifications` | GET |
| `/api/mail`, `/api/mail/{id}`, `/api/mail/folders`, `/api/drafts` | GET |
| `/api/mail/sync`, `/api/mail/{id}/fetch`, `/api/mail/{id}/reply-all` | POST |
| `/api/mail/triage/plan`, `/api/mail/triage/execute` | POST |
| `/api/topics`, `/api/topics/{id}`, `/api/topics/{id}/messages` | GET |
| `/api/topics` | POST |
| `/api/topics/{id}/messages` | POST |
| `/api/topics/{id}` | PUT |
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

Mail is read by recorded headless runs through the connector. The HTTP server
never accesses the mailbox directly. Inbox coverage is a scan across a time
interval. Failed or partial scans preserve a published snapshot. A missing
conversation id stays null and gets a separate message topic. A missing draft
stays uncertain without a matching Sent message proof. Folder ids are taken from
connector evidence; no destination is fabricated.

In dry-run mode, reply-all shows skeleton, drafting-account styling and read-only
verification stages. Triage validates a frozen manifest and the message-level
guard, then simulates it. Neither path invokes a remote writer. Scripts display
their command without executing it. Pending actions still edit the configured
copy. Chat and mailbox reads are real.

Live reply-all persists the draft id before styling, releases admission between
stages, and verifies the result. The drafting account uses high effort and a
restricted draft-only app. Configure `mail.draft_app_id`, `mail.style_rules` and
`work_handoff_dir` privately. Shell tools and other apps are disabled in that
profile. Its capability and permissions must be proven before activation.
The skeleton hook permits one blank reply-all creation attempt on the clicked
message. A newer message requires refreshing the mailbox. Additional recipients,
other message ids and draft updates are refused at this stage. Concurrent replies
and replies with an unknown outcome block another pipeline for the same topic.
The styling profile still lacks a server-enforced draft-id argument guard. Keep
live drafting disabled until that guard and its connector proof are available.

Live triage requires connector schema, headless and permission evidence. Its hook
allows only confirmed message ids and destinations, at most five messages per
call, without categories or conversation mutations. Lost results become unknown
and are never retried automatically. Undo first verifies current locations and
leaves independently reclassified messages alone. Trash and run stopping remain
disabled. A real move and its return still require the owner's trial.
Each claimed successful move must match a guarded tool call and its completed
non-error result. A missing call, lost result or wrapped connector error stays
unknown. The final run text alone cannot prove a move.

`POST /api/topics` accepts `{request_id, title}` for a new free topic (1–200
characters), or `{request_id, dossier_slug}` to reuse a dossier topic. Creation
does not launch a run. `GET /api/topics` sorts by last message, newest first;
the browser lists threads with messages and newly created free topics. Topic
messages expose `settled`; completed pending rows preserve their topic identifier,
context and transcript. Legacy settled rows recover their topic from an exact
completion-operation line match. Search adds a `conversation` group with topic ids
and `view: conversation`, matching titles and stored message text.

Sonnet is the default chat model. Per-message, topic, kind and project settings
follow the configured cascade. Invalid account/model pairs are rejected. Mail
subjects use the read account; the drafting account is reserved for the styling
stage. Trial native continuations pin the parent's provider settings and disable
MCP/read tools. Live chat uses the `chat` profile with shell and file writes,
connector actions and no-send instructions. Its Claude hook rejects send and
forward tools; shell actions follow owner instructions. Codex live chats disable
apps and use the local API helper; workb must never write or draft mail. Each live
turn starts with fresh hooks and the last 24 stored messages, since cdx continuation
cannot carry hooks. Earlier history remains available through the messages route.
Mode changes reject queued live action chats. Chat runs use `Chat · <title>`;
the registry owns their topic, operation and source even when cdx omits them.

`bin/crow-panel-api --config <config> [--method POST|PUT] [--body-file <json>|-]
/api/...` calls the running panel with its regular cookie, CSRF token and origin.
It does not open another database writer or server. A reply request posts
`{request_id, instructions, model: "sonnet"}` to `/api/mail/{id}/reply-all`, then
polls the returned operation. The existing native pipeline composes with worka,
creates a latest-message ReplyAll draft and verifies it. Connector fallback keeps
its existing capability checks. No endpoint sends mail.

## Operational limits

Capability evidence is conservative. Missing tools, folder discovery, a missing
native conversation, Windows document opening, and unproven connector policies
remain visible limitations. A live mail pipeline needs verified draft-only and
message-level connector profiles. The read-only probe does not perform a remote
write to certify them.

The AFK view reads local reports and recorded decision lines. Decision editing,
recent dossier files, attaching orphan topics and visit deltas remain deferred.
Private dossier paths can be configured in `dossiers.<slug>.path` with an optional
`label`; linked local files are exposed through opaque ids and checked roots.
A maintenance script that outlives the server keeps admissions suspended after
restart while its recorded process identity still exists. Its exit status is
unknown if the original parent process was lost.

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

## Dedicated follow-up pipeline

`POST /api/pending/{id}/followup` accepts `request_id`, `item_rev`, `instructions`
and `model` (Sonnet by default). Only a current row in a follow-ups section is
eligible. The returned `mail.followup` operation first runs `check_followup` with
the read profile on the read account. The result must identify the conversation,
latest incoming message and exhaustive Drafts/Sent checks, backed by a permitted
remote-read transcript and evidence. Incomplete access or ambiguous matching stops
the pipeline. An existing draft returns its link. A proven reply in Sent prevents
a new follow-up. The pending line is never resolved automatically.

Only a proven ready result on an unchanged pending row enters the existing
`skeleton`, `style`, `verify` pipeline. Capability proofs still gate creation and
styling. The draft-only styling account runs at high effort. The skeleton checks
Drafts/Sent again before creation and adds no unsolicited cc. The entire flow is
simulated in dry-run mode, including its four visible steps, with no mailbox run.

A second follow-up on an active or uncertain subject returns 409. Unknown results
are never retried automatically. `/reconcile` runs only the read check. Observing
no draft does not authorize a retry after a lost write. The UI's Relancer button
opens this dedicated form; Chat remains separately available.

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
with `calendar.stale_after_minutes`. The server never calls Outlook itself; the
panel calendar run publishes through the same validation. The night
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

Classic Outlook capabilities use a read-only COM probe: the running application
and its folders must resolve. Every move resolves both frozen folder ids again
before writing. Closing classic Outlook returns the panel to connector evidence.
Connector evidence never inherits COM evidence.

For the connector's first live proof, run the read-only probe, select one message,
and confirm its plan with `owner_trial: true` in the execute body. This exception
requires the discovered move schema and proven tool denial. Undo uses the same
frozen manifest and guarded tool profile. Only successful tool results for both
the move and its undo record `headless_probe`, `permissions` and `live_trial`.
A missing result remains unknown and cannot unlock the capability. Later
read-only probes preserve proven trials while the required schema remains present.

## Native Outlook operations

Set `mail.outlook_com.enabled: true` privately to prefer the running classic
Outlook profile. Native mail and calendar jobs run locally without model admission.
The durable job records its running intent before COM; interrupted writes become
unknown and are never replayed. A connector snapshot and a native snapshot use
different identities. Switching backend requires sync before fetching or writing.

Native sync publishes EntryID/StoreID identities and a full folder tree. It reads
the native conversation for each Inbox message, then the capped filing history.
Conversation, sender/domain and configured rules precede model proposals. The
model receives only the unresolved messages. A failed history scan is reported;
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

The header has three actions: **Synchro Outlook** posts `/api/mail/sync` with
`fast: true` and refreshes only mail/calendar snapshots, **Maj** runs the configured
night routine, and **Mise à jour machine** runs only its configured update script.
Fast sync publishes deterministic proposals without waiting for a proposal model.
The mail view's normal sync retains the proposal-model phase for unresolved mail.
`state.mail.connection` reports the current backend and its French display label.

A valid complete calendar snapshot younger than 30 minutes that covers the requested
window is reused. The calendar operation succeeds with `result.skipped: true` and
launches no backend call. Partial, expired or short-window snapshots are reread.
Folder discovery exclusions are private `dossiers_discover.exclude` globs relative
to each discovery root; exclude both a directory and its descendants as needed.

With several mailbox stores, each triage item freezes its actual source folder.
Archive resolution uses that message's store. An unrelated shared Inbox or Archive
cannot silently become the source or automatic archive destination.
