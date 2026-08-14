import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, CalendarDays, ChevronLeft, ChevronRight, RefreshCw, Settings } from 'lucide-react'
import { api } from '../api/client'
import type { Week } from '../api/types'
import { usePlanner } from '../hooks/planner'
import { formatMinutes, formatRange, formatRelative, todayKey } from '../lib/format'

export default function Header({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { week, shiftWeek, goToWeek } = usePlanner()
  const queryClient = useQueryClient()

  const status = useQuery({ queryKey: ['sync'], queryFn: api.syncStatus, refetchInterval: 60_000 })
  const me = useQuery({ queryKey: ['me'], queryFn: api.me })
  const workload = useQuery({ queryKey: ['workload'], queryFn: api.workload })

  const sync = useMutation({
    mutationFn: async () => {
      await api.syncJira()
      await api.syncCalendar()
    },
    onSuccess: () => {
      void queryClient.invalidateQueries()
    },
  })

  const jira = status.data?.jira
  const calendar = status.data?.calendar
  const totals = week?.totals

  return (
    <header className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-slate-200 bg-white px-5 py-3">
      <div className="flex items-center gap-2">
        <CalendarDays className="size-5 text-indigo-600" />
        <span className="text-lg font-semibold tracking-tight">Weekplan</span>
      </div>

      <div className="flex items-center gap-1">
        <button
          onClick={() => shiftWeek(-1)}
          className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          aria-label="Předchozí týden"
        >
          <ChevronLeft className="size-4" />
        </button>
        <button
          onClick={() => goToWeek(todayKey())}
          className="rounded-md px-2.5 py-1 text-sm font-medium text-slate-600 hover:bg-slate-100"
        >
          Dnes
        </button>
        <button
          onClick={() => shiftWeek(1)}
          className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          aria-label="Následující týden"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>

      {week ? (
        <div className="flex items-baseline gap-2">
          <span className="text-base font-semibold">{formatRange(week.weekStart, week.weekEnd)}</span>
          <span className="text-sm text-slate-400">{week.isoWeek}. týden</span>
        </div>
      ) : null}

      {week ? <SprintBadge week={week} /> : null}

      {totals ? (
        <div className="flex items-center gap-4 text-sm">
          <Metric label="kapacita" value={formatMinutes(totals.capacityMinutes)} />
          <Metric label="režie" value={formatMinutes(totals.overheadMinutes)} tone="amber" />
          <Metric label="plán" value={formatMinutes(totals.plannedMinutes)} tone="indigo" />
          <Metric
            label={totals.overbookedMinutes > 0 ? 'přeplánováno' : 'volno'}
            value={formatMinutes(totals.overbookedMinutes > 0 ? totals.overbookedMinutes : totals.freeMinutes)}
            tone={totals.overbookedMinutes > 0 ? 'rose' : 'emerald'}
          />
        </div>
      ) : null}

      {workload.data ? (
        <span
          className="flex items-baseline gap-1 border-l border-slate-200 pl-4 text-sm"
          title={`Ve sprintech ${formatMinutes(workload.data.sprintMinutes)}, v backlogu ${formatMinutes(
            workload.data.backlogMinutes,
          )} · ${workload.data.issueCount} tasků, z toho ${workload.data.withoutEstimateCount} bez odhadu`}
        >
          <span className="font-semibold text-slate-700">{formatMinutes(workload.data.remainingMinutes)}</span>
          <span className="text-xs text-slate-400">zbývá vykázat celkem</span>
        </span>
      ) : null}

      <div className="ml-auto flex items-center gap-3">
        {jira?.authFailed ? (
          <span className="flex items-center gap-1.5 rounded-md bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700 ring-1 ring-rose-200">
            <AlertTriangle className="size-3.5" />
            JIRA odmítla přihlášení
          </span>
        ) : null}

        <div className="text-right text-xs leading-tight text-slate-400">
          <div>JIRA {formatRelative(jira?.at)}</div>
          <div>kalendář {formatRelative(calendar?.at)}</div>
        </div>

        <button
          onClick={() => sync.mutate()}
          disabled={sync.isPending}
          className="flex items-center gap-1.5 rounded-md border border-slate-200 px-2.5 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw className={`size-4 ${sync.isPending ? 'animate-spin' : ''}`} />
          Sync
        </button>

        <button
          onClick={onOpenSettings}
          className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          aria-label="Nastavení"
        >
          <Settings className="size-4" />
        </button>

        <span className="text-sm font-medium text-slate-600">{me.data?.displayName ?? ''}</span>
      </div>
    </header>
  )
}

/** The sprint shown follows the displayed week, not today. */
function SprintBadge({ week }: { week: Week }) {
  if (week.sprintsForWeek.length === 0) {
    return <span className="text-xs text-slate-400">mimo sprint</span>
  }

  const activeIds = new Set(week.activeSprints.map((sprint) => sprint.id))
  const isCurrent = week.sprintsForWeek.some((sprint) => activeIds.has(sprint.id))

  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${
        isCurrent ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-sky-50 text-sky-700 ring-sky-200'
      }`}
    >
      Sprint: {week.sprintsForWeek.map((sprint) => sprint.name).join(', ')}
      {isCurrent ? '' : ' (plánovaný)'}
    </span>
  )
}

const TONES: Record<string, string> = {
  slate: 'text-slate-700',
  amber: 'text-amber-600',
  indigo: 'text-indigo-600',
  emerald: 'text-emerald-600',
  rose: 'text-rose-600',
}

function Metric({ label, value, tone = 'slate' }: { label: string; value: string; tone?: string }) {
  return (
    <span className="flex items-baseline gap-1">
      <span className={`font-semibold ${TONES[tone]}`}>{value}</span>
      <span className="text-xs text-slate-400">{label}</span>
    </span>
  )
}
