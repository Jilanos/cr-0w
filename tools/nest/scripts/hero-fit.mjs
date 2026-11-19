// Hero fit shots: the hero at the sizes where it clipped (Fold inner, web with the chat folded),
// plus the phone cover as the reference. Usage: node scripts/hero-fit.mjs <outdir>
import { spawn } from 'node:child_process'
import { chromium } from 'playwright-core'
const out = process.argv[2]
const PORT = 4321, base = 'http://localhost:' + PORT
const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', cwd: new URL('..', import.meta.url).pathname })
for (let i = 0; i < 50; i++) { try { await fetch(base); break } catch { await new Promise((r) => setTimeout(r, 200)) } }
const browser = await chromium.launch({ headless: true })
const SIZES = { cover: [368, 812, 'open'], inner: [707, 691, 'open'], laptop: [1440, 900, 'open'], 'laptop-folded': [1440, 900, 'folded'], 'wide-folded': [1920, 1080, 'folded'] }
try {
  for (const [size, [w, h, fold]] of Object.entries(SIZES)) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, timezoneId: 'Europe/Paris' })
    await ctx.addInitScript((f) => { localStorage.setItem('nest.theme', 'cyber'); localStorage.setItem('nest.rail', f) }, fold)
    const page = await ctx.newPage()
    await page.goto(base + '/' + (process.env.QS ?? ''), { waitUntil: 'networkidle' }); await page.waitForSelector('.hero-pl[data-c]', { timeout: 15000 }); await page.waitForTimeout(1200)
    const hero = page.locator('.hero-box'); await hero.scrollIntoViewIfNeeded()
    const b = await hero.boundingBox()
    console.log(size, Math.round(b.width) + 'x' + Math.round(b.height))
    await hero.screenshot({ path: `${out}/${size}.png` })
    await ctx.close()
  }
} finally { await browser.close(); server.kill() }
