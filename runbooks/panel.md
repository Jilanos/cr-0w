# Local browser panel

The panel displays pending work, dossiers, mail, calendar, runs and accounts. It
provides light feedback (Réglé, Reporter, undo) and a shared Terminal on the hub.
Hub requests belong in that terminal. There is no panel chat or automatic model
triage. Python, PyYAML, tmux and a browser are sufficient; no frontend build.

## Start and restart

Run from the checkout containing the panel code:

```sh
export CROW_HOME=/path/to/private/data
bin/crow panel check-config --config "$CROW_HOME/local/panel.yaml"
setsid bin/crow panel serve --config "$CROW_HOME/local/panel.yaml" \
  --port 8790 --no-browser > "$CROW_HOME/local/state/panel-server.log" 2>&1 < /dev/null &
echo $! > "$CROW_HOME/local/state/panel-server.pid"
```

Open `http://127.0.0.1:8790/`. Use another free port with `--port`. Before a
restart, inspect the saved PID's command and terminate that PID only. Never use a
broad process-name pattern. Restarting changes the session cookie and CSRF token;
reload browser tabs. `CROW_HOME` selects private data; the command's checkout
supplies the engine. The hub's tmux session outlives a panel restart.

## Shared hub Terminal

Register the data home as project `crow` in `local/projects.yaml`. Start the hub
from the data home using the existing upstream launcher:

```sh
cd "$CROW_HOME"
CROW_TERMINAL=headless /path/to/checkout/bin/crow term --account claude --on-busy fail crow
```

The command prints JSON containing the tmux session name. In the panel, choose
**Terminal** in the rail, or press **g**, then **h**. If no hub is running,
**Démarrer le hub** runs that same command. The tab finds Crow tmux panes whose
working directory is the data home. When several exist, its selector chooses the
session to view. Topic insertion requires one hub to avoid choosing for the owner.

The screen, keys and resize all use upstream `bin/crow-screen`, also used by Nest.
Nest's ANSI renderer and key mappings are reused by the plain JavaScript view.
Click the screen to type; Enter submits, Escape and control keys reach the session.
Paste and scroll are supported. Only a visible Terminal view polls, about once a
second. The server validates the session name and pane PID before writing.

The tab displays `tmux attach -t <name>`. In Windows Terminal, enter WSL first
(`wsl`), then run that exact command. Both clients control the same session. Detach
with Ctrl+B, then D. Terminal writes and hub startup require panel live mode.

**Envoyer au hub** on a pending row, dossier, mail, draft or run opens an optional
note. **Insérer dans le terminal** inserts one short literal line containing the
title, source path/line or mail reference, and note. It switches to Terminal and
never sends Enter. Review the input, then press Enter explicitly. If the hub is
absent, the panel opens Terminal to let the owner start it, then return to the
subject. Insertion appends to the hub's current input; check that input first.

## Model calls

Only these panel actions can call a model:

- **Maj**, through the configured night-update routine.
- **Préparer le brouillon**, explicitly requested on a mail: `worka` composes the
  body at high effort; Outlook COM checks the thread, creates ReplyAll and verifies
  the draft. The panel does not send mail.

Terminal requests use the interactive hub's own account and model. Screen polls,
search, mail/calendar sync, filing proposals, moves/undo, Réglé/Reporter,
notifications, tool updates and Save OneDrive do not call a model. Old queued
chat, connector and proposal-model jobs fail closed after restart. Running legacy
jobs can finish; the panel never launches their next model stage.

## Mail and calendar

Keep classic Outlook open on Windows. **Synchro Outlook** refreshes mail and the
calendar through COM, as do the mail and calendar view sync buttons. All sync
modes publish the same deterministic proposals: conversation history first, then
sender/domain history and configured rules. Remaining mail shows **pas de
proposition**. Old model suggestions are discarded. No Sonnet fallback runs when
Outlook is closed; previous snapshots remain readable with an explicit error.
A partial collection preserves the previous complete snapshot.

Mail bodies are read on request. **Classer** and batch proposals freeze the
message identities, source folders and destinations, then require **Exécuter**.
Moves return new identities; **Annuler le lot** verifies locations before undo.
An uncertain result requires **Vérifier**, never automatic retry. Trash remains
unavailable. Calendar sync reuses a complete snapshot younger than 30 minutes
when it covers the requested window. Existing snapshots from Maj remain usable.

Draft composition uses `mail.style_rules`, `work_handoff_dir` and the `worka`
account. Internal/external closing lines and the optional signature image are
configured privately. Creation requires the latest message and a complete native
conversation without an existing draft. COM read-back verifies recipients,
quoted text, attachments, inline images and closing. Evidence is stored under
`state_dir/mail/draft-proofs`. No mail-writing action is run as a smoke test.

## Views and routines

**Relances & échéances** retains Liste, Échéances and Chronologie, including
category/date/person/priority filters. **Réglé** (`e`) and **Reporter** edit the
configured pending document with backups and a ten-second undo window. Clics
during Maj enter a durable queue. Changed rows fail without editing the file.
Settled rows remain visible. AFK decisions can be answered without a model.

**Dossiers** retains discovered and pinned directories, linked rows/mail, recent
files, hide/unhide and directory search. Configure allowed file roots and
`dossiers_discover` privately. Browser file actions use opaque ids. **Jobs** shows
runs, reports and live logs; **Comptes** shows quotas, limits and capability
reasons. Global search (Ctrl+K or `/`) reads local snapshots and stored history.
**Historique** opens earlier conversations in read-only dialogs, including settled
and orphan topics. New conversations, messages and topic defaults are disabled.

Header actions are separate: **Maj**, **Mise à jour outils**, **Save OneDrive**.
Configure `routines.daily_update.argv` with `--no-backup`, and `backup.argv` with
`--backup-only`. Routines execute for real even in dry-run mode, unless their
`simulate_in_trial` switch is set. They remain mutually exclusive. Tool update
waits for active runs and respects the scheduled Maj window. Backup does not
reserve maintenance admission. Each routine streams its log and durable exit code.

## Trial mode and verification

Copy `docs/panel.example.yaml` into ignored `local/panel.yaml`. Use a disposable
pending copy and separate state/lock directories with `mode: dry_run`.
Réglé/Reporter/undo write only the copy; mail writes are simulated; mailbox reads
still use COM. The Terminal can be read but cannot start a hub or send keys.

```sh
python3 -m pytest -q tests
CHROME=/path/to/chrome node bin/panel_ui/dev/shots.mjs --out /private/shots
node bin/panel_ui/dev/integration.mjs --url http://127.0.0.1:8791 --out /private/integration
```

Node 22+ and a cached Chromium (or `CHROME`) are needed for UI tests only. The
integration driver needs a disposable dry-run server. `--sync` opts into COM
reads; `--routines` requires simulated routine commands. Never test routine or
mail-write buttons against the owner's live configuration. Inspect captures and
results JSON. Reload the panel after changing live/trial configuration.

## Notifications

`notifications.enabled: true` enables silent native Windows toasts via
`powershell.exe`. Run completion and newly overdue dates are observed without a
model. The first poll establishes a silent baseline. Events are batched and
SQLite deduplication survives restart; a postponed row can notify at its new date.
`poll_seconds` defaults to 30 and `min_interval_seconds` to 120. Inspect
`GET /api/notifications` for status; accepted delivery still follows Windows
notification settings. Set `enabled: false` and restart to stop delivery.

For the HTTP, session, filing and COM evidence contracts see
[panel-api](../docs/panel-api.md).
