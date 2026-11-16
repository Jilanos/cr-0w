// @ts-expect-error node types are not installed; vitest runs on node
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Question } from '../data/live'
import { AskDock } from './AskDock'

const long = 'A long description that wraps over several lines on a phone. '.repeat(4)
const questions: Question[] = Array.from({ length: 4 }, (_, i) => ({
  header: `Q${i + 1}`, question: `Question ${i + 1}?`, multiSelect: i === 3,
  options: Array.from({ length: 4 }, (_, k) => ({ label: `Option ${k + 1}`, description: long })),
}))
const html = renderToStaticMarkup(<AskDock who="Session" questions={questions} busy={false} onSend={() => {}} onCancel={() => {}} />)
// vitest stubs CSS imports, so the stylesheet is read from disk.
const css: string = readFileSync(new URL('../theme.css', import.meta.url), 'utf8')
const rule = (sel: string) => css.split('\n').find((l) => l.startsWith(sel + ' {')) ?? ''

describe('AskDock scroll', () => {
  it('puts steps, options and Other in one scroll body and keeps the buttons outside it', () => {
    const body = html.indexOf('<div class="ab">')
    const buttons = html.indexOf('<div class="gb">')
    expect(body).toBeGreaterThan(-1)
    expect(html.indexOf('class="oc')).toBeGreaterThan(body)
    expect(html.indexOf('class="oth"')).toBeGreaterThan(body)
    expect(buttons).toBeGreaterThan(html.indexOf('class="oth"'))
    expect(html.slice(body, buttons).endsWith('</div>')).toBe(true)
  })

  it('caps the dock to the viewport and scrolls its body on every layout', () => {
    expect(rule(':is(.chat-cv, .desk-cv) .ask-q')).toMatch(/max-height: *\d+dvh/)
    expect(rule(':is(.chat-cv, .desk-cv) .ask-q')).toMatch(/min-height: *0/)
    expect(rule(':is(.chat-cv, .desk-cv) .ask-q .ab')).toMatch(/overflow-y: *auto/)
    expect(rule(':is(.chat-cv, .desk-cv) .ask-q .ab')).toMatch(/min-height: *0/)
  })
})
