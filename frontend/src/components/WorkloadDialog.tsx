import { useQuery } from '@tanstack/react-query'
import { ExternalLink, X } from 'lucide-react'
import { api } from '../api/client'
import type { Issue } from '../api/types'
import { formatMinutes } from '../lib/format'
import StatusPill from './StatusPill'

const remaining = (issue: Issue) => issue.remainingEstimateMin ?? issue.originalEstimateMin ?? 0

function IssueRow({ issue }: { issue: Issue }) {
  return (
    <a
      href={issue.url}
      target="_blank"
      rel="noreferrer"
      className="group flex items-baseline gap-2 rounded px-2 py-1.5 hover:bg-slate-50"
    >
      <span className="w-36 shrink-0 font-mono text-xs font-semibold text-indigo-600">{issue.key}</span>
      <span className="min-w-0 flex-1 truncate text-sm text-slate-700">{issue.summary}</span>
      <StatusPill status={issue.status} category={issue.statusCategory} />
      {issue.plannedMinutes > 0 ? (
        <span className="shrink-0 rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] text-indigo-700">
          naplánováno {formatMinutes(issue.plannedMinutes)}
        </span>
      ) : null}
      <span className="w-14 shrink-0 text-right text-sm font-medium text-slate-700 tabular-nums">
        {formatMinutes(remaining(issue))}
      </span>
      <ExternalLink className="size-3.5 shrink-0 text-slate-300 group-hover:text-indigo-600" />
    </a>
  )
}

export default function WorkloadDialog({ onClose }: { onClose: () => void }) {
  const workload = useQuery({ queryKey: ['workload'], queryFn: api.workload })

  const issues = workload.data?.issues ?? []
  const open = issues.filter((issue) => remaining(issue) > 0)
  const settled = issues.filter((issue) => remaining(issue) === 0)
  const inSprint = open.filter((issue) => issue.sprintState === 'ACTIVE' || issue.sprintState === 'FUTURE')
  const inBacklog = open.filter((issue) => issue.sprintId === null)

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 p-8" onClick={onClose}>
      <div
        className="max-h-full w-full max-w-4xl overflow-y-auto rounded-xl bg-white shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-slate-200 px-5 py-3">
          <h2 className="text-base font-semibold">Zbývá odpracovat</h2>
          {workload.data ? (
            <span className="text-sm text-slate-400">
              {formatMinutes(workload.data.remainingMinutes)} · {open.length} tasků
            </span>
          ) : null}
          <button onClick={onClose} className="ml-auto rounded p-1 text-slate-400 hover:bg-slate-100">
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-5 p-5">
          <Section title="Ve sprintu" issues={inSprint} />
          <Section title="Backlog" issues={inBacklog} />

          {settled.length > 0 ? (
            <section>
              <h3 className="mb-1 flex items-baseline gap-2 text-sm font-semibold text-slate-500">
                Bez zbývajícího odhadu
                <span className="text-xs font-normal text-slate-400">
                  {settled.length} — odhad je vyčerpaný, ale task ještě není hotový
                </span>
              </h3>
              <div className="divide-y divide-slate-100 opacity-70">
                {settled.map((issue) => (
                  <IssueRow key={issue.key} issue={issue} />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function Section({ title, issues }: { title: string; issues: Issue[] }) {
  if (issues.length === 0) return null
  const total = issues.reduce((sum, issue) => sum + remaining(issue), 0)

  return (
    <section>
      <h3 className="mb-1 flex items-baseline gap-2 text-sm font-semibold text-slate-700">
        {title}
        <span className="text-xs font-normal text-slate-400">
          {issues.length} · {formatMinutes(total)}
        </span>
      </h3>
      <div className="divide-y divide-slate-100">
        {issues.map((issue) => (
          <IssueRow key={issue.key} issue={issue} />
        ))}
      </div>
    </section>
  )
}
