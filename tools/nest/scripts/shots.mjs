// Headless screenshots of the Nest screens at the three board sizes, both themes.
// Usage: node scripts/shots.mjs <out_dir> [all|work|perso] [--fixtures]
//   scope: sets the saved scope filter (nest.scope) before load.
//   --fixtures: runs vite dev (fixture data, pinned clock) instead of vite preview of dist/.
// Without --fixtures, run `npm run build` first.
// Never opens a visible window: uses chromium-headless-shell from playwright-core.
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright-core'

const args = process.argv.slice(2)
const fixtures = args.includes('--fixtures')
const [out, scope = ''] = args.filter((a) => a !== '--fixtures')
if (!out) { console.error('usage: shots.mjs <out_dir> [all|work|perso] [--fixtures]'); process.exit(2) }
mkdirSync(out, { recursive: true })

const PORT = 4317
const SIZES = { cover: [368, 812], inner: [707, 691], laptop: [1440, 900] }
const SCREENS = {
  home: '/',
  missions: '/missions',
  detail: '/missions/20261109-build-inbox-filters',
  inbox: '/inbox',
  desk: '/desk',
}

const cmd = fixtures ? ['vite', '--port', String(PORT), '--strictPort'] : ['vite', 'preview', '--port', String(PORT), '--strictPort']
// Own process group, so the kill below also stops vite under npx.
const server = spawn('npx', cmd, { stdio: 'ignore', cwd: new URL('..', import.meta.url).pathname, detached: true })
const base = `http://localhost:${PORT}`
for (let i = 0; i < 100; i++) {
  try { await fetch(base); break } catch { await new Promise((r) => setTimeout(r, 200)) }
}

const browser = await chromium.launch({ headless: true })
try {
  for (const theme of ['modern', 'cyber']) {
    for (const [size, [w, h]] of Object.entries(SIZES)) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, timezoneId: 'Europe/Paris' })
      await ctx.addInitScript(([t, s]) => {
        localStorage.setItem('nest.theme', t)
        if (s) localStorage.setItem('nest.scope', s)
      }, [theme, scope])
      const page = await ctx.newPage()
      for (const [name, path] of Object.entries(SCREENS)) {
        await page.goto(base + path, { waitUntil: 'networkidle' })
        await page.evaluate(() => document.fonts.ready)
        if (fixtures && name === 'home') await page.waitForSelector('.hero-pl[data-c]', { timeout: 15000 }).catch(() => {})
        await page.waitForTimeout(fixtures ? 600 : 0)
        const file = `${out}/${name}-${size}-${theme}.png`
        await page.screenshot({ path: file })
        console.log(file)
      }
      await ctx.close()
    }
  }
} finally {
  await browser.close()
  try { process.kill(-server.pid) } catch { server.kill() }
}
