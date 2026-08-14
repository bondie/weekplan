import { useDroppable } from '@dnd-kit/core'
import { useQuery } from '@tanstack/react-query'
import { Inbox, Search } from 'lucide-react'
import { useState } from 'react'
import { api } from '../api/client'
import type { Scope } from '../api/types'
import IssueCard from './IssueCard'

const TABS: Array<{ scope: Scope; label: string }> = [
  { scope: 'sprint', label: 'Sprint' },
  { scope: 'future', label: 'Budoucí' },
  { scope: 'backlog', label: 'Backlog' },
  { scope: 'all', label: 'Vše' },
]

export default function BacklogPanel() {
  const [scope, setScope] = useState<Scope>('sprint')
  const [query, setQuery] = useState('')
  const [project, setProject] = useState('')

  const issues = useQuery({
    queryKey: ['issues', scope, query, project],
    queryFn: () => api.issues(scope, query, project),
  })

  const { setNodeRef, isOver } = useDroppable({ id: 'backlog', data: { type: 'backlog' } })

  return (
    <aside
      ref={setNodeRef}
      className={`flex w-90 shrink-0 flex-col rounded-xl border bg-white transition ${
        isOver ? 'border-rose-300 ring-2 ring-rose-100' : 'border-slate-200'
      }`}
    >
      <div className="border-b border-slate-100 p-3">
        <div className="flex items-center gap-2 pb-2">
          <Inbox className="size-4 text-slate-400" />
          <h2 className="text-sm font-semibold text-slate-700">Moje tasky</h2>
          {isOver ? <span className="ml-auto text-xs font-medium text-rose-600">pustit = odplánovat</span> : null}
        </div>

        <div className="flex gap-1 rounded-lg bg-slate-100 p-0.5">
          {TABS.map((tab) => (
            <button
              key={tab.scope}
              onClick={() => setScope(tab.scope)}
              className={`flex-1 rounded-md px-2 py-1 text-xs font-medium transition ${
                scope === tab.scope ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab.label}
              {issues.data ? <span className="ml-1 text-slate-400">{issues.data.counts[tab.scope]}</span> : null}
            </button>
          ))}
        </div>

        <div className="mt-2 flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Hledat…"
              className="w-full rounded-md border border-slate-200 py-1.5 pr-2 pl-7 text-xs outline-none focus:border-indigo-400"
            />
          </div>
          <select
            value={project}
            onChange={(event) => setProject(event.target.value)}
            className="rounded-md border border-slate-200 px-1.5 py-1.5 text-xs text-slate-600 outline-none focus:border-indigo-400"
          >
            <option value="">Vše</option>
            {issues.data?.projects.map((item) => (
              <option key={item.key} value={item.key}>
                {item.key} ({item.count})
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {issues.isLoading ? <p className="text-xs text-slate-400">Načítám…</p> : null}
        {issues.data?.issues.length === 0 ? (
          <p className="py-8 text-center text-xs text-slate-400">Žádné tasky v této skupině</p>
        ) : null}
        {issues.data?.issues.map((issue) => (
          <IssueCard key={issue.key} issue={issue} />
        ))}
      </div>
    </aside>
  )
}
