import { useDraggable } from '@dnd-kit/core'
import { ExternalLink } from 'lucide-react'
import type { Issue } from '../api/types'
import { formatMinutes } from '../lib/format'

const TYPE_TONE: Record<string, string> = {
  bug: 'bg-rose-50 text-rose-700 ring-rose-200',
  task: 'bg-sky-50 text-sky-700 ring-sky-200',
  estimation: 'bg-violet-50 text-violet-700 ring-violet-200',
}

function typeTone(issueType: string): string {
  const key = issueType.toLowerCase()
  if (key.includes('bug')) return TYPE_TONE.bug
  if (key.includes('estimation')) return TYPE_TONE.estimation
  return TYPE_TONE.task
}

export default function IssueCard({ issue }: { issue: Issue }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `issue:${issue.key}`,
    data: { type: 'issue', issue },
  })

  const estimate = issue.remainingEstimateMin || issue.originalEstimateMin
  const fullyPlanned = estimate != null && issue.plannedMinutes >= estimate
  const spentAll = issue.remainingEstimateMin === 0 && (issue.originalEstimateMin ?? 0) > 0

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`group cursor-grab rounded-lg border border-slate-200 bg-white p-2.5 shadow-xs transition hover:border-indigo-300 hover:shadow-sm ${
        isDragging ? 'opacity-40' : ''
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="font-mono text-[11px] font-semibold text-indigo-600">{issue.key}</span>
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ring-1 ${typeTone(issue.issueType)}`}>
          {issue.issueType}
        </span>
        <a
          href={issue.url}
          target="_blank"
          rel="noreferrer"
          onPointerDown={(event) => event.stopPropagation()}
          className="ml-auto text-slate-300 opacity-0 transition group-hover:opacity-100 hover:text-indigo-600"
        >
          <ExternalLink className="size-3.5" />
        </a>
      </div>

      <p className="clamp-2 mt-1 text-[13px] leading-snug text-slate-700">{issue.summary}</p>

      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-500">{issue.status}</span>
        {estimate ? (
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-500">
            {spentAll ? 'odpracováno' : 'zbývá'} {formatMinutes(estimate)}
          </span>
        ) : (
          <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-700">bez odhadu</span>
        )}
        {issue.plannedMinutes > 0 ? (
          <span
            className={`rounded px-1.5 py-0.5 font-medium ${
              fullyPlanned ? 'bg-emerald-50 text-emerald-700' : 'bg-indigo-50 text-indigo-700'
            }`}
          >
            naplánováno {formatMinutes(issue.plannedMinutes)}
          </span>
        ) : null}
      </div>
    </div>
  )
}
