# See a TUI: render terminal output to PNG

Use before showing or shipping any TUI change (crow watch, mockups): look at it at
real monitor sizes, in the real terminal theme and font, instead of guessing.

## Pipeline
1. Produce ANSI at a fixed size. For crow watch:
   `SHOTS=<dir> [RUNS=runs.json USAGE=usage.json] go test -run TestShots ./tools/crow-watch`
   writes `<view>-<size>.ans` for vertical 118x95, laptop 160x45, wide 240x62, small 90x30
   (fixtures by default; pass `crow-runs json` / `crow-usage --json` dumps for live data).
   Any other tool: dump its View() string (force colour, e.g. lipgloss
   `SetColorProfile(termenv.ANSI)`), or write mockups as ANSI directly.
2. Render: `bin/ansi-shot in.ans out.png --glass 1b5b70`
   - Colours from the kitty theme (`~/.config/kitty/current-theme.conf`), font FiraCode Nerd Mono.
   - `--glass HEX` blends the background with a wallpaper tint at kitty's
     `background_opacity`: use it to judge contrast on the translucent terminal.
   - Block elements are drawn edge to edge like kitty does.
   - The output line lists **fallback glyphs**: anything there is drawn from another
     font in kitty too, usually at a different size. Replace it with a glyph FiraCode has.
3. Read the PNG and fix what you see; crop with `magick in.png -crop WxH+X+Y +repage out.png`.

## Lessons
- ANSI 8 (bright black) is unreadable over a bright wallpaper at 50 % opacity: use ANSI 7
  for secondary text, keep 8 for borders and leaders.
- `▰ ▱ ⚙ ↵ ↻ ⏵` are not in FiraCode. Use `━ █ ▏…▉ ● ○ ◆ ✓`, or Nerd Font icons.
- Gauges: `lineBar` draws `▄` (lower half block) on a solid `▄` track in ANSI 8;
  `GAUGE=▆ go test -run TestShots` renders the chunkier variant.
- Size boxes to content; give leftover height to more content (earlier days, history), never padding.
- QML panels and the bar: use archeotech-shell `scripts/shot.sh` (see archeotech-crow-*);
  `--exec 'wlr-randr --output HEADLESS-1 --custom-mode 1080x1920; sleep 3'` renders a vertical monitor.
