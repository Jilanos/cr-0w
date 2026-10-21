# crow agents (archeotech-shell module)

Shows crow's agents on the archeotech-shell bar: background runs, Claude
sessions waiting on you, and toasts when a run ends.

## What it shows

- **Bar pill** (`bar-zone`): `▰▱  ◆1`. The gauge is background runs
  busy/max (one cell per slot, filled = busy). `◆N` (accent colour) counts what needs you
  (sessions waiting for your reply, failed or limit-stopped runs, sessions stopped by a
  usage limit in the last 24 h), and only appears when N > 0. Hover for a one-line summary per working or waiting agent;
  click to open the agents panel. A dimmed pill means the last poll failed
  (the popup says "crow unavailable").
- **Panel** (`panel-content`): the same groups and one-line rows as `crow watch`:
  NEEDS YOU (waiting sessions, failed or limit-stopped runs, sessions stopped by a
  usage limit from `crow sessions`), WORKING (runs and working sessions), FINISHED
  (5 most recent), IDLE. Row: state glyph, project, task, what is happening ("waiting
  for your reply", the last action, "done · 2 commits", "work 5h limit, back 19:46"),
  age, and the context % once it reaches 70 %. Left click on a session
  focuses its kitty window (`crow focus`), or resumes it in a new one when none holds it;
  right click copies the run/session id (`wl-copy`), and so does a left click on a headless
  run or a stopped session. "open crow watch" launches the watch command.
- **Notifications** (`notify-send`): a background run finished (done or failed),
  and, as a separate critical toast, a run stopped on the usage limit. Runs that
  had already ended when the shell started don't fire; a run never fires twice.
  Waiting sessions don't notify (Claude already does).

Data comes from `crow json` every 5 s and `crow sessions list --json` every minute
(one poller per shell, shared by every placed instance). Commands run as `bash -lc` with `~/.local/bin` prepended to `PATH`.

## Install

```sh
ln -sfn "$PWD" ~/.local/share/archeotech/modules/crow-agents
```

Then place it with **Edit Layout** (`Super+Shift+E`): add *Crow Agents* to a bar
zone for the pill (click it to open the panel from the bar), and/or to a strip for
a panel opener.

## Config (gear on the pill's chip in Edit Layout)

| Field | Default | Meaning |
|---|---|---|
| `command` | `crow json` | Prints the agents snapshot as JSON |
| `watchCommand` | `kitty -e crow watch` | Run by the panel's "open crow watch" button |
| `sessionsCommand` | `crow sessions list --json` | Sessions stopped by a usage limit; empty turns them off |
| `notifications` | on | Run finished / usage-limit toasts |

The shell passes config only to bar instances. The panel uses whatever the pill
set, or the defaults when no pill is placed. With several pills, the last-loaded
config wins.

## Files

- `module.json`: manifest (`bar-zone` + `panel-content`, config schema)
- `CrowAgents.qml`: entry; renders the pill under a bar, the panel under a panel host
- `CrowStore.qml` + `qmldir`: singleton poller, derived views, notifications
