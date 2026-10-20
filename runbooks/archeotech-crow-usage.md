# archeotech crow-usage module: change and test

Module source: `integrations/archeotech/crow-usage/` (README there covers install and config).
Same structure and test approach as [archeotech-crow-agents](archeotech-crow-agents.md).

## Test a change without touching the live session
1. Install once (shot.sh seeds its fake HOME from the real modules dir, so the
   module must be symlinked there; installing does not place it in the layout):
   `ln -sfn <hub>/integrations/archeotech/crow-usage ~/.local/share/archeotech/modules/crow-usage`
2. Lint: `/usr/lib/qt6/bin/qmllint CrowUsage.qml CrowUsageStore.qml` (should be silent).
3. Render everything: `test/render.sh <shell checkout> /tmp/crow-usage-dev`.
   `gen.py` writes the fixtures (`normal`, `low` limit, `error` = command exits 1
   with a stderr line) and one layout per fixture (top bar pill + strip opener);
   `render.sh` shoots each with `--state panel:plugin:crow-usage`, plus a light
   theme (`LIGHT_THEME`, default `archeotech-latte`, `--pack base`) and `grimdark`.
4. Crop the panel for review: `magick normal.png -crop 560x620+720+0 +repage c-normal.png`.
5. Check: pill colour per level (success/warning/error), no elided gauges, reset
   dates whole, footer on two lines, error state shows only title + stderr.

## Gotchas
- A real-data render (`command` = the hub's `bin/crow-usage --json`) runs inside
  shot.sh's fake HOME: cdx and rtk can't see their state there, so costs, limits
  and rtk come out empty. That's the sandbox, not the module; check live data with
  `crow usage` in a terminal instead.
- The strip panel is narrower than `panel.size` (≈ 470 px here): column widths are
  derived from the panel width, keep them that way.
- Gauge glyphs (▰▱) are wider than the font's average char: give gauge cells
  `elide: Text.ElideNone` and size them for the glyphs.
- No hex literals: colour fallbacks are `"transparent"` and the root is
  `visible: _c !== null`, so nothing draws before the theme is injected.
- The nested mango prints a `shadowscolor` config warning banner at the top of
  every shot: unrelated to the module.
