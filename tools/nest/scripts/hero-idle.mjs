// Headless idle check: hero paints per second at rest. 2D = table canvas paints, GL = live head frames
// (draws to the default framebuffer). Reduced motion expects 0 and 0 (static bake, no loops).
// A window blur expects 0 and 0 too; focus restores the idle rates.
import { spawn } from 'node:child_process'
import { chromium } from 'playwright-core'
const PORT = 4392
const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', cwd: new URL('..', import.meta.url).pathname })
const base = `http://localhost:${PORT}`
for (let i = 0; i < 80; i++) { try { await fetch(base); break } catch { await new Promise((r) => setTimeout(r, 200)) } }
const browser = await chromium.launch({ headless: true, args: ['--use-angle=gl', '--enable-gpu', '--ignore-gpu-blocklist'] })
try {
  for (const rm of ['no-preference', 'reduce']) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: rm })
    await ctx.addInitScript(() => {
      window.__draws = 0; window.__gl = 0
      const f = CanvasRenderingContext2D.prototype.drawImage
      // One table paint ends with the sharp layer: an unfiltered draw onto the visible canvas.
      CanvasRenderingContext2D.prototype.drawImage = function (...a) { if (this.canvas.isConnected && this.filter === 'none') window.__draws++; return f.apply(this, a) }
      const d = WebGL2RenderingContext.prototype.drawArrays
      WebGL2RenderingContext.prototype.drawArrays = function (...a) { if (this.getParameter(this.FRAMEBUFFER_BINDING) === null) window.__gl++; return d.apply(this, a) }
    })
    const page = await ctx.newPage()
    await page.goto(base + '/', { waitUntil: 'networkidle' })
    await page.waitForTimeout(3000)
    const a = await page.evaluate(() => [window.__draws, window.__gl])
    await page.waitForTimeout(3000)
    const b = await page.evaluate(() => [window.__draws, window.__gl])
    console.log(rm, '2D paints/s:', ((b[0] - a[0]) / 3).toFixed(1), 'GL head frames/s:', ((b[1] - a[1]) / 3).toFixed(1))
    if (rm === 'reduce') continue
    // Window blur stops both loops (expect 0 and 0); focus brings them back.
    for (const ev of ['blur', 'focus']) {
      await page.evaluate((ev) => window.dispatchEvent(new Event(ev)), ev)
      await page.waitForTimeout(500)
      const c = await page.evaluate(() => [window.__draws, window.__gl])
      await page.waitForTimeout(2000)
      const d = await page.evaluate(() => [window.__draws, window.__gl])
      console.log(rm, `after ${ev}`, '2D paints/s:', ((d[0] - c[0]) / 2).toFixed(1), 'GL head frames/s:', ((d[1] - c[1]) / 2).toFixed(1))
    }
  }
} finally { await browser.close(); server.kill() }
