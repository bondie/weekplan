import { useState } from 'react'
import type { WorklogItem } from '../api/types'
import { formatMinutes } from '../lib/format'

const VISIBLE_GROUPS = 6

interface Group {
  issueKey: string
  issueSummary: string
  minutes: number
  entries: WorklogItem[]
}

function groupByIssue(worklogs: WorklogItem[]): Group[] {
  const groups = new Map<string, Group>()

  for (const worklog of worklogs) {
    const group = groups.get(worklog.issueKey)
    if (!group) {
      groups.set(worklog.issueKey, {
        issueKey: worklog.issueKey,
        issueSummary: worklog.issueSummary,
        minutes: worklog.minutes,
        entries: [worklog],
      })
      continue
    }
    group.minutes += worklog.minutes
    group.entries.push(worklog)
  }

  // Biggest chunk first: it says where the day actually went.
  return [...groups.values()].sort((a, b) => b.minutes - a.minutes)
}

function label(entry: WorklogItem): string {
  return entry.comment ?? entry.role ?? entry.issueSummary
}

export default function WorklogList({ worklogs }: { worklogs: WorklogItem[] }) {
  const [expanded, setExpanded] = useState(false)
  if (worklogs.length === 0) return null

  const groups = groupByIssue(worklogs)
  const shown = expanded ? groups : groups.slice(0, VISIBLE_GROUPS)
  const hiddenCount = groups.length - shown.length

  return (
    <div className="mt-1 border-t border-slate-200 pt-1.5">
      <div className="flex items-baseline justify-between px-0.5 pb-1">
        <span className="text-[10px] font-medium tracking-wide text-slate-400 uppercase">Vykázáno</span>
        <span className="text-[10px] text-slate-400">
          {groups.length} {groups.length === 1 ? 'task' : groups.length < 5 ? 'tasky' : 'tasků'}
        </span>
      </div>

      <ul className="space-y-1">
        {shown.map((group) => (
          <li key={group.issueKey}>
            <div className="flex items-baseline gap-1.5" title={group.issueSummary}>
              <span className="font-mono text-[10px] font-semibold text-slate-500">{group.issueKey}</span>
              {group.entries.length === 1 ? (
                <span className="truncate text-[11px] text-slate-500">{label(group.entries[0])}</span>
              ) : null}
              <span className="ml-auto shrink-0 text-[11px] font-medium text-emerald-700 tabular-nums">
                {formatMinutes(group.minutes)}
              </span>
            </div>

            {group.entries.length > 1 ? (
              <ul className="mt-0.5 space-y-0.5 border-l border-slate-200 pl-1.5">
                {group.entries.map((entry) => (
                  <li key={entry.id} className="flex items-baseline gap-1.5">
                    <span className="truncate text-[10px] text-slate-400">{label(entry)}</span>
                    <span className="ml-auto shrink-0 text-[10px] text-slate-400 tabular-nums">
                      {formatMinutes(entry.minutes)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>

      {hiddenCount > 0 || expanded ? (
        <button
          onClick={() => setExpanded((value) => !value)}
          className="mt-1 w-full text-left text-[10px] text-slate-400 hover:text-slate-600"
        >
          {expanded ? 'zabalit' : `+ ${hiddenCount} dalších`}
        </button>
      ) : null}
    </div>
  )
}
