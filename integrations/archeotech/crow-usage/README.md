# crow usage (archeotech-shell module)

Shows Claude usage from crow on the archeotech-shell bar: how much of the 5-hour
limit is left, what today cost, and where the tokens went.

## What it shows

- **Bar pill** (`bar-zone`): `▰▰▰▰▱ 74% · $13.36`. The gauge and percentage are
  the current account's 5h remaining; the amount is today's cost across all
  accounts. Colour by remaining: success > 50 %, warning 20–50 %, error < 20 %.
  The current account is the one `cdx status` marks active, else the account of
  the most recent session, else the first listed. Hover for a one-line summary;
  click to open the usage panel. A dimmed pill means the last poll failed.
- **Panel** (`panel-content`):
  - LIMITS: one row per account (● = current) with 5h and week gauges, % left
    and reset time (time only when the reset is today).
  - TODAY: cost, tokens, cache hit %, sessions.
  - LAST 7 DAYS: cost per day as bars (today highlighted), total and max.
  - TOP SESSIONS TODAY: the 5 costliest sessions touched today: state
    (● active, ⚙ background run, ✓ interactive), project, model, tokens, cost.
  - Footer: tokens rtk saved; retros written today and proposals pending.
  When a poll fails the title says so and the last good data stays (marked
  stale); with no data at all, only the error (last stderr line) is shown.

Data comes from `crow usage --json` (`bin/crow-usage`) every 60 s, one poller per
shell shared by every placed instance. Commands run as `bash -lc` with
`~/.local/bin` prepended to `PATH`. Colours, fonts, spacing and radii come only
from the injected theme tokens; nothing draws before they arrive.

## Install

```sh
ln -sfn "$PWD" ~/.local/share/archeotech/modules/crow-usage
```

Then place it with **Edit Layout** (`Super+Shift+E`): add *Crow Usage* to a bar
zone for the pill (click it to open the panel from the bar), and/or to a strip
for a panel opener.

## Config (gear on the pill's chip in Edit Layout)

| Field | Default | Meaning |
|---|---|---|
| `command` | `crow usage --json` | Prints the crow-usage JSON payload |
| `interval` | 60 s | Seconds between polls |

As with crow agents, the panel uses whatever config the pill set.

## Files

- `module.json`: manifest (`bar-zone` + `panel-content`, config schema)
- `CrowUsage.qml`: entry; pill under a bar, panel under a panel host
- `CrowUsageStore.qml` + `qmldir`: singleton poller and derived views
- `test/gen.py`, `test/render.sh`: fixtures and headless renders
  (see `runbooks/archeotech-crow-usage.md`)
