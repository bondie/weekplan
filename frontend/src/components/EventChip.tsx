import { CalendarOff, Eye, EyeOff, Trash2 } from 'lucide-react'
import type { CalendarEventItem } from '../api/types'
import { usePlanner } from '../hooks/planner'
import { formatMinutes, formatTime } from '../lib/format'

export default function EventChip({ event }: { event: CalendarEventItem }) {
  const planner = usePlanner()

  return (
    <div
      className={`group flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] ${
        event.countsToCapacity ? 'bg-amber-50 text-amber-900' : 'bg-slate-50 text-slate-400 line-through'
      }`}
    >
      {event.allDay ? (
        <CalendarOff className="size-3 shrink-0" />
      ) : (
        <span className="shrink-0 font-mono text-[10px] opacity-70">{formatTime(event.startsAt)}</span>
      )}

      <span className="truncate">{event.title}</span>

      {!event.allDay ? <span className="ml-auto shrink-0 opacity-60">{formatMinutes(event.minutes)}</span> : null}

      <button
        onClick={() => planner.setEventCounts(event.id, !event.countsToCapacity)}
        className="shrink-0 opacity-0 transition group-hover:opacity-100"
        title={event.countsToCapacity ? 'Nepočítat do režie' : 'Počítat do režie'}
      >
        {event.countsToCapacity ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
      </button>

      {event.manual ? (
        <button
          onClick={() => planner.deleteEvent(event.id)}
          className="shrink-0 opacity-0 transition group-hover:opacity-100 hover:text-rose-600"
          title="Smazat blok"
        >
          <Trash2 className="size-3" />
        </button>
      ) : null}
    </div>
  )
}
