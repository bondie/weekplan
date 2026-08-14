const WEEKDAYS = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne']

export function formatMinutes(minutes: number): string {
  if (minutes === 0) return '0 h'
  const hours = minutes / 60
  // Quarter-hour precision matters while planning a day; totals in the hundreds do not.
  const rounded = hours >= 10 ? Math.round(hours) : Math.round(hours * 100) / 100
  return `${String(rounded).replace('.', ',')} h`
}

export function formatDayLabel(date: string): { weekday: string; day: string } {
  const [year, month, day] = date.split('-').map(Number)
  const weekday = WEEKDAYS[(new Date(year, month - 1, day).getDay() + 6) % 7]
  return { weekday, day: `${day}. ${month}.` }
}

export function formatRange(from: string, to: string): string {
  const [, fromMonth, fromDay] = from.split('-').map(Number)
  const [toYear, toMonth, toDay] = to.split('-').map(Number)
  if (fromMonth === toMonth) return `${fromDay}.–${toDay}. ${toMonth}. ${toYear}`
  return `${fromDay}. ${fromMonth}. – ${toDay}. ${toMonth}. ${toYear}`
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })
}

export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return 'nikdy'
  const diff = Date.now() - new Date(iso).getTime()
  const minutes = Math.round(diff / 60000)
  if (minutes < 1) return 'právě teď'
  if (minutes < 60) return `před ${minutes} min`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `před ${hours} h`
  return `před ${Math.round(hours / 24)} dny`
}

export function todayKey(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number)
  const next = new Date(year, month - 1, day + days)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`
}

export function startOfWeek(date: string): string {
  const [year, month, day] = date.split('-').map(Number)
  const shift = (new Date(year, month - 1, day).getDay() + 6) % 7
  return addDays(date, -shift)
}
