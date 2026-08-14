import { CheckCircle2 } from 'lucide-react'
import type { WorklogItem } from '../api/types'
import { formatMinutes } from '../lib/format'

export default function WorklogList({ worklogs, minutes }: { worklogs: WorklogItem[]; minutes: number }) {
  if (worklogs.length === 0) return null

  return (
    <div className="rounded-md bg-emerald-50/60 p-1.5">
      <div className="flex items-center gap-1 px-0.5 pb-1 text-[10px] font-medium text-emerald-700">
        <CheckCircle2 className="size-3" />
        vykázáno {formatMinutes(minutes)}
      </div>

      <div className="space-y-0.5">
        {worklogs.map((worklog) => (
          <div
            key={worklog.id}
            className="flex items-baseline gap-1.5 text-[11px] text-emerald-900"
            title={[worklog.issueSummary, worklog.comment, worklog.role].filter(Boolean).join(' · ')}
          >
            <span className="font-mono text-[10px] font-semibold">{worklog.issueKey}</span>
            <span className="truncate opacity-70">{worklog.comment ?? worklog.issueSummary}</span>
            <span className="ml-auto shrink-0 opacity-70">{formatMinutes(worklog.minutes)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
