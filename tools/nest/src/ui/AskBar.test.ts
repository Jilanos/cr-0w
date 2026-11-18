import { describe, expect, it } from 'vitest'
import { askTarget } from './AskBar'

describe('Home Ask bar target (item_176)', () => {
  it('sends free text to CR-0W', () => {
    expect(askTarget('  what is left today? ')).toEqual({ say: 'what is left today?' })
  })
  it('opens the Desk form for /dispatch and /session', () => {
    expect(askTarget('/dispatch nest build')).toEqual({ cmd: '/desk?cmd=%2Fdispatch%20nest%20build' })
    expect(askTarget('/session')).toEqual({ cmd: '/desk?cmd=%2Fsession' })
  })
  it('ignores an empty line', () => {
    expect(askTarget('   ')).toBeNull()
  })
})
