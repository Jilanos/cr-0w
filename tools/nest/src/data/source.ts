import type { ButlerApi } from './butler'
import type { ChatTarget, ConversationPage, PageAsk } from './conversation'
import type { Actions } from './live'
import type { Ops, RunReport } from './ops'
import type { AgendaEvent, InboxItem, Mission, SectionBody, SectionName } from './types'

// The only door between screens and data. Fixtures (fixtures.ts) and the core
// API (api.ts) implement it; main.tsx picks one.
export interface DataSource {
  missions(): Promise<Mission[]>
  mission(id: string): Promise<Mission | undefined>
  inbox(): Promise<InboxItem[]>
  agenda(): Promise<AgendaEvent[]>
  // One script section. An unchanged section returns the same object.
  section(name: SectionName): Promise<SectionBody>
  // A page of a session's or a mission's conversation (item_177).
  conversation(target: ChatTarget, page: PageAsk): Promise<ConversationPage>
  // Ops timeline for `day=YYYY-MM-DD` or `week=YYYY-Www` (item_190), and one run's report.
  ops(query: string): Promise<Ops>
  run(id: string): Promise<RunReport | undefined>
  // Live actions (item_170). Callers refetch after each one; nothing is optimistic.
  actions: Actions
  // Reference time for "today" and elapsed clocks. Fixtures pin it, the API uses the wall clock.
  now(): Date
  // Butler chat (item_176). Absent: no rail, no sheet.
  butler?: ButlerApi
  // Refresh period in ms while the page is visible. Absent: load once.
  poll?: number
}
