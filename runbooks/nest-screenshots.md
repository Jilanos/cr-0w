# Nest screenshots (headless)

Capture the Nest PWA screens for design review without opening a window.

1. `cd tools/nest && npm ci && npm run build`
2. Install the browser once, outside the sandboxed HOME so it survives sessions:
   `PLAYWRIGHT_BROWSERS_PATH=<real home>/.cache/ms-playwright npx playwright-core install chromium-headless-shell`
3. `PLAYWRIGHT_BROWSERS_PATH=<same path> npm run shots -- <out_dir>`
   writes `<screen>-<cover|inner|laptop>-<modern|cyber>.png` (24 files, 2x scale, Europe/Paris time).
4. Put review images in the vault crow folder (`Research/nest-design/<item>/`), never in `local/state/`.
   Compare with the boards using `bin/crow-compare`.

## Board vs build review (one screen at a time)

1. Render the approved boards the item names (never the running app or older PNGs):
   `cd tools/nest && PLAYWRIGHT_BROWSERS_PATH=<same path> node scripts/boards.mjs <boards_dir> <out_dir> fold-inbox-inner fold-inbox-inner-cyber ...`
   Each board has a `-cyber` variant; render both themes.
2. Shoot the matching app screen with `npm run shots` (or a one-off Playwright script on the fixture build at cover 368x812 and inner 707x691, 2x).
3. Copy both sets into `Research/nest-design/<item>/<screen>-compare/` with a `spec.json`:
   one decision, `rows` = sizes/themes, two `options` (Board, Build) whose `images` line up with the rows.
   `context` lists every deliberate gap (data that does not exist yet). Run `bin/crow-compare <spec.json>`.
4. Open the page in the real browser (`HOME=<real home> xdg-open .../spec.html`), then ask for the OK.
5. When no board draws an element, ask where it goes. Never draw it from the running app.

Gotchas:
- The script runs `vite preview` on port 4317; it needs `dist/`.
- Add a screen by editing `SCREENS` in `scripts/shots.mjs`.
- An empty `package.json` at the repo root breaks Vite resolution above `tools/nest`; the package reads shared fixtures through a virtual module for that reason.

## Hero holotable (layout, idle, perf)

The hero reads fixtures only under `vite dev`, so these scripts start their own dev server (no `dist/` needed).
Run from `tools/nest` with `PLAYWRIGHT_BROWSERS_PATH` set as above.

- `node scripts/hero-layout.mjs <out_dir> [size]`: rest, hover and card shots at cover, cover-cyber, inner and laptop.
  It waits for `.hero-pl[data-c]` (planets placed) before shooting; without it `dataset` is null and the script crashes.
- `node scripts/hero-idle.mjs`: paints per second at rest. Expect 0 with reduced motion; otherwise the slow tick (rim sweep, working pulse) paints about 10/s.
- `node scripts/hero-perf.mjs`: median and max draw time per frame per size. Baseline 2026-11-12 (1.25x grid): laptop about 18 ms, inner and phone about 16 ms. Budget 20 ms; medians drift 1 to 2 ms between runs.

Overlay rules (`src/hero/declutter.ts`, tests beside it):
- Every text box over the canvas carries `data-prio` (lower places first). `data-fixed` only blocks, `data-hide` may hide, `data-own` ignores its own planet disc, `data-up` lets the card flip above or dock at the bottom.
- Text never covers text and labels never clip at the edge; a box with no free spot hides.
- Layout reruns after `document.fonts.ready`, since widths change once Fira Code loads.
- Scene cells share the head cell size (`HS * min(w/344, h/400)`, divided by `DENSITY`), so phone and laptop keep the same ASCII detail.
- `hero-layout.mjs` sometimes times out waiting for planets: rerun it. If it fails every time, check port 4320 for a stale vite. Never `pkill -f` a pattern that is also in your own command line: it kills the calling shell.

### Head rebake at another density
`scripts/hero-heads.mjs` bakes heads.json, heads-l.json and heads-r.json from the spike page. `SIZE` sets the bake resolution; scale every value with `DENSITY` in `scene.ts`:
1x `w=690&h=640&focal=794&dy=128`, 1.25x `w=863&h=800&focal=993&dy=160`, 1.5x `w=1035&h=960&focal=1191&dy=192`.
`HEAD_COLS` stays the 1x width (173), so the head keeps its on-screen size.

### Visual variants for a design pick
Put a temporary `globalThis.__ring`-style switch in the scene, shoot each variant with a throwaway Playwright script (`addInitScript` sets the switch), then lay them out with `bin/crow-compare`. Review zoom crops before showing: first passes are usually too faint. Hardcode the pick and delete the switch before committing.

### Hero reels (video of every beat)
- `node scripts/hero-reel.mjs <out_dir> [WxH ...]`: whole hero (head + table) through load, planet tour, hover, select, drag, run, fail, idle; one MP4 per viewport from fixtures (api mode, `/api` routed per phase).
  - Env: `REEL_BEATS=drag` records the drag beats only; `REEL_SET='{"__x":1}'` sets page globals before load (variant switches); `REEL_TAG=x` names the output `hero-reel-x-<size>.mp4`. Compare variants with ffmpeg `hstack` and play with mpv (see open-links note).
  - Head conventions: negative pitch looks down, negative yaw looks left; spinning the table up moves the front planets left.
- `node scripts/head-reel.mjs <out.webp> [cell px]`: the GPU head alone through the same beats.
- Playwright `recordVideo` and the CDP screencast capture at CSS px whatever `deviceScaleFactor` says: small heads smear. Use a `Page.captureScreenshot` loop with `clip.scale` (2 on phone) and ffmpeg concat durations, as `hero-reel.mjs` does.
- `reducedMotion: 'reduce'` hides the GL head: screenshot `.hero-box` without it.
- Live core data for a check: `curl --unix-socket local/state/core.sock http://x/api/state/<section>`.
- After a Nest change, run `npm run build`: core serves `tools/nest/dist`, so the phone keeps the old app until then (no restart needed).
