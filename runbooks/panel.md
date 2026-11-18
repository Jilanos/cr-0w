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
and **Annuler** write that copy and save backups. Mail replies, triage, file opens
and both routines are simulated. Chat and mailbox synchronisation use real,
recorded read-only runs. A simulated routine log prints its exact command.

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

The home page retains changes since the previous page visit. Pending clicks made
during an update join a durable queue. Rows stay visible until applied; remove a
queued click from its toast or Jobs. Changed rows fail without editing the file.
The ten-second undo period starts when the queued edit is applied.

Relancer opens a dedicated form. It checks Drafts and Sent before the three draft
steps. An existing draft, proven reply or uncertain check prevents a new draft.
All four steps are simulated in trial mode. Structured AFK questions offer option
buttons. Trial answers write an overlay and backups under the panel state folder.

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
Live pending edits affect the real document. Live routines execute their commands.
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
pending inverses, simulated mail actions, routines and responsive layouts.
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
