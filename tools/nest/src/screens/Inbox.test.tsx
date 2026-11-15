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
  it('lists failed work first, then questions, then mail, in row A with kind tags', async () => {
    at(707)
    const html = render(<Inbox snap={await snapshot()} refresh={refresh} />)
    const titles = [...html.matchAll(/class="wrow [^"]*".*?<b>(.*?)<\/b>/g)].map((m) => m[1])
    expect(titles[0]).toBe('night job')
    expect(titles.slice(-2)).toEqual(['Invoice to check', 'Contract renewal'])
    expect(html).toContain('</svg>Mail</span>')
    expect(html).toContain('</svg>Mission</span>')
    expect(html).toContain('<span>To answer</span><span class="num">' + titles.length + '</span>')
  })

  it('opens the cover on the first failed item', async () => {
    at(368)
    const html = render(<Inbox snap={await snapshot()} refresh={refresh} />)
    expect(html).toMatch(/<h2 class="gh" id="ct">night job<\/h2>/)
    expect(html).toContain('Also today')
  })
})

describe('Desk without flagged mail (item_204)', () => {
  it('shows no mail group at any width', async () => {
    for (const w of [368, 707, 1440]) {
      at(w)
      const html = render(<Desk snap={await snapshot()} refresh={refresh} />)
      expect(html).not.toContain('Flagged mail')
      expect(html).not.toContain('Invoice to check')
    }
  })
})
