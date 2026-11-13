// Full hero reel (item_198): records the whole hero (head + holo table) through every beat and writes a
// shareable MP4 per viewport. The app runs in api mode and every /api call is answered from the fixtures
// (no personal data); mission states change per phase so run and fail play on demand (the page polls
// missions every 5 s, so each mood phase waits for one poll).
// Usage: node scripts/hero-reel.mjs <out dir> [WxH ...]   (default 1440x900 707x691 368x812)
// Env: REEL_BEATS=drag records the drag beats only. REEL_SET='{"__gaze":"front"}' sets globals before load
// (variant switches for a design pick); REEL_TAG names the files hero-reel-<tag>-<size>.mp4.
// Beats: load wave, planet tour (hover lifts each planet and shows its moons), long hover (think), select
// (present), drag spins both ways + coast, working (taps, sparks), fail (glitch, shiver, brace, droop), idle.
import { spawn, execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright-core'
const [out, ...sizes] = process.argv.slice(2)
const ONLY_DRAG = process.env.REEL_BEATS === 'drag', SET = JSON.parse(process.env.REEL_SET || '{}'), TAG = process.env.REEL_TAG ? `${process.env.REEL_TAG}-` : ''
if (!out) throw new Error('usage: hero-reel.mjs <out dir> [WxH ...]')
mkdirSync(out, { recursive: true })
const PORT = 4398
const root = new URL('..', import.meta.url).pathname
const read = (f) => JSON.parse(readFileSync(join(root, f), 'utf8'))
const rec = (f) => { const b = read(f); return Array.isArray(b) ? b : b.data }
const MISSIONS = [...rec('../../logics/specs/core_contract/fixtures/records/missions.json'), ...read('fixtures/states/missions.json')]
const LIVE = read('fixtures/states/live.json')
// idle: nothing works or fails; run: the working missions run; fail: the failed ones come back too.
const WORKING = ['running', 'preflight', 'publishing']
// waiting/review stay: the head watches the longest wait and takes its state colour (warm for needs).
const stateIn = (phase, st) => ((phase !== 'fail' && st === 'failed') || (phase === 'idle' && WORKING.includes(st)) ? 'queued' : st)
// Fixture times sit around NOW; move them to the present so the age labels read as in the app.
const NOW = Date.parse('2026-11-09T16:10:00+01:00')
const shift = (v, d) => JSON.parse(JSON.stringify(v), (_, x) => (typeof x === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d/.test(x) ? new Date(Date.parse(x) + d).toISOString() : x))
const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', cwd: root, env: { ...process.env, VITE_NEST_SOURCE: 'api' } })
const base = `http://localhost:${PORT}`
for (let i = 0; i < 80; i++) { try { await fetch(base); break } catch { await new Promise((r) => setTimeout(r, 200)) } }
const browser = await chromium.launch({ headless: true, args: ['--use-angle=gl', '--enable-gpu', '--ignore-gpu-blocklist'] })
const POLL = 5600
try {
  { const p = await browser.newPage(); await p.goto(base + '/', { waitUntil: 'networkidle' }); await p.waitForTimeout(1500); await p.close() }
  for (const s of sizes.length ? sizes : ['1440x900', '707x691', '368x812']) {
    const [vw, vh] = s.split('x').map(Number)
    const tmp = join(out, `.rec-${s}`); rmSync(tmp, { recursive: true, force: true })
    // Device pixel ratio as on the real device: at 1 the phone's small head cells smear and read dim.
    // recordVideo and the CDP screencast both capture at CSS px whatever the ratio: frames come from a
    // clipped screenshot loop instead (2x on phone only, where 1x smears the head cells; about 20 fps).
    const dpr = vw < 500 ? 3 : vw < 1000 ? 2 : 1
    mkdirSync(tmp, { recursive: true })
    const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: dpr })
    let phase = 'idle'
    const now = new Date().toISOString(), d = Date.now() - NOW
    const missions = shift(MISSIONS, d), live = shift(LIVE, d)
    const body = (section, data) => ({ section, version: `reel-${phase}`, updated_at: now, stale: false, data })
    await ctx.route('**/api/**', (route) => {
      const u = new URL(route.request().url()), name = u.pathname.replace(/^\/api\/state\//, '')
      if (name === 'missions') return route.fulfill({ json: body(name, missions.map((m) => ({ ...m, state: stateIn(phase, m.state) }))) })
      if (name === 'inbox') return route.fulfill({ json: body(name, []) })
      // Live agents count as working on the phone Home line: only the run phase keeps them.
      if (name === 'dispatch' && phase !== 'run') return route.fulfill({ json: body(name, { ...live.dispatch, agents: [] }) })
      if (u.pathname.startsWith('/api/state/')) return route.fulfill({ json: body(name, live[name] ?? null) })
      return route.fulfill({ status: 404, json: { error: 'reel: not served' } })
    })
    const page = await ctx.newPage()
    await page.addInitScript((set) => Object.assign(globalThis, set), SET)
    await page.goto(base + '/', { waitUntil: 'networkidle' })
    const box = await page.locator('.hero-box').boundingBox()
    const cdp = await ctx.newCDPSession(page), frames = [], clip = { ...box, scale: vw < 500 ? 2 : 1 }
    let rolling = true
    const roll = (async () => {
      while (rolling) {
        const t = Date.now() / 1000, { data } = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 92, clip, optimizeForSpeed: true })
        const f = join(tmp, `f${String(frames.length).padStart(6, '0')}.jpg`); writeFileSync(f, Buffer.from(data, 'base64')); frames.push([f, t])
      }
    })()
    await page.evaluate(([x, y]) => {
      const d = document.createElement('div'); d.id = 'reel-cap'
      d.style.cssText = `position:fixed;left:${x + 10}px;top:${y + 8}px;z-index:99;font:12px 'Fira Code',monospace;color:#8af;opacity:.85;pointer-events:none`
      document.body.append(d)
      // A drag that leaves the table must not select text or scroll the hero out of the frame.
      const st = document.createElement('style'); st.textContent = 'html,body{overflow:hidden!important}*{user-select:none!important}'
      document.head.append(st)
      // Selecting a planet can scroll its pipeline row into view (phone): pin every scroller to the top.
      addEventListener('scroll', (e) => { const t = e.target === document ? document.scrollingElement : e.target; if (t.scrollTop) t.scrollTop = 0 }, true)
    }, [box.x, box.y])
    const cap = (t) => page.evaluate((t) => { document.getElementById('reel-cap').textContent = t }, t)
    await cap('hello'); await page.waitForTimeout(ONLY_DRAG ? 1200 : 2800)
    await page.locator('.hero-pl').first().waitFor({ timeout: 8000 })
    const pls = await page.locator('.hero-pl').evaluateAll((els) => els.map((e) => e.dataset.c.split(',').map(Number)))
    if (!pls.length) throw new Error(`${s}: no planets on the table`)
    if (!ONLY_DRAG) {
    // Planet tour: hover each planet (max 4) so it lifts and shows its moons.
    await cap('planets: hover shows moons')
    for (const [x, y] of pls.slice(0, 4)) { await page.mouse.move(box.x + x, box.y + y, { steps: 14 }); await page.waitForTimeout(1300) }
    const [px, py] = pls[0]
    await cap('long hover: thinking'); await page.mouse.move(box.x + px, box.y + py, { steps: 12 }); await page.waitForTimeout(2800)
    await cap('select: present'); await page.mouse.click(box.x + px, box.y + py); await page.waitForTimeout(2400)
    if (!page.url().endsWith('/')) throw new Error(`${s}: the select click navigated to ${page.url()}`)
    // Drop the selection before the spins so the card and labels clear the table.
    await page.keyboard.press('Escape')
    if (await page.locator('.hero-card').count()) await page.mouse.click(box.x + 12, box.y + box.height * 0.5)
    if (await page.locator('.hero-card').count()) throw new Error(`${s}: the selection did not clear`)
    }
    await page.mouse.move(2, 2, { steps: 4 }); await page.waitForTimeout(600)
    // Spin the table (lower band, away from the head and labels): slow drag, fast flick, flick back, coast.
    const dy = Math.min(box.y + box.height * 0.82, vh - 24), dx = box.x + box.width * 0.2, span = box.width * 0.6
    await cap('drag: spin the table'); await page.mouse.move(dx, dy, { steps: 6 }); await page.mouse.down()
    await page.mouse.move(dx + span, dy, { steps: 40 }); await page.mouse.move(dx, dy, { steps: 40 }); await page.mouse.up()
    await page.waitForTimeout(800)
    await cap('flick: spin + coast'); await page.mouse.move(dx, dy, { steps: 4 }); await page.mouse.down()
    await page.mouse.move(dx + span, dy, { steps: 6 }); await page.mouse.up(); await page.waitForTimeout(2400)
    await page.mouse.move(dx + span, dy, { steps: 4 }); await page.mouse.down()
    await page.mouse.move(dx, dy, { steps: 6 }); await page.mouse.up()
    await page.mouse.move(2, 2, { steps: 4 }); await page.waitForTimeout(3000)
    if (!page.url().endsWith('/')) throw new Error(`${s}: a drag release navigated to ${page.url()}`)
    if (!ONLY_DRAG) {
      phase = 'run'; await cap('working'); await page.waitForTimeout(POLL + 3500)
      phase = 'fail'; await cap('fail'); await page.waitForTimeout(POLL + 3500)
      phase = 'idle'; await cap('back to idle'); await page.waitForTimeout(POLL + 2000)
    }
    rolling = false; await roll; await ctx.close()
    console.log(s, 'fps', (frames.length / (frames.at(-1)[1] - frames[0][1])).toFixed(1))
    // Each frame lasts until the next (concat demuxer durations).
    const list = frames.map(([f, t], i) => `file '${f}'\nduration ${((frames[i + 1]?.[1] ?? t + 0.5) - t).toFixed(4)}`).join('\n') + `\nfile '${frames.at(-1)[0]}'\n`
    writeFileSync(join(tmp, 'list.txt'), list)
    const even = (n) => Math.floor(n / 2) * 2
    const crop = `crop=${even(box.width * clip.scale)}:${even(box.height * clip.scale)}:0:0`
    const dst = join(out, `hero-reel-${TAG}${s}.mp4`)
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', join(tmp, 'list.txt'), '-vf', `${crop},fps=30`,
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'slow', '-movflags', '+faststart', '-an', dst])
    rmSync(tmp, { recursive: true, force: true })
    console.log('wrote', dst)
  }
} finally { await browser.close(); server.kill() }
