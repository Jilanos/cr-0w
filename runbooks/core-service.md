# Core service (state API and Nest over the tailnet)

`crow-core serve` serves the read and action API under `/api` and the built Nest at `/` on one origin.

## Install and check
1. `cd tools/nest && npm run build` (core serves `tools/nest/dist`).
2. `bin/crow core install`: writes `~/.config/systemd/user/crow-core.service` under the real home (cdx sandboxes HOME), enables and restarts it, runs `tailscale serve --bg --https=443 http://127.0.0.1:8787`.
3. Linger keeps the unit up after logout: `loginctl enable-linger <user>` (install prints the hint when it is off).
4. `bin/crow core status`: unit state, listen address, socket, Nest dir, `tailscale serve status`.
5. After rebuilding the binary (any `bin/crow core|mission|inbox` call rebuilds when Go sources are newer): `bin/crow core restart`.

## Access rules
- TCP `127.0.0.1:8787` needs the `Tailscale-User-Login` header equal to the owner login. tailscale serve sets it for tailnet requests. The login comes from `serve.owner_login` in the config, else from `tailscale status --json`.
- Unix socket `local/state/core.sock` (mode 0600) is trusted: no identity header.
- Non-GET requests need `X-Crow: 1` and a same-origin `Origin`. No CORS headers, ever.
- Artifacts: only regular files under the mission's `outbox/`, within the kind's per-file cap; anything else is 404.

## Probe
- `curl -s --unix-socket local/state/core.sock http://x/api/state/inbox`
- `curl -s https://<host>.<tailnet>.ts.net/api/state/inbox` from any tailnet node of the owner.
- `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8787/api/state` answers 403 (no identity).
- Repeat with `If-None-Match: <etag>`: 304 until the store version moves.

## Actions (Nest writes)
- `POST /api/missions` (201, body `{kind, project, goal, end_state, autonomy?, key?, gates?}`): dispatch, same as `crow mission new`.
- `POST /api/missions/<id>/answer` (body `{item?, verb?, text?, version}`): `version` is the mission version the owner answered; a stale one is 409 and writes nothing.
- `POST /api/missions/<id>/stop`, `/cancel` (body `{reason?}`), `POST /api/inbox/<item>/hide`.
- Ids are exact (no prefix match). Errors: 400 bad body, 404 unknown, 409 wrong state or stale version.
- Each action writes an `action` event `{action, surface, ...}` with `actor: owner`; Nest uses surface `nest`, the CLI `cli`. CLI and API call the same `mission` functions.
- CLI twins: `crow mission new|cancel|stop <id>`, `crow inbox answer`, `crow inbox hide <item>`.
- Probe: `curl -s --unix-socket local/state/core.sock -H 'X-Crow: 1' -X POST http://x/api/missions/<id>/stop`.

## Live actions (sessions, runs, mail)
- `POST /api/sessions` (body `{project, account?, prompt?}`): `crow term --on-busy fail` with `CROW_TERMINAL=headless`, account forced through `CROW_ACCOUNT`. The session runs in a detached tmux session (own systemd scope, survives a core restart); the reply and the agent row carry `tmux`. A first start in a project can stop on Claude's "external CLAUDE.md imports" dialog: the row shows with state `setup` and the dialog is answered in the Nest Terminal tab (or `tmux attach -t <name>`).
- `POST /api/sessions/<id>/resume` (body `{account?}`): resumes a row of the `sessions` section (limit-cut sessions) in its own cwd, headless like a start (`cdx resume <account> --project <cwd> --conversation <id>` in tmux); the reply carries `tmux`.
- `GET /api/sessions/<pid>/screen`, `POST /api/sessions/<pid>/keys` (body `{keys:[{key}|{text}]}`), `POST /api/sessions/<pid>/resize` (body `{cols 20-400, rows 5-200}`): `crow-screen` over the pid's tmux pane, else its kitty window (`kitten @ get-text --ansi`, send-text/send-key; a kitty window keeps its size), for the Nest Terminal tab. Interactive sessions only: 409 for a background run or a call refused, 502 when tmux or kitty fails. Not logged to actions.jsonl (keystrokes and screens stay out of the log).
- `POST /api/sessions/<pid>/send` (body `{text}`), `/interrupt`, `/stop`, `/attach`: `crow-focus --pid`. Attach focuses the kitty window holding the pid, else opens kitty on `tmux attach`; closing it leaves the session running. The pid must be an agent of the `dispatch` section.
- `POST /api/sessions/<pid>/answer` (body `{prompt, option}`, option `allow` or `deny`): `crow-prompt answer`. 409 when the agent no longer waits on that prompt id, or on allow for a work push/MR (approvals only). The prompt comes from the `crow-prompt hook` PermissionRequest hook.
- `POST /api/dispatch` (body `{project, label, prompt, model?, account?}`): `crow-runs dispatch` with a temp prompt file, `--account` when one is named (never-accounts are 400). Full slots are 409 before anything runs.
- `POST /api/dispatch/<run>/stop`, `POST /api/today/<id>/done`, `/snooze` (Outlook flag only).
- Each route refreshes the section it checks first. A failed refresh is a stale view: 409, nothing runs. Accounts with policy `never` are 400.
- Replies: 200 done, 409 refused (script code 1), 502 failed (code 2), 503 no script runner. Every POST needs the `X-Crow: 1` header (curl tests too). Every run appends one line to `local/state/actions.jsonl` with `actor: owner`, `surface: nest`.

## Sections
- Store sections: `inbox`, `missions`, `runs`.
- Script sections, the deck's own `bin/` JSON: `sessions` (crow-sessions), `dispatch` (crow-runs), `usage` (crow-usage), `today` (crow-today), `mrs` (crow-mrs), `checks` (crow-checks), `projects` (crow-registry), `accounts` (crow-accounts), plus `jobs` (systemd timers).
- A script section answers its last good body at once. Refresh runs in the background, one run per section, when the body is older than its TTL and someone read it in the last 2 min.
- A failed run keeps the data, adds `stale: true` and `error`, and keeps the old `updated_at`. Before the first good run the body is `data: []` with `stale`.

## Config (`serve:` in the crow config)
- `listen` (default `127.0.0.1:8787`), `socket`, `nest` (relative to the crow home), `owner_login`.
- `ttl`: refresh period per script section, e.g. `ttl: {mrs: 300s}`. Defaults: sessions 5s, dispatch 10s, accounts/jobs 30s, usage/today 60s, mrs 120s, checks/projects 300s.

## Nest against the live core
- `cd tools/nest && VITE_NEST_SOURCE=api npm run dev`: the dev server proxies `/api` to the unix socket. Plain `npm run dev` and tests use fixtures; production builds always read the API.
- After `npm run build` the core serves the new `dist/` at once; no restart.
- Test mission for a live check: `bin/crow mission new --kind research --project cr-0w --goal "..." --end-state "probe only"` lands `queued` (nothing ticks on its own). Then `bin/crow mission cancel <id> --reason ...`, remove `local/state/missions/<id>/` and run `tools/crow-core/crow-core rebuild` to drop it from the store.

## Phone on the tailnet
- Android Private DNS (a DoT host such as AdGuard) breaks DNS while Tailscale is on: apps lose the network and messages stop. Set Private DNS to Off or Automatic.
- Keep "Use Tailscale DNS" on in the phone app: public resolvers answer NXDOMAIN for the `*.ts.net` Nest name, so only MagicDNS reaches core.
- To keep a filtering resolver, set it as a global nameserver in the admin console (login.tailscale.com/admin/dns) with "Override local DNS" on.

## Fixtures
- `go test ./internal/api -update` in `tools/crow-core` rewrites `logics/specs/core_contract/fixtures/api/*.json`; `tests/test_core_contract.py` checks them against the record schemas.
- Action replies are `api/action-*.json` and `api/error-*.json`; their request bodies sit in `api/requests/`.
