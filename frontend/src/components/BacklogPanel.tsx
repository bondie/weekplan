import { useDroppable } from '@dnd-kit/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, Eye, Inbox, RotateCcw, Search } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { api } from '../api/client'
import { usePlanner } from '../hooks/planner'
import IssueCard from './IssueCard'

const STATE_LABEL: Record<string, string> = {
  ACTIVE: 'aktivní',
  FUTURE: 'budoucí',
  CLOSED: 'uzavřený',
}

export default function BacklogPanel() {
  const { weekStart } = usePlanner()
  const [selection, setSelection] = useState<string[] | null>(null)
  const [query, setQuery] = useState('')
  const [project, setProject] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [onlyUnplanned, setOnlyUnplanned] = useState(false)
  const [showHidden, setShowHidden] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()

  const issues = useQuery({
    queryKey: ['issues', weekStart, selection, query, project, onlyUnplanned, showHidden],
    queryFn: () => api.issues(weekStart, selection, query, project, { hidden: showHidden, unplanned: onlyUnplanned }),
  })

  const setHidden = useMutation({
    mutationFn: (input: { key: string; hidden: boolean }) =>
      input.hidden ? api.hideIssue(input.key) : api.unhideIssue(input.key),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['issues'] }),
  })

  useEffect(() => {
    if (!pickerOpen) return
    const close = (event: MouseEvent) => {
      if (!pickerRef.current?.contains(event.target as Node)) setPickerOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [pickerOpen])

  const { setNodeRef, isOver } = useDroppable({ id: 'backlog', data: { type: 'backlog' } })

  const applied = issues.data?.selected ?? []
  const toggle = (value: string) => {
    const next = applied.includes(value) ? applied.filter((item) => item !== value) : [...applied, value]
    setSelection(next)
  }

  const sprintLabel = issues.data
    ? applied.length === 0
      ? 'nic nevybráno'
      : applied
          .map((value) =>
            value === 'none'
              ? 'Backlog'
              : (issues.data.sprints.find((sprint) => String(sprint.id) === value)?.name ?? value),
          )
          .join(' + ')
    : '…'

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
          {issues.data ? <span className="text-xs text-slate-400">{issues.data.issues.length}</span> : null}
          {isOver ? <span className="ml-auto text-xs font-medium text-rose-600">pustit = odplánovat</span> : null}
        </div>

        <div ref={pickerRef} className="relative">
          <button
            data-testid="sprint-picker"
            onClick={() => setPickerOpen((open) => !open)}
            className="flex w-full items-center gap-1.5 rounded-md border border-slate-200 px-2 py-1.5 text-left text-xs text-slate-600 hover:border-slate-300"
          >
            <span className="truncate">{sprintLabel}</span>
            <ChevronDown className="ml-auto size-3.5 shrink-0 text-slate-400" />
          </button>

          {pickerOpen ? (
            <div className="absolute z-20 mt-1 w-full rounded-lg border border-slate-200 bg-white p-1.5 shadow-lg">
              <div className="flex items-center justify-between px-1.5 pb-1">
                <span className="text-[10px] font-medium tracking-wide text-slate-400 uppercase">Sprinty</span>
                {selection !== null ? (
                  <button
                    onClick={() => setSelection(null)}
                    className="flex items-center gap-1 text-[11px] text-indigo-600 hover:text-indigo-700"
                    title="Vybírat automaticky podle zobrazeného týdne"
                  >
                    <RotateCcw className="size-3" />
                    auto
                  </button>
                ) : (
                  <span className="text-[11px] text-slate-400">auto podle týdne</span>
                )}
              </div>

              <div className="max-h-72 overflow-y-auto">
                {issues.data?.sprints.map((sprint) => (
                  <label
                    key={sprint.id}
                    className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-xs hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      checked={applied.includes(String(sprint.id))}
                      onChange={() => toggle(String(sprint.id))}
                    />
                    <span className="truncate text-slate-700">{sprint.name}</span>
                    <span
                      className={`shrink-0 rounded px-1 text-[10px] ${
                        sprint.state === 'ACTIVE'
                          ? 'bg-emerald-50 text-emerald-700'
                          : sprint.state === 'FUTURE'
                            ? 'bg-sky-50 text-sky-700'
                            : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {STATE_LABEL[sprint.state] ?? sprint.state}
                    </span>
                    <span className="ml-auto shrink-0 text-slate-400">{sprint.count}</span>
                  </label>
                ))}

                <label className="flex cursor-pointer items-center gap-2 rounded border-t border-slate-100 px-1.5 py-1 text-xs hover:bg-slate-50">
                  <input
                    type="checkbox"
                    data-testid="sprint-option-none"
                    checked={applied.includes('none')}
                    onChange={() => toggle('none')}
                  />
                  <span className="text-slate-700">Backlog</span>
                  <span className="ml-auto text-slate-400">{issues.data?.noSprintCount ?? 0}</span>
                </label>
              </div>
            </div>
          ) : null}
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

        <div className="mt-2 flex items-center gap-3 text-[11px] text-slate-500">
          <label className="flex cursor-pointer items-center gap-1.5">
            <input
              type="checkbox"
              checked={onlyUnplanned}
              onChange={(event) => setOnlyUnplanned(event.target.checked)}
            />
            skrýt naplánované
          </label>

          {issues.data && issues.data.hiddenCount > 0 ? (
            <button
              onClick={() => setShowHidden((value) => !value)}
              className={`ml-auto flex items-center gap-1 ${showHidden ? 'text-indigo-600' : 'hover:text-slate-700'}`}
            >
              <Eye className="size-3" />
              skryté ({issues.data.hiddenCount})
            </button>
          ) : null}
        </div>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {issues.isLoading ? <p className="text-xs text-slate-400">Načítám…</p> : null}
        {issues.data?.issues.length === 0 ? (
          <p className="py-8 text-center text-xs text-slate-400">
            {showHidden ? 'Žádné skryté tasky' : 'Žádné tasky ve vybraných sprintech'}
          </p>
        ) : null}
        {issues.data?.issues.map((issue) => (
          <IssueCard
            key={issue.key}
            issue={issue}
            hidden={showHidden}
            onToggleHidden={() => setHidden.mutate({ key: issue.key, hidden: !showHidden })}
          />
        ))}
      </div>
    </aside>
  )
}
