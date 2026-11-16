// Boot reel (item_166): records the scan line boot (?boot=1) on Home from fixtures and writes, per size and
// theme, a WebM, a GIF and 4 keyframe PNGs into <out dir>. Frames come from seeking the boot animations
// (paused, 30 fps), so slow screenshots do not stretch the timing. A separate real-time load measures the
// wall time from the first boot frame to the end (data-boot-ms).
// Usage: node scripts/boot-reel.mjs <out dir>
import { spawn, execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright-core'
const [dir] = process.argv.slice(2)
if (!dir) throw new Error('usage: boot-reel.mjs <out dir>')
const PORT = 4399, FPS = 30, HOLD = 0.8
const root = new URL('..', import.meta.url).pathname
const TMP = join(root, '.tmp', 'boot-reel')
const SIZES = [['cover', 368, 812, 2], ['laptop', 1440, 900, 1]]
const THEMES = ['modern', 'cyber']
const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', cwd: root })
const base = `http://localhost:${PORT}`
for (let i = 0; i < 80; i++) { try { await fetch(base); break } catch { await new Promise((r) => setTimeout(r, 200)) } }
const browser = await chromium.launch({ headless: true, args: ['--use-angle=gl', '--enable-gpu', '--ignore-gpu-blocklist'] })
const timing = []
const frame = (tmp, i) => join(tmp, `f${String(i).padStart(4, '0')}.png`)
try {
  { const p = await browser.newPage(); await p.goto(base + '/', { waitUntil: 'networkidle' }); await p.waitForTimeout(1500); await p.close() }
  mkdirSync(dir, { recursive: true })
  for (const [size, vw, vh, dpr] of SIZES) for (const theme of THEMES) {
    const name = `boot-${size}-${theme}`
    const open = async (hold = false) => {
      const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: dpr })
      await ctx.addInitScript(([t, h]) => { localStorage.setItem('nest.theme', t); if (h) globalThis.__nestBootHold = true }, [theme, hold])
      const page = await ctx.newPage()
      await page.goto(`${base}/?boot=1`)
      return [ctx, page]
    }
    // Real time: wall time of the boot as the browser plays it.
    {
      const [ctx, page] = await open()
      await page.waitForFunction(() => document.documentElement.dataset.bootMs, null, { timeout: 10000 })
      const ms = Number(await page.evaluate(() => document.documentElement.dataset.bootMs))
      timing.push({ size, theme, ms }); await ctx.close()
    }
    // Seeked frames.
    const [ctx, page] = await open(true)
    await page.waitForFunction(() => globalThis.__nestBoot, null, { timeout: 10000 })
    const end = await page.evaluate(() => {
      const b = globalThis.__nestBoot
      for (const a of b.anims) a.pause()
      return Math.max(...b.anims.map((a) => a.effect.getComputedTiming().endTime))
    })
    const tmp = join(TMP, name); rmSync(tmp, { recursive: true, force: true }); mkdirSync(tmp, { recursive: true })
    const n = Math.ceil((end / 1000) * FPS)
    for (let i = 0; i <= n; i++) {
      const t = Math.min(end, (i * 1000) / FPS)
      await page.evaluate((t) => new Promise((r) => {
        for (const a of globalThis.__nestBoot.anims) a.currentTime = t
        requestAnimationFrame(() => requestAnimationFrame(r))
      }), t)
      await page.screenshot({ path: frame(tmp, i), scale: 'device' })
    }
    await page.evaluate(() => { for (const a of globalThis.__nestBoot.anims) a.finish() })
    await page.waitForFunction(() => !document.documentElement.dataset.boot, null, { timeout: 3000 })
    await page.waitForTimeout(150)
    const last = n + 1
    await page.screenshot({ path: frame(tmp, last), scale: 'device' })
    await ctx.close()
    // Hold the settled frame at the end so the loop reads.
    const list = Array.from({ length: last + 1 }, (_, i) => `file '${frame(tmp, i)}'\nduration ${i === last ? HOLD : (1 / FPS).toFixed(5)}`).join('\n') + `\nfile '${frame(tmp, last)}'\n`
    writeFileSync(join(tmp, 'list.txt'), list)
    const inp = ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', join(tmp, 'list.txt')]
    execFileSync('ffmpeg', [...inp, '-vf', `fps=${FPS},scale=trunc(iw/2)*2:trunc(ih/2)*2`, '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '28', '-row-mt', '1', '-pix_fmt', 'yuv420p', '-an', join(dir, `${name}.webm`)])
    const gw = size === 'cover' ? 368 : 960
    execFileSync('ffmpeg', [...inp, '-vf', `fps=20,scale=${gw}:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4`, '-loop', '0', join(dir, `${name}.gif`)])
    // Keyframes at 20, 45, 70 % of the boot and the settled frame.
    ;[0.2, 0.45, 0.7].forEach((f, k) => execFileSync('cp', [frame(tmp, Math.round(n * f)), join(dir, `${name}-k${k + 1}.png`)]))
    execFileSync('cp', [frame(tmp, last), join(dir, `${name}-k4.png`)])
    rmSync(tmp, { recursive: true, force: true })
    console.log('wrote', name, `boot ${Math.round(end)} ms planned`)
  }
  writeFileSync(join(dir, 'timing.json'), JSON.stringify(timing, null, 1) + '\n')
  for (const t of timing) console.log(t.size, t.theme, `${t.ms} ms wall`)
} finally { await browser.close(); server.kill(); rmSync(TMP, { recursive: true, force: true }) }
