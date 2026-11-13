// Headless hero perf at dpr 2: median table paint (drawScene) for the bake path and the live-head path
// (head drawn on the GPU, table with all effects), plus one GL head frame (synced with readPixels).
import { spawn } from 'node:child_process'
import { chromium } from 'playwright-core'
const PORT = 4391
const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', cwd: new URL('..', import.meta.url).pathname })
const base = `http://localhost:${PORT}`
for (let i = 0; i < 80; i++) { try { await fetch(base); break } catch { await new Promise((r) => setTimeout(r, 200)) } }
const browser = await chromium.launch({ headless: true, args: ['--use-angle=gl', '--enable-gpu', '--ignore-gpu-blocklist'] })
try {
  for (const [w, h] of [[1440, 900], [707, 691], [368, 812]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 })
    const page = await ctx.newPage()
    await page.goto(base + '/', { waitUntil: 'networkidle' })
    await page.waitForTimeout(800)
    const r = await page.evaluate(async () => {
      const sc = await import('/src/hero/scene.ts'); const md = await import('/src/hero/model.ts'); const fx = await import('/src/data/fixtures.ts')
      const heads = (await import('/src/hero/heads.json')).default
      const src = fx.fixtureSource(); const m = md.heroModel(await src.missions(), await src.inbox(), undefined, src.now())
      const box = document.querySelector('.hero-box'); const W = box.clientWidth, H = box.clientHeight
      const cv = document.createElement('canvas'); const pal = { ring: [79,195,255], dim: [95,120,168], fg: [216,230,255], accent: [192,92,255], state: { needs: [255,184,0], working: [46,242,255], failed: [255,46,99], sleeping: [111,134,184], queued: [138,160,200], done: [95,120,168] } }
      const med = (t) => { t.sort((a, b) => a - b); return `${t[t.length >> 1].toFixed(1)}/${t[t.length - 1].toFixed(1)}` }
      const agenda = await src.agenda(), bake = [], live = []
      let o
      // One untimed call per path first: it builds the masks and glyph caches (a one-off cost).
      const opt = (i, liveFx) => ({ now: src.now(), agenda, spin: i * 5, ...(liveFx ? { t: i * 66, sweep: (i % 12) / 12, fx: sc.TABLE_FX, live: true } : {}) })
      sc.drawScene(cv, W, H, 2, m, heads, pal, undefined, opt(-1, false))
      for (let i = 0; i < 30; i++) { const a = performance.now(); o = sc.drawScene(cv, W, H, 2, m, heads, pal, undefined, opt(i, false)); bake.push(performance.now() - a) }
      sc.drawScene(cv, W, H, 2, m, heads, pal, undefined, opt(-1, true))
      for (let i = 0; i < 30; i++) { const a = performance.now(); o = sc.drawScene(cv, W, H, 2, m, heads, pal, undefined, opt(i, true)); live.push(performance.now() - a) }
      const G = await import('/src/hero/gl/head.ts'), gc = document.createElement('canvas'), hd = G.createHead(gc), gt = []
      if (hd) {
        const L = hd.layout({ cw: o.head.cw, ch: o.head.ch, font: o.head.font, dpr: 2 }); gc.style.width = L.w + 'px'; gc.style.height = L.h + 'px'
        const gl = gc.getContext('webgl2'), px = new Uint8Array(4)
        const f = { yaw: 8, pitch: 2, tilt: 0, blink: 0, gaze: [1, 0], face: 'run', pose: { from: 'rest', to: 'grab', k: 1 }, tip: [46, 242, 255], hold: [46, 242, 255], glitch: 0, flicker: 1, shimmer: 0.01, scan: 0.4 }
        hd.render(f, 0)
        for (let i = 0; i < 20; i++) { const a = performance.now(); hd.render({ ...f, yaw: i }, i / 30); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); gt.push(performance.now() - a) }
      }
      return { W, H, bake: med(bake), live: med(live), head: gt.length ? med(gt) : 'n/a' }
    })
    console.log(w, h, JSON.stringify(r))
  }
} finally { await browser.close(); server.kill() }
