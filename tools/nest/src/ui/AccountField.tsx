import type { Account } from '../data/live'

// Allowed accounts only (accountsOf drops never); auto lets crow pick a free one.
export function AccountField({ value, accounts, set }: { value: string; accounts: Account[]; set: (a: string) => void }) {
  return (
    <label>Account<select className="field" value={value} onChange={(e) => set(e.target.value)}>
      <option value="">auto</option>{accounts.map((a) => <option key={a.name} value={a.name}>{a.name} · {a.policy}</option>)}
    </select></label>
  )
}
