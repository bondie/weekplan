import type { Day } from '../api/types'

export default function CapacityBar({ day }: { day: Day }) {
  const total = Math.max(day.capacityMinutes, day.overheadMinutes + day.plannedMinutes, 1)
  const width = (minutes: number) => `${(minutes / total) * 100}%`

  return (
    <div className="flex h-1.5 overflow-hidden rounded-full bg-slate-200">
      <div className="bg-amber-400" style={{ width: width(day.overheadMinutes) }} />
      <div
        className={day.overbookedMinutes > 0 ? 'bg-rose-500' : 'bg-indigo-500'}
        style={{ width: width(day.plannedMinutes) }}
      />
    </div>
  )
}
