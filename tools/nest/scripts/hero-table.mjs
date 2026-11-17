// Holotable option checks (item_216), headless, fixtures under vite dev.
//   node scripts/hero-table.mjs hash [table]   sha256 of drawScene frames at fixed options per size
//                                             (no table = the current default, for the pixel-identity check)
//   node scripts/hero-table.mjs perf [table]   median/max drawScene ms per size at dpr 2, live-head path
//   OUT=dir node scripts/hero-table.mjs shot [table]   PNG of one live frame per size into OUT (before/after diffs)
//   node scripts/hero-table.mjs prof [table]   CPU profile of the perf frames at 1440x900: top self time per function
import { spawn } from 'node:child_process'
import { chromium } from 'playwright-core'
const [mode = 'hash', table] = process.argv.slice(2)
const PORT = 4393
const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', cwd: new URL('..', import.meta.url).pathname })
const base = `http://localhost:${PORT}`
for (let i = 0; i < 80; i++) { try { await fetch(base); break } catch { await new Promise((r) => setTimeout(r, 200)) } }
const browser = await chromium.launch({ headless: true, args: ['--use-angle=gl', '--enable-gpu', '--ignore-gpu-blocklist'] })
try {
  for (const [w, h] of mode === 'prof' ? [[1440, 900]] : [[1440, 900], [707, 691], [368, 812]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 })
    const page = await ctx.newPage()
    await page.goto(base + '/', { waitUntil: 'networkidle' })
    await page.waitForTimeout(800)
    const cdp = mode === 'prof' ? await ctx.newCDPSession(page) : undefined
    if (cdp) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 100 }); await cdp.send('Profiler.start') }
    const r = await page.evaluate(async ({ mode, table }) => {
      const sc = await import('/src/hero/scene.ts'); const md = await import('/src/hero/model.ts'); const fx = await import('/src/data/fixtures.ts')
      const heads = (await import('/src/hero/heads.json')).default
      const src = fx.fixtureSource(); const m = md.heroModel(await src.missions(), await src.inbox(), undefined, src.now())
      const box = document.querySelector('.hero-box'); const W = box.clientWidth, H = box.clientHeight
      const cv = document.createElement('canvas')
      const pal = { ring: [79, 195, 255], dim: [95, 120, 168], fg: [216, 230, 255], accent: [192, 92, 255], quiet: [168, 140, 255], state: { needs: [255, 184, 0], working: [46, 242, 255], failed: [255, 46, 99], sleeping: [111, 134, 184], queued: [138, 160, 200], done: [95, 120, 168] } }
      const opt = (i, live) => ({ now: src.now(), spin: i * 5, ...(table ? { table } : {}), ...(live ? { t: 1000 + i * 66, sweep: (i % 12) / 12, fx: sc.TABLE_FX, live: true, pulse: 0.3 } : {}) })
      if (mode === 'shot') {
        sc.drawScene(cv, W, H, 2, m, heads, pal, undefined, opt(3, true))
        return { W, H, png: cv.toDataURL('image/png') }
      }
      if (mode === 'hash') {
        const out = []
        for (const [i, live] of [[0, false], [3, true], [7, true]]) {
          sc.drawScene(cv, W, H, 2, m, heads, pal, undefined, opt(i, live))
          const px = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data
          const d = new Uint8Array(await crypto.subtle.digest('SHA-256', px))
          out.push([...d.slice(0, 6)].map((b) => b.toString(16).padStart(2, '0')).join(''))
        }
        return { W, H, hash: out.join(' ') }
      }
      const med = (t) => { t.sort((a, b) => a - b); return `${t[t.length >> 1].toFixed(1)}/${t[t.length - 1].toFixed(1)}` }
      const live = []
      sc.drawScene(cv, W, H, 2, m, heads, pal, undefined, opt(-1, true))
      for (let i = 0; i < 40; i++) { const a = performance.now(); sc.drawScene(cv, W, H, 2, m, heads, pal, undefined, opt(i, true)); live.push(performance.now() - a) }
      return { W, H, live: med(live) }
    }, { mode, table })
    if (r.png) { const f = `${process.env.OUT ?? '.'}/table-${table ?? 'default'}-${w}.png`; (await import('node:fs')).writeFileSync(f, Buffer.from(r.png.split(',')[1], 'base64')); delete r.png; r.file = f }
    console.log(w, h, JSON.stringify(r))
    if (cdp) {
      const { profile } = await cdp.send('Profiler.stop'), self = new Map(), dt = new Map()
      profile.samples.forEach((id, i) => dt.set(id, (dt.get(id) ?? 0) + (profile.timeDeltas[i] ?? 0)))
      for (const n of profile.nodes) {
        const f = n.callFrame, k = `${f.functionName || '(anon)'} ${f.url.split('/').pop()}:${f.lineNumber + 1}`
        self.set(k, (self.get(k) ?? 0) + (dt.get(n.id) ?? 0))
      }
      const tot = [...self.values()].reduce((a, b) => a + b, 0)
      for (const [k, v] of [...self].sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(`${((100 * v) / tot).toFixed(1).padStart(5)}%  ${k}`)
    }
    await ctx.close()
  }
} finally { await browser.close(); server.kill() }
