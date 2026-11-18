import { useEffect, useId, useMemo, useRef } from 'react'
import { useButler } from '../data/useButler'
import type { Snapshot } from '../data/useData'
import { heroLiveOf, heroModel } from '../hero/model'
import { RailHead } from '../hero/RailHead'
import { ButlerChat, railLabel } from './ButlerRail'

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)
const useHero = (snap: Snapshot) => useMemo(() => heroModel(snap.missions, snap.inbox, heroLiveOf(snap.sections), snap.now), [snap])

// Phone and Fold header badge (item_176, board phone-badge-sheet): the mini droid in a frame
// coloured by mood, before the wordmark, with a dot when something failed or asks. Opens the chat.
export function ButlerBadge({ snap }: { snap: Snapshot }) {
  const b = useButler()
  const m = useHero(snap)
  if (!b) return null
  const dot = m.mood === 'fail' || m.mood === 'ask'
  return (
    <button type="button" className={`b-badge m-${m.mood}`} onClick={() => b.setSheet(true)}
      aria-label={`CR-0W, ${railLabel(m)}. Open the chat`} aria-expanded={b.sheet} aria-haspopup="dialog">
      <span className="bb-frame">
        <i className="dia" aria-hidden="true" />
        <RailHead mood={m.mood} working={m.projects.some((p) => p.state === 'working')} asks={m.asks} />
      </span>
      {dot && <i className="bb-dot" aria-hidden="true" />}
    </button>
  )
}

// The chat sheet: head, mood and hero line on top, then the shared conversation and input.
// A bottom sheet on the cover, the side panel from 600px (same frame as the confirm sheet).
export function ButlerSheet({ snap }: { snap: Snapshot }) {
  const b = useButler()
  const m = useHero(snap)
  const id = useId()
  const box = useRef<HTMLDivElement>(null)
  const open = !!b?.sheet
  const close = b?.setSheet

  useEffect(() => {
    if (!open || !close) return
    box.current?.focus()
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') close(false) }
    addEventListener('keydown', key)
    return () => removeEventListener('keydown', key)
  }, [open, close])

  if (!b || !open) return null
  const shut = () => b.setSheet(false)
  return (
    <>
      <div className="scrim" onClick={shut} aria-hidden="true" />
      <div ref={box} tabIndex={-1} className="sheet b-sheet" role="dialog" aria-modal="true" aria-labelledby={id}>
        <div className="grab" aria-hidden="true" />
        <div className="bs-top">
          <span className={`bs-head m-${m.mood}`}>
            <i className="dia" aria-hidden="true" />
            <RailHead mood={m.mood} working={m.projects.some((p) => p.state === 'working')} asks={m.asks} />
          </span>
          <div className="bs-say">
            <span id={id} className={`rl-mood m-${m.mood}`}><i className="dia" aria-hidden="true" />{railLabel(m)}</span>
            <p className="rl-line"><b>cr-0w</b> › {lower(m.line)}<span className="cur" aria-hidden="true">▌</span></p>
          </div>
        </div>
        <ButlerChat snap={snap} close={shut} />
      </div>
    </>
  )
}
