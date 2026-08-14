import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { Coffee, Plus, X } from 'lucide-react'
import { useState, type KeyboardEvent } from 'react'
import type { Day } from '../api/types'
import { usePlanner } from '../hooks/planner'
import { formatDayLabel, formatMinutes } from '../lib/format'
import AssignmentCard from './AssignmentCard'
import CapacityBar from './CapacityBar'
import EventChip from './EventChip'
import { parseMinutes } from './MinutesEditor'
import WorklogList from './WorklogList'

export default function DayColumn({ day }: { day: Day }) {
  const planner = usePlanner()
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState({ title: '', startTime: '09:00', duration: '1' })

  const { setNodeRef, isOver } = useDroppable({ id: `day:${day.date}`, data: { type: 'day', date: day.date } })
  const { weekday, day: dayLabel } = formatDayLabel(day.date)

  const cancelBlock = () => {
    setDraft({ title: '', startTime: '09:00', duration: '1' })
    setAdding(false)
  }

  const submitBlock = () => {
    const minutes = parseMinutes(draft.duration)
    if (!draft.title.trim() || !minutes) return
    planner.addManualEvent({ date: day.date, title: draft.title.trim(), startTime: draft.startTime, minutes })
    cancelBlock()
  }

  const onFormKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter') submitBlock()
    if (event.key === 'Escape') cancelBlock()
  }

  return (
    <div
      ref={setNodeRef}
      className={`flex min-w-0 flex-1 flex-col rounded-xl border bg-white transition ${
        day.isToday ? 'border-indigo-300 ring-1 ring-indigo-200' : 'border-slate-200'
      } ${isOver ? 'border-indigo-400 bg-indigo-50/40 ring-2 ring-indigo-200' : ''} ${
        !day.isWorkingDay ? 'bg-slate-50' : ''
      }`}
    >
      <div className="border-b border-slate-100 p-2.5">
        <div className="flex items-baseline gap-1.5">
          <span className={`text-sm font-semibold ${day.isToday ? 'text-indigo-600' : 'text-slate-700'}`}>
            {weekday}
          </span>
          <span className="text-xs text-slate-400">{dayLabel}</span>

          {day.holiday ? (
            <span className="ml-auto truncate rounded bg-violet-50 px-1.5 py-0.5 text-[10px] text-violet-700">
              {day.holiday}
            </span>
          ) : day.overbookedMinutes > 0 ? (
            <span className="ml-auto rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-medium text-rose-700">
              +{formatMinutes(day.overbookedMinutes)}
            </span>
          ) : null}
        </div>

        <div className="mt-1.5">
          <CapacityBar day={day} />
        </div>

        <div className="mt-1.5 flex items-center gap-2 text-[11px] text-slate-500">
          <span>
            {formatMinutes(day.plannedMinutes)} / {formatMinutes(day.availableMinutes)}
          </span>
          {day.overheadMinutes > 0 ? (
            <span className="text-amber-600">režie {formatMinutes(day.overheadMinutes)}</span>
          ) : null}
          {day.loggedMinutes > 0 ? (
            <span className="text-emerald-600">vykázáno {formatMinutes(day.loggedMinutes)}</span>
          ) : null}
          <button
            onClick={() => planner.setDayCapacity(day.date, day.override ? null : 0)}
            className="ml-auto text-slate-300 transition hover:text-slate-600"
            title={day.override ? 'Zrušit úpravu kapacity' : 'Volno / dovolená (0 h)'}
          >
            <Coffee className="size-3.5" />
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto p-2">
        {day.events.length > 0 ? (
          <div className="space-y-1">
            {day.events.map((event) => (
              <EventChip key={event.id} event={event} />
            ))}
          </div>
        ) : null}

        <SortableContext
          items={day.assignments.map((assignment) => `assignment:${assignment.id}`)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-1.5">
            {day.assignments.map((assignment) => (
              <AssignmentCard key={assignment.id} assignment={assignment} date={day.date} />
            ))}
          </div>
        </SortableContext>

        <WorklogList worklogs={day.worklogs} />

        {day.assignments.length === 0 && day.events.length === 0 && day.worklogs.length === 0 ? (
          <p className="py-6 text-center text-[11px] text-slate-300">přetáhni sem task</p>
        ) : null}

        {adding ? (
          <div className="space-y-1 rounded-md border border-amber-200 bg-amber-50 p-1.5" onKeyDown={onFormKeyDown}>
            <div className="flex items-center gap-1">
              <input
                autoFocus
                value={draft.title}
                onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                placeholder="Název režie"
                className="w-full rounded border border-amber-200 px-1.5 py-1 text-[11px] outline-none"
              />
              <button
                onClick={cancelBlock}
                title="Zrušit (Esc)"
                className="shrink-0 rounded p-0.5 text-amber-600/60 hover:bg-amber-100 hover:text-amber-800"
              >
                <X className="size-3.5" />
              </button>
            </div>
            <div className="flex gap-1">
              <input
                value={draft.startTime}
                onChange={(event) => setDraft({ ...draft, startTime: event.target.value })}
                className="w-16 rounded border border-amber-200 px-1.5 py-1 text-[11px] outline-none"
              />
              <input
                value={draft.duration}
                onChange={(event) => setDraft({ ...draft, duration: event.target.value })}
                placeholder="1h"
                className="w-14 rounded border border-amber-200 px-1.5 py-1 text-[11px] outline-none"
              />
              <button
                onClick={submitBlock}
                disabled={!draft.title.trim()}
                className="flex-1 rounded bg-amber-500 text-[11px] font-medium text-white disabled:opacity-40"
              >
                Přidat
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="mt-auto flex items-center justify-center gap-1 rounded-md border border-dashed border-slate-200 py-1 text-[11px] text-slate-400 transition hover:border-amber-300 hover:text-amber-600"
          >
            <Plus className="size-3" />
            režie
          </button>
        )}
      </div>
    </div>
  )
}
