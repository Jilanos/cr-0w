#!/bin/bash
# Headless renders of the crow-usage pill + panel, one per fixture and look.
#   render.sh SHELL_CHECKOUT OUT_DIR
# Env: SIZE (output mode, default 1920x1080), LIGHT_THEME (default archeotech-latte),
#      BAR_LAYOUT (a shell-config.json, e.g. your own: also renders it on a 1080x1920
#      vertical monitor with both crow pills fed from fixtures, to check auto-compact).
# Needs the module installed (symlinked) in ~/.local/share/archeotech/modules:
# shot.sh seeds its fake HOME from there.
set -euo pipefail
SHELL_ROOT="${1:?shell checkout}"; OUT="${2:?out dir}"
HERE="$(cd "$(dirname "$0")" && pwd)"
SIZE="${SIZE:-1920x1080}"
mkdir -p "$OUT"
OUT="$(cd "$OUT" && pwd)"
python3 -I "$HERE/gen.py" "$OUT" >/dev/null
mode() { echo "wlr-randr --output HEADLESS-1 --custom-mode $1 >/dev/null 2>&1; sleep 3"; }
shot() { "$SHELL_ROOT/scripts/shot.sh" -w 12 --exec "$(mode "$SIZE")" "$@"; }
for c in normal low error; do
  shot --shell-config "$OUT/layout-$c.json" --state panel:plugin:crow-usage "$OUT/$c.png"
done
shot --shell-config "$OUT/layout-normal.json" --state panel:plugin:crow-usage \
  --theme "${LIGHT_THEME:-archeotech-latte}" --pack base "$OUT/normal-light.png"
shot --shell-config "$OUT/layout-low.json" --state panel:plugin:crow-usage --pack grimdark "$OUT/low-grimdark.png"
if [ -n "${BAR_LAYOUT:-}" ]; then
  python3 -I "$HERE/../../crow-agents/test/gen.py" "$OUT/agents" >/dev/null
  jq --arg a "cat $OUT/agents/fx/busy.json" --arg u "cat $OUT/fx/normal.json" '
    (.sides[].content[]? | select(.id == "plugin:crow-agents") | .config.command) = $a |
    (.sides[].content[]? | select(.id == "plugin:crow-usage")  | .config.command) = $u' \
    "$BAR_LAYOUT" > "$OUT/layout-bar.json"
  "$SHELL_ROOT/scripts/shot.sh" -w 12 --exec "$(mode 1080x1920)" --shell-config "$OUT/layout-bar.json" "$OUT/bar-vertical.png"
  magick "$OUT/bar-vertical.png" -crop 1080x34+0+0 +repage "$OUT/bar-vertical-crop.png"
fi
ls "$OUT"/*.png
