import { useEffect, useState } from 'react'
import { isScopeMode, type ScopeMode } from './scope'

// The scope filter is remembered per device in localStorage (item_206), like nest.theme.
export const SCOPE_KEY = 'nest.scope'

type Store = Pick<Storage, 'getItem' | 'setItem'>
const local = (): Store | undefined => (typeof localStorage === 'undefined' ? undefined : localStorage)

// The saved mode; all when nothing valid is saved or storage is blocked.
export function readScope(store: Store | undefined = local()): ScopeMode {
  try {
    const v = store?.getItem(SCOPE_KEY)
    return isScopeMode(v) ? v : 'all'
  } catch {
    return 'all'
  }
}

export function saveScope(mode: ScopeMode, store: Store | undefined = local()) {
  try { store?.setItem(SCOPE_KEY, mode) } catch { /* storage blocked: the mode stays per visit */ }
}

export function useScope(): [ScopeMode, (m: ScopeMode) => void] {
  const [scope, setScope] = useState<ScopeMode>(() => readScope())
  useEffect(() => saveScope(scope), [scope])
  return [scope, setScope]
}
