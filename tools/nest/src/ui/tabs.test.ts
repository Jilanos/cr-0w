import { describe, expect, it } from 'vitest'
import { match } from '../router'
import { BAR_KEYS, MORE_KEYS, barTab, screenTab } from './tabs'
import { TABS } from './icons'

const bar = (path: string) => barTab(screenTab(match(path)))

describe('phone tab bar B', () => {
  it('highlights the matching tab for the four bar screens', () => {
    expect(bar('/')).toBe('home')
    expect(bar('/desk')).toBe('desk')
    expect(bar('/ops')).toBe('ops')
    expect(bar('/missions')).toBe('ops')
    expect(bar('/inbox')).toBe('inbox')
  })

  it('highlights More while MRs, Agenda or Reports is open', () => {
    expect(bar('/mrs')).toBe('more')
    expect(bar('/agenda')).toBe('more')
    expect(bar('/reports')).toBe('more')
  })

  it('keeps chats under Desk, old mission links under Ops, unknown pages under Home', () => {
    expect(bar('/desk/4242')).toBe('desk')
    expect(bar('/desk/m/20261109-build-inbox-filters')).toBe('desk')
    expect(bar('/missions/20261109-build-inbox-filters')).toBe('ops')
    expect(bar('/nope')).toBe('home')
  })

  it('splits every tab once between the bar and More', () => {
    expect([...BAR_KEYS, ...MORE_KEYS].sort()).toEqual(TABS.map((t) => t.key).sort())
  })
})
