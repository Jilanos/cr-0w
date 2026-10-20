#!/bin/bash
# Headless renders of the crow-agents pill + panel, one per fixture and look.
#   render.sh SHELL_CHECKOUT OUT_DIR
# Env: SIZE (output mode, default 1920x1080), LIGHT_THEME (default archeotech-latte).
# Needs the module installed (symlinked) in ~/.local/share/archeotech/modules:
# shot.sh seeds its fake HOME from there.
set -euo pipefail
SHELL_ROOT="${1:?shell checkout}"; OUT="${2:?out dir}"
HERE="$(cd "$(dirname "$0")" && pwd)"
SIZE="${SIZE:-1920x1080}"
mkdir -p "$OUT"
OUT="$(cd "$OUT" && pwd)"
python3 -I "$HERE/gen.py" "$OUT" >/dev/null
shot() {
  "$SHELL_ROOT/scripts/shot.sh" -w 12 --state panel:plugin:crow-agents \
    --exec "wlr-randr --output HEADLESS-1 --custom-mode $SIZE >/dev/null 2>&1; sleep 3" "$@"
}
for c in busy idle error; do shot --shell-config "$OUT/layout-$c.json" "$OUT/$c.png"; done
shot --shell-config "$OUT/layout-busy.json" --theme "${LIGHT_THEME:-archeotech-latte}" --pack base "$OUT/busy-light.png"
shot --shell-config "$OUT/layout-busy.json" --pack grimdark "$OUT/busy-grimdark.png"
ls "$OUT"/*.png
