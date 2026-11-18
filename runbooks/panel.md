# Local browser panel

The panel serves the local pending list, mail snapshot, runs, accounts and subject
chat. It binds to `127.0.0.1`. Python, PyYAML and a browser are sufficient. There is
no frontend build step.

## Start

Run these commands from the checkout containing the panel code:

```sh
export CROW_HOME=/path/to/private/data
bin/crow panel check-config --config "$CROW_HOME/local/panel.yaml"
bin/crow panel serve --config "$CROW_HOME/local/panel.yaml" --port 8790 --no-browser
```

Open `http://127.0.0.1:8790/`. Omit `--no-browser` to open it automatically.
`bin/crow panel` defaults to `serve`. `bin/crow-panel` accepts the same arguments.
Choose another free port with `--port`. Stop the server with Ctrl+C. Restarting
changes the session cookie and CSRF token; reload open browser tabs.

The engine comes from the command's checkout. `CROW_HOME` selects private data.
Use explicit paths when an older checkout is still on the shell's PATH.

## Configure and try safely

Copy `docs/panel.example.yaml` into the ignored `local/panel.yaml`. Set the real
home, data directory, routine commands, accounts and allowed file roots there.
Keep private values out of tracked files. `check-config` validates the structure;
it does not prove connector availability.

Start with these keys:

```yaml
mode: dry_run
pending_md: /path/to/disposable/pending.copy.md
state_dir: /path/to/private/panel/dev/state
locks_dir: /path/to/private/panel/dev/locks
runs_registry: /path/to/private/local/state/runs.jsonl
```

Copy the pending document before starting. In dry-run mode, **Réglé**, **Reporter**
and **Annuler** write that copy and save backups. Mail replies, triage and file
opens are simulated. Chat and mailbox synchronisation use real, recorded read-only
runs.

Both routines execute for real in every mode. They run one at a time; the log
streams live and the end line shows the real exit code and duration. A shell
wrapper writes the exit code next to the log, so a restarted server still reads
it. Set `routines.<name>.simulate_in_trial: true` to print the command instead in
dry-run mode. `routines.daily_update.wait_runs: false` skips the wait for active
runs; keep the default outside tests. `maj_schedule` still blocks the machine
update during the 30 minutes before a scheduled update.

Use **Réglé**, then **Annuler** within the displayed ten seconds. A date-stamped
entry appears under recently completed items. Backups are in `state_dir/backups`.
A conflict reloads the list; inspect the current item before clicking again.

Mail shows snapshot age and coverage. **Synchroniser la boîte** refreshes it through
the read account. A partial collection preserves the previous published snapshot.
**Répondre à tous** accepts instructions and shows three stages. No path sends
mail. Triage first freezes the selected messages and destinations, then requires
**Exécuter** on the displayed manifest. Unknown outcomes require **Vérifier**.

The chat follows the selected subject. Sonnet is the default. Queued messages
remain visible and can be removed from the queue. Each launch appears in the run
registry with its operation and subject identifiers. **Jobs** shows the journal
and report. **Comptes** shows quotas, resets and capability evidence. Unknown
values stay unknown. No reset credit is consumed automatically.

**Brouillons** lists the rows of the pending drafts section; its count matches
them. Messages the sync cannot find in Drafts or Sent appear apart, under
**À vérifier dans Outlook**, and are never marked done.

**Relances & échéances** has three tabs: **Liste**, **Échéances** and
**Chronologie**. Chronologie is a 15-day lane timeline (Relances, Échéances,
Réunions, Brouillons, Décisions) with an overdue column, an undated column, day
cards and the selected item's detail. Quick filter chips are shared by Échéances
and Chronologie: categories combine with OR, then **En retard**, person and
priority narrow the result. Filters and the tab are remembered in the browser.
Account quota resets stay hidden unless **Resets comptes** is on; **Comptes**
always shows them.

**Synchroniser** also starts a read-only calendar run for the next 14 days.
**Synchroniser l'agenda** in Chronologie starts it alone. The run uses the
`calendar` action profile: calendar search only, no mail tool, no event write.
A validated complete read replaces the calendar snapshot; a partial read keeps
the previous one.
**Mails à ranger** counts move, archive and trash proposals only.

The search button or Ctrl+K opens global search. `/` opens it when the list has
no focus; within the list, `/` focuses its filter. Search matches all words,
ignoring case and accents. It groups local mail subjects, senders and previews,
pending rows, decisions, dossiers and runs. Arrow keys choose a result; Enter
opens it. Mail search covers the complete published snapshot, including rows
beyond the first page. Runs cover the past year in the registry and up to 200
recent cdx runs. Source warnings and result limits remain visible. Searching
never fetches mail bodies or launches an agent. Queries are not saved.

## Windows notifications

Set `notifications.enabled: true` in the private config and restart. The example
keeps notifications off. Run completions and newly overdue pending dates produce
silent native Windows toasts through `powershell.exe`. These toasts also work in
trial mode. Their text contains counts only. The first poll establishes a silent
baseline for existing completed runs and overdue rows.

`run_finished` and `pending_overdue` enable each source. `poll_seconds` defaults
to 30. `min_interval_seconds` defaults to 120. Events arriving during that interval
join one durable batch. SQLite deduplication survives restarts. A postponed row
can notify again when its new date passes. Missing run data never implies a
completion. Run observation uses the past year's registry and up to 200 recent
cdx rows. A source failure leaves the other source available.

With `app_id: null`, the first delivery registers the `Crow.Panel` application
with display name `crow` under the current Windows user's
`Software\Classes\AppUserModelId` key. It needs no administrator rights and does
not change Windows notification preferences. A custom `app_id` must already be
registered. The implementation uses the native
[ToastNotificationManager](https://learn.microsoft.com/en-us/uwp/api/windows.ui.notifications.toastnotificationmanager)
API. No package or PowerShell module is installed. Toasts share one group and tag,
so a later toast replaces the previous notification in the notification center.
The latest notification expires after one day.

Inspect `GET /api/notifications` with the session cookie for delivery status,
queued counts and source errors. `accepted` means Windows accepted the native
call; display still follows the user's focus and notification settings. A timeout,
failure or interrupted delivery is consumed and never retried automatically.
New events can attempt delivery after the configured interval. Set `enabled: false`
and restart to stop notifications. Registration preserves the user's settings.

The home page retains changes since the previous page visit. Pending clicks made
during an update join a durable queue. Rows stay visible until applied; remove a
queued click from its toast or Jobs. Changed rows fail without editing the file.
The ten-second undo period starts when the queued edit is applied.

Relancer opens a dedicated form. It checks Drafts and Sent before the three draft
steps. An existing draft, proven reply or uncertain check prevents a new draft.
All four steps are simulated in trial mode. Structured AFK questions offer option
buttons. Trial answers write an overlay and backups under the panel state folder.

**Dossiers** lists pinned dossiers, then every dossier active in the window
(pending blocks and discovered folders, newest file first), then the other
pending blocks. `dossiers_discover.roots` (inside the allowed
file roots) enables discovery: folders at depth 2, or 3 when a depth-2 folder holds
only subfolders, with a file modified in the last `days` days, newest first.
`exclude` removes work folders by glob. A pending row links to a dossier when its
text contains the folder path, or the folder-name keywords: one word of six
letters or more, or two shorter words. Mails link on subject and preview with the
same rule. **Épingler** and **Masquer** persist in the panel state; **Afficher
les masqués** brings hidden ones back. **Créer un dossier depuis un répertoire**
searches folders by path words and pins the new dossier. Paths never leave the
server; the browser only sees opaque file ids and labels relative to the root.

Configure `dossiers.<slug>.path` within allowed roots to show ten recent files at
two subdirectory levels. Set `last_crow_at` or `crow_version_file` to enable the
modified-since signal. An absent reference remains unknown. Calendar events enter
deadlines from `local/state/maj/calendar.json`; the page shows coverage and age.
The night update publishes that snapshot. See [maj-routine](maj-routine.md) for
the interactive import command and [panel-api](../docs/panel-api.md) for formats.

## Activate live mode

Review the private acceptance report and capability reasons first. Stop the server,
back up its configuration, then change all four keys together:

```yaml
mode: live
pending_md: /path/to/real/pending.md
state_dir: /path/to/private/local/state/panel
locks_dir: /path/to/private/local/state/locks
```

Restart with the same explicit config path. The **Mode essai** badge disappears.
Live pending edits affect the real document.
Mail writers remain blocked until their schema, headless probe and permission
proofs are present. Switching the mode alone does not prove those capabilities.
A fresh state directory requires a new read-only probe and synchronisation:

```sh
bin/crow panel probe --config "$CROW_HOME/local/panel.yaml"
```

Keep the server running while the probe operation completes. Inspect its status
and the capability view. Choose one low-stakes message for the first real move,
then undo it and check both locations in Outlook. Keep trash disabled while a
message-level delete tool is unavailable. Draft styling requires the configured
draft-only account, high effort, local mail rules and a writable handoff directory.

To return to testing, stop the server and restore `mode: dry_run`, the copied
pending file and the development state/lock paths. Restart and verify the badge.

## Verification

The frontend uses a headless Chromium from a local Playwright cache, or `CHROME`.
Node 22 or later is required for the test driver. The panel itself needs no Node.
Store captures in a private directory:

```sh
node bin/panel_ui/dev/shots.mjs --out /path/to/private/shots/fixtures
node bin/panel_ui/dev/integration.mjs --url http://127.0.0.1:8790 \
  --out /path/to/private/shots/integration
```

The integration driver requires a real server in dry-run mode. It checks views,
pending inverses, simulated mail actions and responsive layouts. Routines execute
for real: `--routines` clicks them, only with `simulate_in_trial: true` set.
`--chat` spends one real Sonnet message. `--sync` performs a real read-only scan.
Review results JSON and captures. Keep the real pending document's checksum and
compare the copy before and after testing. Run the affected Python tests with
pytest and PyYAML available. The API and security details are in
[panel-api.md](../docs/panel-api.md).

For a security review, exercise mode changes with persisted jobs and undo records,
duplicate rows with independent clicks, unavailable update status, malformed batch
arguments, missing tool results and repeated draft attempts. Use fake commands and
disposable files. Reproduce each finding before changing its guard. Verify that
worker failures emit a terminal event and that the browser leaves its waiting state.
Read tools resolve paths against the configured data home, file roots and projects.
Test symlink escapes and out-of-root credential reads. Native resumed chat disables
local read tools as well as MCP because continuation settings cannot carry hooks.
