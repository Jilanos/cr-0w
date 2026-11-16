import type { Prompt } from '../data/live'

// How a waiting session's prompt renders: the question dock, approvals only, or option buttons.
export function promptView(p: Prompt): 'questions' | 'approval' | 'options' {
  if (p.questions?.length) return 'questions'
  return p.work_approval ? 'approval' : 'options'
}
