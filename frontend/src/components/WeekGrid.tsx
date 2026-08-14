import { usePlanner } from '../hooks/planner'
import DayColumn from './DayColumn'

export default function WeekGrid() {
  const { week, isLoading, error } = usePlanner()

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center rounded-xl border border-rose-200 bg-rose-50 text-sm text-rose-700">
        {error}
      </div>
    )
  }

  if (isLoading || !week) {
    return (
      <div className="flex flex-1 items-center justify-center rounded-xl border border-slate-200 bg-white text-sm text-slate-400">
        Načítám týden…
      </div>
    )
  }

  const days = week.showWeekend ? week.days : week.days.filter((day) => day.weekday <= 5)

  return (
    <div className="flex min-w-0 flex-1 gap-3">
      {days.map((day) => (
        <DayColumn key={day.date} day={day} />
      ))}
    </div>
  )
}
