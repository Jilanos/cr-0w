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
| `/api/operations`, `/api/operations/{id}` | GET |
| `/api/operations/{id}/undo`, `/cancel`, `/reconcile` | POST |
| `/api/operations/{id}/events`, `/api/runs/{id}/events` | GET, SSE |
| `/api/mail`, `/api/mail/{id}`, `/api/mail/folders`, `/api/drafts` | GET |
| `/api/mail/sync`, `/api/mail/{id}/fetch`, `/api/mail/{id}/reply-all` | POST |
| `/api/mail/triage/plan`, `/api/mail/triage/execute` | POST |
| `/api/topics`, `/api/topics/{id}/messages` | GET |
| `/api/topics/{id}/messages` | POST |
| `/api/topics/{id}` | PUT |
| `/api/runs`, `/api/runs/{id}`, `/api/accounts`, `/api/routines` | GET |
| `/api/routines/maj`, `/api/routines/daily_update` | POST |
| `/api/dues`, `/api/dossiers`, `/api/dossiers/{slug}`, `/api/afk` | GET |
| `/api/files/{id}` | GET |
| `/api/files/{id}/open` | POST |

SSE events persist sequence numbers in SQLite and a JSONL mirror. Reconnect with
`Last-Event-ID`. Finished streams replay and close. Eight clients can stream at
once. Provider transcripts supply live events when cdx stdout is buffered. User
prompts and tool result bodies are excluded. Signed URL parameters and bearer
tokens are masked before event persistence.

## Actions and evidence

Pending edits preserve unrelated bytes. Item revisions, duplicate identities,
file fingerprints, mtime and inode checks protect against stale edits. Every
write journals its intention and saves a backup before atomic replacement.
Undo applies an inverse edit for ten seconds, with two seconds of network
tolerance. It preserves independent intervening changes. Keep other writers on
the shared lock: external editors can race with the final atomic replacement.

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

Live triage requires connector schema, headless and permission evidence. Its hook
allows only confirmed message ids and destinations, at most five messages per
call, without categories or conversation mutations. Lost results become unknown
and are never retried automatically. Undo first verifies current locations and
leaves independently reclassified messages alone. Trash and run stopping remain
disabled. A real move and its return still require the owner's trial.

Sonnet is the default chat model. Per-message, topic, kind and project settings
follow the configured cascade. Invalid account/model pairs are rejected. Mail
subjects use the read account; the drafting account is reserved for the styling
stage. Native continuations pin the parent's provider settings. cdx currently
accepts permission-only continuation settings, so resumed chat disables MCP
servers and uses its supplied context. Changing account or model creates a new
conversation with a summary.

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
