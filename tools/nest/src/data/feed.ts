import type { DataSource } from './source'
import { SCRIPT_SECTIONS, type AgendaEvent, type InboxItem, type Mission, type SectionBody, type SectionName } from './types'
import { withLinkedStates, workOf } from './work'

export interface Snapshot {
  missions: Mission[]
  inbox: InboxItem[]
  agenda: AgendaEvent[]
  // Script sections by name, each with its own stale flag.
  sections: Record<SectionName, SectionBody>
  now: Date
  // Last good refresh. down is true while the latest refresh failed; the data
  // then stays as it was at synced (null when nothing ever loaded).
  synced: Date | null
  down: boolean
}

const minute = (d: Date) => Math.floor(d.getTime() / 60000)

const NO_SECTIONS = Object.fromEntries(
  SCRIPT_SECTIONS.map((n) => [n, { data: null, stale: true, error: 'not loaded yet', updated_at: null }]),
) as Record<SectionName, SectionBody>

async function readSections(src: DataSource, prev: Record<SectionName, SectionBody> | undefined) {
  const bodies = await Promise.all(SCRIPT_SECTIONS.map((n) => src.section(n)))
  if (prev && bodies.every((b, i) => prev[SCRIPT_SECTIONS[i]] === b)) return prev
  return Object.fromEntries(SCRIPT_SECTIONS.map((n, i) => [n, bodies[i]])) as Record<SectionName, SectionBody>
}

// A feed refreshes every section of a source and emits a new snapshot only when
// a section body, the link state or the clock minute changed. A call during a
// refresh waits for it and runs once more, so a refetch after an action never
// returns data read before the action.
export function feed(src: DataSource, emit: (s: Snapshot) => void) {
  let snap: Snapshot | null = null
  let lastRaw: Mission[] | null = null
  let ok: Date | null = null
  let running: Promise<void> | null = null
  let again: Promise<void> | null = null
  return function refresh(): Promise<void> {
    if (running) return (again ??= running.then(() => { again = null; return refresh() }))
    return (running = once().finally(() => { running = null }))
  }
  async function once() {
    const now = src.now()
    const same = snap !== null && minute(snap.now) === minute(now)
    try {
      const [raw, inbox, agenda, sections] = await Promise.all([src.missions(), src.inbox(), src.agenda(), readSections(src, snap?.sections)])
      ok = now
      const missions = raw === lastRaw && sections === snap?.sections ? snap!.missions : withLinkedStates(raw, workOf(sections.work))
      lastRaw = raw
      if (same && !snap!.down && snap!.missions === missions && snap!.inbox === inbox && snap!.agenda === agenda && snap!.sections === sections) return
      snap = { missions, inbox, agenda, sections, now, synced: now, down: false }
    } catch {
      if (same && snap!.down) return
      snap = { ...(snap ?? { missions: [], inbox: [], agenda: [], sections: NO_SECTIONS }), now, synced: ok, down: true }
    }
    emit(snap)
  }
}
