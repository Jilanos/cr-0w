import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { feed, type Snapshot } from '../data/feed'
import { fixtureSource } from '../data/fixtures'
import { Shell } from './Shell'

const snapshot = async (): Promise<Snapshot> => {
  const box: { s?: Snapshot } = {}
  await feed(fixtureSource(), (x) => { box.s = x })()
  return box.s!
}

afterEach(() => { vi.unstubAllGlobals() })

describe('laptop header gauges', () => {
  it('show 5h left, week in the title and red when low, for allowed accounts only, from the usage section', async () => {
    vi.stubGlobal('location', { search: '', pathname: '/' })
    vi.stubGlobal('document', { documentElement: { dataset: {} } })
    const html = renderToStaticMarkup(<Shell active="home" snap={await snapshot()} scope="all" setScope={() => {}}>x</Shell>)
    const accts = /<span class="accts"[^>]*>(.*?)<\/span><span class="chips/.exec(html)?.[1] ?? ''
    expect([...accts.matchAll(/class="acct" title="([^"]+)"/g)].map((m) => m[1])).toEqual([
      'main: 99% of 5 hours, 43% of the week left',
      'work: 98% of 5 hours, 5% of the week left',
    ])
    expect(accts).toContain('<i class="" style="width:99%"></i>')
    expect(accts).toContain('<span class="pc num" aria-label="99% of 5 hours, 43% of the week left">99%</span>')
    expect(accts).toContain('<span class="pc num c-f" aria-label="98% of 5 hours, 5% of the week left">98%</span>')
    expect(accts).not.toContain('locked')
    expect(accts).not.toContain('–')
  })
})
