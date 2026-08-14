import { useState } from 'react'
import { formatMinutes } from '../lib/format'

/** Accepts "90", "1,5", "1.5h", "1:30" — whatever feels natural while planning. */
export function parseMinutes(input: string): number | null {
  const value = input.trim().toLowerCase().replace(',', '.')
  if (!value) return null

  const clock = value.match(/^(\d+):(\d{1,2})$/)
  if (clock) return Number(clock[1]) * 60 + Number(clock[2])

  const explicitMinutes = value.match(/^(\d+(?:\.\d+)?)\s*m(?:in)?$/)
  if (explicitMinutes) return Math.round(Number(explicitMinutes[1]))

  const hours = value.match(/^(\d+(?:\.\d+)?)\s*h?$/)
  if (!hours) return null

  const number = Number(hours[1])
  // A bare number above 16 is minutes; nobody plans a 20-hour day.
  return value.endsWith('h') || number <= 16 ? Math.round(number * 60) : Math.round(number)
}

export default function MinutesEditor({
  minutes,
  onChange,
  tone = 'indigo',
}: {
  minutes: number
  onChange: (minutes: number) => void
  tone?: 'indigo' | 'slate'
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  const commit = () => {
    const parsed = parseMinutes(draft)
    setEditing(false)
    if (parsed && parsed !== minutes) onChange(Math.min(parsed, 24 * 60))
  }

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit()
          if (event.key === 'Escape') setEditing(false)
        }}
        onPointerDown={(event) => event.stopPropagation()}
        className="w-16 rounded border border-indigo-300 px-1 py-0.5 text-[11px] outline-none"
      />
    )
  }

  return (
    <button
      onPointerDown={(event) => event.stopPropagation()}
      onClick={() => {
        setDraft(String(minutes / 60).replace('.', ','))
        setEditing(true)
      }}
      className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${
        tone === 'indigo'
          ? 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
      }`}
    >
      {formatMinutes(minutes)}
    </button>
  )
}
