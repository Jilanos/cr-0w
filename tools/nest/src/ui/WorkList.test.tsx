import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { feed, type Snapshot } from '../data/feed'
import { fixtureSource } from '../data/fixtures'
import { deskWork, workOf } from '../data/work'
import { WorkList } from './WorkList'

const snapshot = async (): Promise<Snapshot> => {
  const box: { s?: Snapshot } = {}
  await feed(fixtureSource(), (x) => { box.s = x })()
  return box.s!
}

describe('Desk work list (item_204 option A)', () => {
  it('renders one row per shown item, a kind tag with its icon, and the mission rail', async () => {
    const s = await snapshot()
    const html = renderToStaticMarkup(<WorkList groups={deskWork(workOf(s.sections.work)!)} now={s.now} open={() => {}} />)
    expect(html.match(/class="wrow /g)).toHaveLength(13)
    expect(html.match(/class="ktag"><svg/g)).toHaveLength(13)
    for (const k of ['Session', 'Run', 'Parked', 'MR', 'Mission']) expect(html).toContain(`</svg>${k}</span>`)
    expect(html.match(/class="wrail"/g)).toHaveLength(1)
    expect(html).not.toContain('<b>Docs</b>')
    expect(html).toContain('<b>night job</b>')
    expect(html).toContain('<span class="c-f">red pipeline</span>')
  })

  it('says so when nothing is on the desk', () => {
    expect(renderToStaticMarkup(<WorkList groups={[]} now={new Date()} open={() => {}} />)).toContain('Nothing on the desk')
  })
})
