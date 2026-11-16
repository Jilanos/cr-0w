import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { feed, type Snapshot } from '../data/feed'
import { fixtureSource } from '../data/fixtures'
import { DataContext } from '../data/useData'
import { Desk } from './Desk'
import { Inbox } from './Inbox'

const snapshot = async (): Promise<Snapshot> => {
  const box: { s?: Snapshot } = {}
  await feed(fixtureSource(), (x) => { box.s = x })()
  return box.s!
}
// Width of the screen under test: the cover below 600px, the inner layout above.
const at = (w: number) => {
  vi.stubGlobal('window', {
    matchMedia: (q: string) => ({ matches: Number(/min-width:\s*(\d+)/.exec(q)?.[1] ?? 0) <= w, addEventListener() {}, removeEventListener() {} }),
  })
  vi.stubGlobal('location', { search: '', pathname: '/' })
}
const render = (el: React.ReactElement) => renderToStaticMarkup(<DataContext.Provider value={fixtureSource()}>{el}</DataContext.Provider>)
const refresh = async () => {}

afterEach(() => { vi.unstubAllGlobals() })

describe('Inbox to answer (item_204)', () => {
  it('lists questions then mail in the board row, no failed work (owner 2026-11-16)', async () => {
    at(707)
    const html = render(<Inbox snap={await snapshot()} refresh={refresh} />)
    const titles = [...html.matchAll(/class="row irow[^"]*".*?<b>(.*?)<\/b>/g)].map((m) => m[1])
    expect(titles.length).toBeGreaterThan(2)
    expect(titles).not.toContain('night job')
    expect(titles.some((t) => t.startsWith('!230'))).toBe(false)
    expect(titles.slice(-2)).toEqual(['Invoice to check', 'Contract renewal'])
    expect(html).toContain('<span>To answer</span><span class="num">' + titles.length + '</span>')
  })

  it('draws each row on two lines with the kind icon, no pill and no state column (owner 2026-11-16)', async () => {
    at(707)
    const html = render(<Inbox snap={await snapshot()} refresh={refresh} />)
    const list = html.slice(html.indexOf('class="alist"'), html.indexOf('Drafts ready'))
    const rows = list.split('<button').slice(1)
    expect(rows.length).toBeGreaterThan(0)
    for (const r of rows) {
      expect(r).toMatch(/<span class="ic c-n"><svg/)
      expect(r).toMatch(/<span class="t"><b>[^<]+<\/b><span>/)
      expect(r).not.toContain('ktag')
      expect(r).not.toContain('class="ws"')
    }
    expect(list).not.toContain('c-f')
    expect(list).toContain('session · lambda')
    expect(list).toContain('mission · ')
    expect(list).toContain('Accounting · <span>flagged</span>')
    expect(list).toContain('Legal · <span>important</span>')
  })

  it('opens the cover on the first question, never a failed item', async () => {
    at(368)
    const html = render(<Inbox snap={await snapshot()} refresh={refresh} />)
    expect(html).toContain('<h2 class="gh" id="ct">')
    expect(html).not.toContain('night job')
    expect(html).toContain('Also today')
  })
})

describe('Desk without flagged mail (item_204)', () => {
  it('keeps the failed run that left Inbox (owner 2026-11-16)', async () => {
    at(707)
    expect(render(<Desk snap={await snapshot()} refresh={refresh} />)).toContain('night job')
  })

  it('shows no mail group at any width', async () => {
    for (const w of [368, 707, 1440]) {
      at(w)
      const html = render(<Desk snap={await snapshot()} refresh={refresh} />)
      expect(html).not.toContain('Flagged mail')
      expect(html).not.toContain('Invoice to check')
    }
  })
})
