// Holotable option checks (item_216), headless, fixtures under vite dev.
//   node scripts/hero-table.mjs hash [table]   sha256 of drawScene frames at fixed options per size
//                                             (no table = the current default, for the pixel-identity check)
//   node scripts/hero-table.mjs perf [table]   median/max drawScene ms per size at dpr 2, live-head path
//   OUT=dir node scripts/hero-table.mjs shot [table]   PNG of one live frame per size into OUT (before/after diffs)
//   TABLEGL=on|off forces the WebGL grid or the 2D path for the lit table (item_270)
//   node scripts/hero-table.mjs bench [table]  load-proof perf: each frame is timed right after a fixed
//                                             reference workload (calib), and reported as frame/calib.
//                                             A busy machine slows both, so the ratio holds. Also counts
//                                             canvas calls per frame (exact, load-free). Compare ratios
//                                             and counts before/after; `idle` = ratio x CAL_IDLE_MS.
//   node scripts/hero-table.mjs prof [table]   CPU profile of the perf frames at 1440x900: top self time per function
import { spawn } from 'node:child_process'
import { chromium } from 'playwright-core'
const [mode = 'hash', table] = process.argv.slice(2)
const PORT = 4393
// Reference workload time on this machine when idle (median ms); set from an idle `bench` run.
const CAL_IDLE_MS = Number(process.env.CAL_IDLE_MS ?? 0)
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
    const r = await page.evaluate(async ({ mode, table, tablegl, bloomk, bloomg }) => {
      // TABLEGL=on|off picks the WebGL grid or the 2D path (item_270); BLOOMK tunes its blur scale.
      if (tablegl) localStorage.setItem('nest.tablegl', tablegl)
      if (bloomk) globalThis.__bloomK = Number(bloomk)
      if (bloomg) globalThis.__bloomGain = Number(bloomg)
      const sc = await import('/src/hero/scene.ts'); const md = await import('/src/hero/model.ts'); const fx = await import('/src/data/fixtures.ts')
      const heads = (await import('/src/hero/heads.json')).default
      sc.resetTableGl?.()
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
      if (mode === 'bench') {
        // Reference workload: fixed math and text drawing, independent of Nest code.
        const rc = document.createElement('canvas'); rc.width = 900; rc.height = 600; const rx = rc.getContext('2d')
        rx.font = '13px monospace'
        const calib = () => {
          const a = performance.now(); let acc = 0
          for (let i = 0; i < 120000; i++) acc += Math.sin(i * 0.37) * Math.sqrt(i + 1)
          for (let i = 0; i < 1500; i++) { rx.fillStyle = `rgba(${i % 255},120,200,0.8)`; rx.fillText('abc:#-=*@', (i * 37) % 880, (i * 53) % 590) }
          rx.getImageData(0, 0, 1, 1)
          return acc === -1 ? 0 : performance.now() - a
        }
        const frame = (i) => { const a = performance.now(); sc.drawScene(cv, W, H, 2, m, heads, pal, undefined, opt(i, true)); cv.getContext('2d').getImageData(0, 0, 1, 1); return performance.now() - a }
        for (let i = 0; i < 6; i++) { calib(); frame(i) }
        const ratio = [], fr = [], cal = []
        for (let i = 0; i < 80; i++) { const c = calib(), f = frame(i % 40); cal.push(c); fr.push(f); ratio.push(f / c) }
        const q = (t, p) => { const u = [...t].sort((a, b) => a - b); return u[Math.min(u.length - 1, Math.floor(p * u.length))] }
        // Exact work per frame: wrap the 2D context methods for one pass (not timed).
        const P = CanvasRenderingContext2D.prototype, names = ['fillText', 'fillRect', 'drawImage', 'getImageData', 'putImageData', 'arc', 'fill'], orig = {}, n = {}
        let chars = 0
        for (const k of names) { orig[k] = P[k]; n[k] = 0; P[k] = function (...a) { n[k]++; if (k === 'fillText') chars += String(a[0]).length; return orig[k].apply(this, a) } }
        const N = 10
        for (let i = 0; i < N; i++) sc.drawScene(cv, W, H, 2, m, heads, pal, undefined, opt(i * 4, true))
        for (const k of names) P[k] = orig[k]
        const per = Object.fromEntries(Object.entries(n).filter(([, v]) => v).map(([k, v]) => [k, Math.round(v / N)]))
        per.chars = Math.round(chars / N)
        return { W, H, ratio: +q(ratio, 0.5).toFixed(3), ratioP10: +q(ratio, 0.1).toFixed(3), frame: `${q(fr, 0.1).toFixed(1)}/${q(fr, 0.5).toFixed(1)}/${q(fr, 0.95).toFixed(1)}`, calib: +q(cal, 0.5).toFixed(2), per }
      }
      const med = (t) => { t.sort((a, b) => a - b); return `${t[t.length >> 1].toFixed(1)}/${t[t.length - 1].toFixed(1)}` }
      const live = []
      sc.drawScene(cv, W, H, 2, m, heads, pal, undefined, opt(-1, true))
      for (let i = 0; i < 40; i++) { const a = performance.now(); sc.drawScene(cv, W, H, 2, m, heads, pal, undefined, opt(i, true)); live.push(performance.now() - a) }
      return { W, H, live: med(live) }
    }, { mode, table, tablegl: process.env.TABLEGL, bloomk: process.env.BLOOMK, bloomg: process.env.BLOOMG })
    if (r.png) { const f = `${process.env.OUT ?? '.'}/table-${table ?? 'default'}-${w}.png`; (await import('node:fs')).writeFileSync(f, Buffer.from(r.png.split(',')[1], 'base64')); delete r.png; r.file = f }
    if (mode === 'bench') r.idle = +(r.ratio * CAL_IDLE_MS).toFixed(1)
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
