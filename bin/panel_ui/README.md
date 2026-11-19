# panel_ui

Local visualisation and light feedback for Crow, with a shared hub Terminal.
Served by `bin/crow-panel serve` on loopback. Plain HTML, CSS and ES modules;
no build, dependency or remote resource.

| File | Role |
| --- | --- |
| `index.html` | Rail, header, list/detail panes, log drawer, dialogs |
| `style.css` | Themes, responsive layout and Terminal styling |
| `js/api.js` | Cookie/CSRF API client, SSE and fixture backend |
| `js/app.js` | Cache, routing, shared actions and keyboard |
| `js/views.js` | Today, mail, pending/deadlines/timeline, decisions, drafts, dossiers, jobs, accounts |
| `js/terminal.js` | Shared live Terminal, topic insertion and read-only conversation history |
| `js/terminal-ansi.js` | Plain JavaScript port of Nest's `ui/ansi.ts`: ANSI runs and key mappings |
| `js/ui.js` | Safe DOM, segments, toasts, dialogs and live logs |
| `fixtures/` | API fixtures for offline UI verification |
| `dev/shots.mjs` | Browser regression checks and captures |
| `dev/integration.mjs` | Checks against a disposable dry-run server |

Open **Terminal** in the rail, or **g**, **h**. The server uses upstream
`crow-screen` to show the tmux hub, send keys and resize. **Démarrer le hub** uses
`CROW_TERMINAL=headless crow term --account claude --on-busy fail crow` from the
data home (registered as project `crow`). The displayed `tmux attach -t <name>`
opens the same session from WSL in Windows Terminal.

**Envoyer au hub** inserts the topic title, source and optional note without
Enter, then opens Terminal. Enter there explicitly submits. Terminal writes
require live mode. **Historique** reads stored conversations; there is no chat
pane, `c` shortcut, message creation or chat model call.

Mail/calendar sync uses classic Outlook COM. Filing proposals come from rules
and history; unresolved mail shows **pas de proposition**. Only Maj and explicit
mail draft composition (`worka`) call a model. Tool update and Save OneDrive remain
separate routines. See [the runbook](../../runbooks/panel.md) for configuration.

## Fixtures and checks

```sh
python3 -m http.server 8791 --bind 127.0.0.1 --directory bin/panel_ui
# http://127.0.0.1:8791/index.html?fixtures=1
CHROME=/path/to/chrome node bin/panel_ui/dev/shots.mjs --out /private/shots
```

The fake server keeps mutations in memory. Terminal calls are simulated. Checks
cover every view, both themes, desktop/mobile layouts, Réglé/undo, Reporter,
reply-all simulation, rule filing/undo, logs, search, history and Terminal keys.
They fail on console errors, CSP violations or missing expected elements.
Node 22+ is needed only for tests. No model is called by UI tests.

## Interaction and security

`j`/`k` select, Enter opens detail, `e` marks pending/decision rows Réglé, `r`
opens reply instructions, `/` filters or searches, Ctrl+K searches, `x` checks a
filing proposal, `?` shows help, Escape closes. `g` then `t m p d b f j a h`
switches views. Terminal focus captures keys without applying list shortcuts.

CSP allows only local scripts/styles; server text uses `textContent` and safe DOM
nodes. ANSI parsing changes span styles, never interprets HTML. Every POST uses
the session token and a request id. Local storage retains navigation/theme/filter
preferences, never mail or terminal contents. File opens use opaque server ids.
