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
    expect(list).toContain('<b>fix timeout</b><span>session · lambda · <span>asks Bash</span></span>')
    expect(list).toContain('session · website · <span>asks AskUserQuestion</span>')
    expect(list).toContain('mission · ')
    expect(list).toContain('Accounting · <span>flagged</span>')
    expect(list).toContain('Legal · <span>important</span>')
  })

  it('adds the why to a waiting run, only when it has one (owner 2026-11-16)', async () => {
    at(707)
    const s = await snapshot()
    const run = (id: string, title: string, why?: string) =>
      ({ id, kind: 'run', project: 'cr-0w', state: 'needs', title, since: '2026-11-09T09:00:00+01:00', why, source: { section: 'dispatch', ref: id } })
    const data = [...(s.sections.work!.data as unknown[]), run('run:r1', 'nightly', 'asks Edit'), run('run:r2', 'backup')]
    const html = render(<Inbox snap={{ ...s, sections: { ...s.sections, work: { ...s.sections.work!, data } } }} refresh={refresh} />)
    expect(html).toContain('<b>nightly</b><span>run · cr-0w · <span>asks Edit</span></span>')
    expect(html).toContain('<b>backup</b><span>run · cr-0w</span>')
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
