import type { KeyboardEvent } from 'react'

// Send boxes: Enter sends, Shift+Enter (or Alt+Enter) adds a line, an IME composition is left alone.
export function submitsOnEnter(e: { key: string; shiftKey: boolean; altKey: boolean; isComposing: boolean }): boolean {
  return e.key === 'Enter' && !e.shiftKey && !e.altKey && !e.isComposing
}

// Rows of a send box: one per line, capped so the chat keeps its room.
export function rowsOf(text: string, max = 6): number {
  return Math.min(max, text.split('\n').length)
}

// onKeyDown of a send box textarea: Enter submits its form.
export function enterSubmits(e: KeyboardEvent<HTMLTextAreaElement>) {
  if (!submitsOnEnter({ key: e.key, shiftKey: e.shiftKey, altKey: e.altKey, isComposing: e.nativeEvent.isComposing })) return
  e.preventDefault()
  e.currentTarget.form?.requestSubmit()
}
