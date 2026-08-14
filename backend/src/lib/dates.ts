export type DateKey = string // YYYY-MM-DD

const pad = (n: number) => String(n).padStart(2, '0')

export function localDateKey(d: Date): DateKey {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// Prisma returns @db.Date columns as UTC midnight, so local getters would shift the day.
export function dbDateToKey(d: Date): DateKey {
  return d.toISOString().slice(0, 10)
}

export function keyToDbDate(key: DateKey): Date {
  return new Date(`${key}T00:00:00.000Z`)
}

export function localDayStart(key: DateKey): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d, 0, 0, 0, 0)
}

// Day + 1 instead of + 24h: Europe/Prague has 23h and 25h days around DST switches.
export function localDayEnd(key: DateKey): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d + 1, 0, 0, 0, 0)
}

export function addDaysToKey(key: DateKey, days: number): DateKey {
  const [y, m, d] = key.split('-').map(Number)
  return localDateKey(new Date(y, m - 1, d + days))
}

export function todayKey(): DateKey {
  return localDateKey(new Date())
}

export function startOfIsoWeek(key: DateKey): DateKey {
  const [y, m, d] = key.split('-').map(Number)
  const shift = (new Date(y, m - 1, d).getDay() + 6) % 7
  return addDaysToKey(key, -shift)
}

export function isoWeekNumber(key: DateKey): { week: number; year: number } {
  const [y, m, d] = key.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  const dayNum = (date.getUTCDay() + 6) % 7
  date.setUTCDate(date.getUTCDate() - dayNum + 3)
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4))
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3)
  const week = 1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000))
  return { week, year: date.getUTCFullYear() }
}

/** ISO weekday 1..7 (Mon..Sun), matching User.workingDays. */
export function isoWeekday(key: DateKey): number {
  const [y, m, d] = key.split('-').map(Number)
  return ((new Date(y, m - 1, d).getDay() + 6) % 7) + 1
}

export function overlapMinutes(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): number {
  const start = Math.max(aStart.getTime(), bStart.getTime())
  const end = Math.min(aEnd.getTime(), bEnd.getTime())
  if (end <= start) return 0
  return Math.round((end - start) / 60000)
}

/** Merge overlapping intervals so double-booked meetings are not counted twice. */
export function mergeIntervals(intervals: Array<[number, number]>): Array<[number, number]> {
  if (intervals.length === 0) return []
  const sorted = [...intervals].sort((a, b) => a[0] - b[0])
  const merged: Array<[number, number]> = [sorted[0]]

  for (const [start, end] of sorted.slice(1)) {
    const last = merged[merged.length - 1]
    if (start <= last[1]) {
      last[1] = Math.max(last[1], end)
      continue
    }
    merged.push([start, end])
  }

  return merged
}

function easterSunday(year: number): Date {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(year, month - 1, day)
}

const FIXED_CZ_HOLIDAYS: Array<[number, number, string]> = [
  [1, 1, 'Nový rok'],
  [5, 1, 'Svátek práce'],
  [5, 8, 'Den vítězství'],
  [7, 5, 'Cyril a Metoděj'],
  [7, 6, 'Jan Hus'],
  [9, 28, 'Den české státnosti'],
  [10, 28, 'Vznik ČSR'],
  [11, 17, 'Den boje za svobodu'],
  [12, 24, 'Štědrý den'],
  [12, 25, '1. svátek vánoční'],
  [12, 26, '2. svátek vánoční'],
]

const holidayCache = new Map<number, Map<DateKey, string>>()

export function czechHolidays(year: number): Map<DateKey, string> {
  const cached = holidayCache.get(year)
  if (cached) return cached

  const map = new Map<DateKey, string>()
  for (const [month, day, name] of FIXED_CZ_HOLIDAYS) {
    map.set(`${year}-${pad(month)}-${pad(day)}`, name)
  }

  const easter = easterSunday(year)
  const goodFriday = new Date(easter.getFullYear(), easter.getMonth(), easter.getDate() - 2)
  const easterMonday = new Date(easter.getFullYear(), easter.getMonth(), easter.getDate() + 1)
  map.set(localDateKey(goodFriday), 'Velký pátek')
  map.set(localDateKey(easterMonday), 'Velikonoční pondělí')

  holidayCache.set(year, map)
  return map
}

export function holidayName(key: DateKey): string | null {
  return czechHolidays(Number(key.slice(0, 4))).get(key) ?? null
}
