import { describe, expect, it } from 'vitest'
import type { Prompt } from '../data/live'
import { promptView } from './prompt'

const base: Prompt = { id: 'p1', tool: 'Bash', detail: 'ls', options: [{ key: 'allow', label: 'Allow once' }, { key: 'deny', label: 'Deny' }] }
const ask: Prompt = {
  id: 'p2', tool: 'AskUserQuestion', detail: '', options: [{ key: 'deny', label: 'Cancel' }],
  questions: [{ header: 'Pick', question: 'Which one?', multiSelect: false, options: [{ label: 'A' }, { label: 'B' }] }],
}

describe('promptView', () => {
  it('shows the question dock for an AskUserQuestion, not its lone Cancel option', () => {
    expect(promptView(ask)).toBe('questions')
  })

  it('shows the option buttons for a permission prompt', () => {
    expect(promptView(base)).toBe('options')
    expect(promptView({ ...base, questions: [] })).toBe('options')
    expect(promptView({ ...base, questions: null })).toBe('options')
  })

  it('sends a work push or MR to approvals', () => {
    expect(promptView({ ...base, work_approval: 'lambda' })).toBe('approval')
  })
})
