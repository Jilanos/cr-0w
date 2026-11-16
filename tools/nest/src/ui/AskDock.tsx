import { useState } from 'react'
import type { AskAnswer, Question } from '../data/live'

// The docked AskUserQuestion of a session (item_193, board A): one question per step,
// option cards with descriptions, a tap on a single-select card answers and moves on,
// multiSelect cards toggle then Next, Other as a field. The last step sends every answer.

const REC = /\s*\(recommended\)\s*$/i

export function AskDock({ who, questions, busy, onSend, onCancel }: {
  who: string
  questions: Question[]
  busy: boolean
  onSend: (answers: AskAnswer[]) => void
  onCancel: () => void
}) {
  const n = questions.length
  const [step, setStep] = useState(0)
  const [picks, setPicks] = useState<number[][]>(() => questions.map(() => []))
  const [others, setOthers] = useState<string[]>(() => questions.map(() => ''))
  const q = questions[step]
  const other = others[step].trim()
  const ready = (i: number) => picks[i].length > 0 || others[i].trim() !== ''

  const answers = (p: number[][], o: string[]): AskAnswer[] => questions.map((x, i) => {
    const t = o[i].trim()
    if (!t) return p[i]
    return x.multiSelect && p[i].length ? { other: t, options: p[i] } : { other: t }
  })
  const next = (p: number[][], o: string[]) => {
    if (step < n - 1) setStep(step + 1)
    else onSend(answers(p, o))
  }
  const tap = (i: number) => {
    if (busy) return
    const p = picks.map((x, k) => (k !== step ? x : q.multiSelect ? (x.includes(i) ? x.filter((y) => y !== i) : [...x, i].sort()) : [i]))
    setPicks(p)
    if (q.multiSelect) return
    const o = others.map((x, k) => (k === step ? '' : x))
    setOthers(o)
    next(p, o)
  }
  const type = (t: string) => {
    setOthers(others.map((x, k) => (k === step ? t : x)))
    if (!q.multiSelect && t.trim()) setPicks(picks.map((x, k) => (k === step ? [] : x)))
  }
  const summary = (i: number) => {
    const t = others[i].trim()
    const labels = picks[i].map((k) => questions[i].options[k].label.replace(REC, ''))
    return [...labels, ...(t ? [t] : [])].join(', ')
  }
  const count = picks[step].length + (other ? 1 : 0)
  const showNext = q.multiSelect || !!other

  return (
    <div className="ask ask-q" role="group" aria-label={`Question asked by ${who}`}>
      <div className="who"><span className="c-n">◆ {who} waits on you</span></div>
      {/* Scroll body: a long ask scrolls here while Back, Cancel and Send stay in view; a new step starts at its top. */}
      <div className="ab" key={step}>
        {n > 1 && (
          <div className="stp">
            {questions.map((x, i) => (
              <button type="button" key={i} className={i === step ? 'on' : i < step && ready(i) ? 'dn' : ''} disabled={busy || i > step}
                onClick={() => setStep(i)} title={x.question}>
                {i < step && ready(i) ? `✓ ${summary(i)}` : `${i + 1} ${x.header}`}
              </button>
            ))}
          </div>
        )}
        <div className="q">{q.question}{q.multiSelect && <span className="sm"> · several</span>}</div>
        {q.options.map((o, i) => {
          const sel = picks[step].includes(i)
          const rec = REC.test(o.label)
          return (
            <button type="button" key={i} className={`oc${sel ? ' sel' : ''}`} aria-pressed={sel} disabled={busy} onClick={() => tap(i)}>
              <span className="k">{sel && q.multiSelect ? '✓' : i + 1}</span>
              <span>
                <b>{o.label.replace(REC, '')}</b>{rec && <span className="rec">Recommended</span>}
                {o.description && <span className="d">{o.description}</span>}
              </span>
            </button>
          )
        })}
        <form className="oth" onSubmit={(e) => { e.preventDefault(); if (other && !busy) next(picks, others) }}>
          <span aria-hidden="true">✎</span>
          <input className="f1" value={others[step]} onChange={(e) => type(e.target.value)} disabled={busy}
            placeholder="Other answer…" aria-label={`Other answer to ${q.header}`} />
        </form>
      </div>
      <div className="gb">
        {step > 0 && <button type="button" className="btn" disabled={busy} onClick={() => setStep(step - 1)}>Back</button>}
        <button type="button" className="btn" disabled={busy} onClick={onCancel}>Cancel</button>
        {showNext && (
          <button type="button" className="btn p" disabled={busy || !count} onClick={() => next(picks, others)}>
            {step < n - 1 ? 'Next' : 'Send'}{count ? ` · ${count}` : ''}
          </button>
        )}
      </div>
    </div>
  )
}
