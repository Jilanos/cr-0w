# panel_ui

Static front end of the crow panel. Served by `bin/crow-panel serve` on 127.0.0.1. Plain HTML, CSS and ES modules: no build step, no dependency, no remote resource.

## Layout

| File | Role |
|---|---|
| `index.html` | Shell: rail, header, three panes (list, detail, chat), log drawer, toasts, dialog |
| `style.css` | Whole visual system: light and dark tokens, layout, responsive rules |
| `js/api.js` | Real API client (session, CSRF header, SSE) and the in-memory fake server of fixtures mode |
| `js/ui.js` | DOM helpers, icons, rich-text segments, formatting, toasts, log drawer, menus |
| `js/app.js` | Data cache, navigation, rail and header, shared actions (Réglé, Reporter, Annuler, routines, files), keyboard |
| `js/views.js` | The eight views: Aujourd'hui, Mails (inbox and triage proposals), Relances & échéances, Décisions, Brouillons, Dossiers, Jobs, Comptes |
| `js/chat.js` | Per-topic chat: thread, model and account selectors, live answer over SSE |
| `fixtures/` | Exact copy of the API contract fixtures, with `index.json` (route to file, scenarios) |
| `dev/shots.mjs` | Headless Chromium checks and screenshots |

## Fixtures mode

Open `index.html?fixtures=1` from any static server (the panel server included). The fake server reads `fixtures/index.json`, answers every route from it and keeps mutations in memory: Réglé moves the line to the done section, Annuler restores it, triage removes the filed mails, chat messages are appended. SSE is replayed from `run-events.json`, 400 ms between events.

Scenarios replace routes: `?fixtures=1&scenario=locked`. Available: `empty`, `locked`, `partial`, `conflict`, `consumed`, `expired`, `nobody`, `queued`, `policy`, `upstream`, `recovered`, `forbidden`, `idempotency`.

Quick local run without the panel server:

```sh
python3 -m http.server 8791 --bind 127.0.0.1 --directory bin/panel_ui
# then http://127.0.0.1:8791/index.html?fixtures=1
```

## Security rules the code follows

- CSP `script-src 'self'; style-src 'self'`: no inline script, no `style=""` in HTML. Dynamic sizes go through CSSOM (`el.style.setProperty`).
- No `innerHTML`. Server text goes through `textContent`. Rich text arrives as segments; links render only for `https:` URLs, files only as an opaque `file_id` opened through `POST /api/files/{id}/open`.
- Every POST carries `X-Crow-Token` from `GET /api/session` and a fresh `request_id`. On 403 `csrf` the client reads the session once and replays.
- `localStorage` keeps only the view, the selection per view, the mail mode, the theme and the rail state. No mail data.

## Checks and screenshots

```sh
node bin/panel_ui/dev/shots.mjs --out <dir>            # all checks, PNG captures, results.json
node bin/panel_ui/dev/shots.mjs --only flow-triage     # subset by name
CHROME=/path/to/chrome node bin/panel_ui/dev/shots.mjs # explicit browser
```

The script serves this folder with the server's CSP headers, opens every view in light and dark, the mobile and mid widths, every fixture scenario, and drives the main flows (Réglé then Annuler, Reporter, Relancer, reply-all, triage plan then execute then Annuler le lot, chat with live answer, routine log, keyboard shortcuts, hostile segments). It fails on any console error, CSP violation or missing element. Node 22 or later, no package.

## Keyboard

`j`/`k` move, `Entrée` opens, `e` Réglé (pending lists only), `r` opens the reply-all instructions box (never sends), `c` chat, `/` filter, `x` check a triage proposal, `?` help, `Échap` closes, `g` then a letter switches view (`t m p d b f j a`).
