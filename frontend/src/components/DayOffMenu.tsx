import { Coffee } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { Day } from '../api/types'
import { usePlanner } from '../hooks/planner'

const PRESETS = [
  { label: 'Dovolená', minutes: 0 },
  { label: 'Svátek / volno', minutes: 0 },
  { label: 'Půlden', minutes: 240 },
]

export default function DayOffMenu({ day }: { day: Day }) {
  const planner = usePlanner()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const apply = (label: string, minutes: number) => {
    planner.setDayCapacity(day.date, minutes, label)
    setOpen(false)
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((value) => !value)}
        data-testid="day-off-menu"
        className={`transition ${day.override ? 'text-amber-600' : 'text-slate-300 hover:text-slate-600'}`}
        title="Upravit kapacitu dne"
      >
        <Coffee className="size-3.5" />
      </button>

      {open ? (
        <div className="absolute right-0 z-30 mt-1 w-36 rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
          {PRESETS.map((preset) => (
            <button
              key={preset.label}
              onClick={() => apply(preset.label, preset.minutes)}
              className="block w-full rounded px-2 py-1 text-left text-[11px] text-slate-600 hover:bg-slate-50"
            >
              {preset.label}
            </button>
          ))}
          {day.override ? (
            <button
              onClick={() => {
                planner.setDayCapacity(day.date, null)
                setOpen(false)
              }}
              className="mt-0.5 block w-full rounded border-t border-slate-100 px-2 py-1 text-left text-[11px] text-indigo-600 hover:bg-slate-50"
            >
              Plná kapacita
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
