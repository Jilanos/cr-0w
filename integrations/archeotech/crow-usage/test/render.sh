#!/bin/bash
# Headless renders of the crow-usage pill + panel, one per fixture and look.
#   render.sh SHELL_CHECKOUT OUT_DIR
# Needs the module installed (symlinked) in ~/.local/share/archeotech/modules:
# shot.sh seeds its fake HOME from there.
set -euo pipefail
SHELL_ROOT="${1:?shell checkout}"; OUT="${2:?out dir}"
HERE="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$OUT"
python3 -I "$HERE/gen.py" "$OUT" >/dev/null
for c in normal low error; do
  "$SHELL_ROOT/scripts/shot.sh" --shell-config "$OUT/layout-$c.json" --state panel:plugin:crow-usage -w 10 "$OUT/$c.png"
done
LIGHT="${LIGHT_THEME:-archeotech-latte}"
"$SHELL_ROOT/scripts/shot.sh" --shell-config "$OUT/layout-normal.json" --state panel:plugin:crow-usage -w 10 \
  --theme "$LIGHT" --pack base "$OUT/normal-light.png"
"$SHELL_ROOT/scripts/shot.sh" --shell-config "$OUT/layout-low.json" --state panel:plugin:crow-usage -w 10 \
  --pack grimdark "$OUT/low-grimdark.png"
ls "$OUT"/*.png
