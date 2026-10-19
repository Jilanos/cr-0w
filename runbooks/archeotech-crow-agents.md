# archeotech crow-agents module: change and test

Module source: `integrations/archeotech/crow-agents/` (README there covers install and config).

## Test a change without touching the live session
Render only with the shell checkout's `scripts/shot.sh`, from a scratch dir outside both repos.

1. Fixtures: JSON files shaped like `crow json` (`slots`, `agents`, `finished`), one per
   case (idle, 1 run working, 2/2 busy + 1 waiting, failed, usage limit).
2. A layout per fixture for `--shell-config`: a top bar with
   `{"id": "plugin:crow-agents", "config": {"command": "cat <fixture>.json"}, "align": "right"}`
   and a strip with `plugin:crow-agents`. The panel reads the pill's config through the
   shared singleton, so it shows the same fixture.
3. Render the pill and panel in one shot:
   `shot.sh --shell-config layout.json --state panel:plugin:crow-agents -w 10 out.png`
   Repeat with `--theme <light theme> --pack base` and `--pack grimdark`.
4. Notifications: point `command` at a script that prints the baseline fixture on the first
   call and the failed/limit fixture after it, then `--burst 3 -i 2 -w 12`. Expect one
   normal toast per finished run and a critical one for the usage limit, with no repeats.
5. Hover popup (no IPC state): a `--qml` harness that mocks `holderRoot.showPopup` and mounts
   the shell's `HoverCard`, then calls the pill's `showCard()` from a Timer. Theme colours
   are missing in `--qml` renders, so check the content, not the look.
6. Lint: `/usr/lib/qt6/bin/qmllint CrowAgents.qml CrowStore.qml` (should be silent).

## Gotchas
- A panel host injects only `panelRoot`/`appearance` (no `config`), and a bar injects
  `holderRoot`: that's why the entry declares neither as `required`.
- In harness QML, don't put `;` between function declarations on one line: it's a syntax error.
