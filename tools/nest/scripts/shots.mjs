// Headless screenshots of the Nest screens at the three board sizes, both themes.
// Usage: node scripts/shots.mjs <out_dir> [all|work|perso] [--fixtures] [--tabs] [--only=inbox,desk]
//   scope: sets the saved scope filter (nest.scope) before load.
//   --fixtures: runs vite dev (fixture data, pinned clock) instead of vite preview of dist/.
//   --tabs: phone sizes only, the More sheet states and checks (see moreSheet below).
//   --only: comma list of SCREENS keys; default all of them.
// Without --fixtures, run `npm run build` first.
// Never opens a visible window: uses chromium-headless-shell from playwright-core.
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright-core'

const USAGE = 'usage: shots.mjs <out_dir> [all|work|perso] [--fixtures] [--tabs] [--only=inbox,desk]'
const args = process.argv.slice(2)
const fixtures = args.includes('--fixtures')
const tabs = args.includes('--tabs')
const only = args.find((a) => a.startsWith('--only='))?.slice(7).split(',').filter(Boolean)
const [out, scope = ''] = args.filter((a) => a !== '--fixtures' && a !== '--tabs' && !a.startsWith('--only='))
if (!out || out.startsWith('-') || !['', 'all', 'work', 'perso'].includes(scope)) {
  console.error(USAGE)
  process.exit(2)
}
mkdirSync(out, { recursive: true })

const PORT = 4317
const SIZES = tabs ? { cover: [368, 812], inner: [707, 691] } : { cover: [368, 812], inner: [707, 691], laptop: [1440, 900] }
const SCREENS = {
  home: '/',
  missions: '/missions',
  detail: '/missions/20261109-build-inbox-filters',
  inbox: '/inbox',
  desk: '/desk',
}
const unknown = (only ?? []).filter((n) => !(n in SCREENS))
if (unknown.length || (only && !only.length)) {
  console.error(`${USAGE}\nscreens: ${Object.keys(SCREENS).join(', ')}`)
  process.exit(2)
}
const shoot = Object.entries(SCREENS).filter(([n]) => !only || only.includes(n))

const cmd = fixtures ? ['vite', '--port', String(PORT), '--strictPort'] : ['vite', 'preview', '--port', String(PORT), '--strictPort']
// Own process group, so the kill below also stops vite under npx.
const server = spawn('npx', cmd, { stdio: 'ignore', cwd: new URL('..', import.meta.url).pathname, detached: true })
const base = `http://localhost:${PORT}`
for (let i = 0; i < 100; i++) {
  try { await fetch(base); break } catch { await new Promise((r) => setTimeout(r, 200)) }
}

// --tabs: phone tab bar B (item_206). Missions, then Reports picked through More, each with
// the sheet closed and open. Checks pick, outside tap, Escape and focus; exits 1 on a failure.
const failed = []
async function moreSheet(page, tag, w) {
  const check = (name, pass) => { console.log(`${pass ? 'PASS' : 'FAIL'} ${tag} ${name}`); if (!pass) failed.push(`${tag} ${name}`) }
  const shot = async (n) => {
    await page.mouse.move(1, 1)
    await page.waitForTimeout(fixtures ? 600 : 100)
    const file = `${out}/${n}-${tag}.png`
    await page.screenshot({ path: file })
    console.log(file)
  }
  const more = page.locator('.tabbar button.tab')
  const sheet = page.locator('.more-sheet')
  const focused = () => page.evaluate(() => document.activeElement?.textContent)
  await page.goto(base + '/missions', { waitUntil: 'networkidle' })
  await page.evaluate(() => document.fonts.ready)
  await shot('missions')
  check('five tabs', (await page.locator('.tabbar > .tab').count()) === 5)
  check('Missions highlighted', (await page.locator('.tabbar [aria-current="page"]').innerText()).trim() === 'Missions')
  check('labels 11px', (await more.evaluate((e) => getComputedStyle(e).fontSize)) === '11px')
  await more.click()
  check('More expanded', (await more.getAttribute('aria-expanded')) === 'true')
  check('focus on first item', (await focused()) === 'MRs')
  await page.evaluate(() => document.activeElement?.blur())
  await shot('missions-more')
  await page.mouse.click(w / 2, 200)
  check('outside tap closes', (await sheet.count()) === 0)
  await more.click()
  await page.keyboard.press('Escape')
  check('Escape closes', (await sheet.count()) === 0)
  check('Escape refocuses More', await more.evaluate((e) => e === document.activeElement))
  await more.click()
  await page.getByRole('link', { name: 'Reports' }).click()
  check('pick closes', (await sheet.count()) === 0)
  check('pick opens Reports', new URL(page.url()).pathname === '/reports')
  check('More highlighted on Reports', (await more.getAttribute('aria-current')) === 'page')
  check('More name', (await more.evaluate((e) => e.textContent)) === 'More, Reports open')
  await page.evaluate(() => document.activeElement?.blur())
  await shot('reports')
  await more.click()
  check('focus on the open screen', (await focused()) === 'Reports')
  await page.evaluate(() => document.activeElement?.blur())
  for (const [name, ratio] of await contrast(page, ['.tabbar > .tab:not([aria-current])', '.tabbar > [aria-current="page"]', '.more-item:not([aria-current])', '.more-item[aria-current="page"]'])) {
    check(`contrast ${name} ${ratio.toFixed(1)}:1`, ratio >= 4.5)
  }
  await shot('reports-more')
}

// WCAG contrast of each selector's text against its blended background.
function contrast(page, selectors) {
  return page.evaluate((sels) => {
    const rgba = (s) => { const v = s.match(/[\d.]+/g).map(Number); return [v[0], v[1], v[2], v[3] ?? 1] }
    const over = (top, bot) => [0, 1, 2].map((i) => top[i] * top[3] + bot[i] * (1 - top[3])).concat(1)
    const bg = (el) => {
      const stack = []
      for (let e = el; e; e = e.parentElement) {
        const c = rgba(getComputedStyle(e).backgroundColor)
        if (c[3] > 0) stack.push(c)
        if (c[3] === 1) break
      }
      return stack.reverse().reduce((acc, c) => over(c, acc), [0, 0, 0, 1])
    }
    const lum = (c) => { const [r, g, b] = c.slice(0, 3).map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4 }); return 0.2126 * r + 0.7152 * g + 0.0722 * b }
    return sels.flatMap((s) => [...document.querySelectorAll(s)].slice(0, 1).map((el) => {
      const b = bg(el)
      const f = over(rgba(getComputedStyle(el).color), b)
      const [hi, lo] = [lum(f), lum(b)].sort((x, y) => y - x)
      return [s, (hi + 0.05) / (lo + 0.05)]
    }))
  }, selectors)
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
      if (tabs) {
        await moreSheet(page, `${size}-${theme}`, w)
        await ctx.close()
        continue
      }
      for (const [name, path] of shoot) {
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
if (failed.length) { console.error(`${failed.length} check(s) failed`); process.exit(1) }
