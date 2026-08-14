import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Check, ExternalLink, Scissors, X } from 'lucide-react'
import type { PointerEvent } from 'react'
import type { Assignment } from '../api/types'
import { usePlanner } from '../hooks/planner'
import { addDays, formatMinutes } from '../lib/format'
import MinutesEditor from './MinutesEditor'
import StatusPill from './StatusPill'

export default function AssignmentCard({ assignment, date }: { assignment: Assignment; date: string }) {
  const planner = usePlanner()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `assignment:${assignment.id}`,
    data: { type: 'assignment', date, issue: assignment.issue, label: assignment.issueKey },
  })

  const issue = assignment.issue
  const estimate = issue ? issue.remainingEstimateMin || issue.originalEstimateMin : null
  const reassigned = issue?.assigneeUsername != null && issue.isOrphaned
  const stopDrag = (event: PointerEvent<HTMLElement>) => event.stopPropagation()

  return (
    <div
      ref={setNodeRef}
      data-testid={`assignment-${assignment.issueKey}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...listeners}
      {...attributes}
      className={`group cursor-grab rounded-lg border bg-white p-2 shadow-xs transition ${
        assignment.done ? 'border-emerald-200 bg-emerald-50/50' : 'border-slate-200 hover:border-indigo-300'
      } ${isDragging ? 'opacity-40' : ''}`}
    >
      <div className="flex items-center gap-1.5">
        <span
          className={`font-mono text-[11px] font-semibold ${assignment.done ? 'text-emerald-700 line-through' : 'text-indigo-600'}`}
        >
          {assignment.issueKey}
        </span>

        {issue?.isResolved ? (
          <span className="rounded bg-emerald-50 px-1 py-0.5 text-[10px] text-emerald-700">hotovo v JIRA</span>
        ) : null}
        {reassigned ? (
          <span className="rounded bg-amber-50 px-1 py-0.5 text-[10px] text-amber-700">už není moje</span>
        ) : null}

        <div className="ml-auto flex items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
          {issue ? (
            <a
              href={issue.url}
              target="_blank"
              rel="noreferrer"
              onPointerDown={stopDrag}
              className="rounded p-0.5 text-slate-300 hover:text-indigo-600"
              title="Otevřít v JIRA"
            >
              <ExternalLink className="size-3.5" />
            </a>
          ) : null}
          <button
            onPointerDown={stopDrag}
            onClick={() =>
              planner.split(
                assignment.id,
                addDays(date, 1),
                Math.max(15, Math.round(assignment.plannedMinutes / 2 / 15) * 15),
              )
            }
            className="rounded p-0.5 text-slate-300 hover:text-indigo-600"
            title="Rozdělit půlku na další den"
          >
            <Scissors className="size-3.5" />
          </button>
          <button
            onPointerDown={stopDrag}
            onClick={() => planner.toggleDone(assignment.id, !assignment.done)}
            className={`rounded p-0.5 ${assignment.done ? 'text-emerald-600' : 'text-slate-300 hover:text-emerald-600'}`}
            title="Hotovo"
          >
            <Check className="size-3.5" />
          </button>
          <button
            onPointerDown={stopDrag}
            onClick={() => planner.remove(assignment.id)}
            className="rounded p-0.5 text-slate-300 hover:text-rose-600"
            title="Odplánovat"
          >
            <X className="size-3.5" />
          </button>
        </div>
      </div>

      <p className={`clamp-2 mt-1 text-[13px] leading-snug ${assignment.done ? 'text-slate-400' : 'text-slate-700'}`}>
        {issue?.summary ?? '(task není v cache)'}
      </p>

      <div className="mt-1.5 flex items-center gap-1.5">
        <MinutesEditor
          minutes={assignment.plannedMinutes}
          onChange={(minutes) => planner.setMinutes(assignment.id, minutes)}
        />
        {estimate ? <span className="text-[11px] text-slate-400">z {formatMinutes(estimate)}</span> : null}
        {issue ? (
          <span className="ml-auto">
            <StatusPill status={issue.status} category={issue.statusCategory} />
          </span>
        ) : null}
      </div>
    </div>
  )
}
