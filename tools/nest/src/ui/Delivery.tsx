import { useEffect, useState } from 'react'
import { DELIVERY_LABEL, DELIVERY_TIMEOUT, type Delivery, type Pending } from '../data/delivery'

// The status under a message typed into a session: sending…, delivered, not delivered + Retry.
export function DeliveryLine({ state, onRetry }: { state: Delivery; onRetry?: () => void }) {
  return (
    <div className={`dlv${state === 'failed' ? ' f' : ''}`} role="status">
      <span>{DELIVERY_LABEL[state]}</span>
      {state === 'failed' && onRetry && <button type="button" className="bare" onClick={onRetry}>Retry</button>}
    </div>
  )
}

// Wall clock that ticks once when the oldest open send times out, so "not delivered"
// shows without a new transcript read.
export function useDeliveryClock(open: Pending[]): number {
  const [now, setNow] = useState(() => Date.now())
  const due = open.length ? Math.min(...open.map((p) => p.at)) + DELIVERY_TIMEOUT : 0
  useEffect(() => {
    if (!due) return
    const t = setTimeout(() => setNow(Date.now()), Math.max(0, due - Date.now()) + 50)
    return () => clearTimeout(t)
  }, [due])
  return Math.max(now, Date.now())
}
