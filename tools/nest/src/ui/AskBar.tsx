import { useState } from 'react'
import { isCommand } from '../data/butler'
import { useButler } from '../data/useButler'
import { navigate } from '../router'

// Where a line typed in the Home Ask bar goes: /dispatch and /session open the Desk form,
// anything else is a message to CR-0W (the chat sheet opens on it).
export function askTarget(text: string): { cmd: string } | { say: string } | null {
  const t = text.trim()
  if (!t) return null
  return isCommand(t) ? { cmd: `/desk?cmd=${encodeURIComponent(t)}` } : { say: t }
}

// Home Ask bar (item_176, boards home-F-cover and home-G-inner): under the holotable on the
// phone and Fold Home. Same look as the Desk Ask box; sends to the butler.
export function AskBar() {
  const b = useButler()
  const [text, setText] = useState('')
  const send = () => {
    const to = askTarget(text)
    if (!to) return
    setText('')
    if ('cmd' in to) return navigate(to.cmd)
    void b?.say(to.say, 'phone')
  }
  return (
    <form className="home-ask" onSubmit={(e) => { e.preventDefault(); send() }}>
      <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask CR-0W: run, queue…" aria-label="Ask CR-0W" />
      <button type="button" className="mic" disabled title="Voice arrives later" aria-label="Voice">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
        </svg>
      </button>
      <button type="submit" className="btn p">Send</button>
    </form>
  )
}
