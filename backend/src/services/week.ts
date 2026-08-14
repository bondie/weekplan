import type { CalendarEvent, DayOverride, Issue, Sprint, User } from '@prisma/client'
import {
  addDaysToKey,
  dbDateToKey,
  holidayName,
  isoWeekNumber,
  isoWeekday,
  keyToDbDate,
  localDayEnd,
  localDayStart,
  mergeIntervals,
  overlapMinutes,
  startOfIsoWeek,
  todayKey,
  type DateKey,
} from '../lib/dates'
import { prisma } from '../lib/prisma'

export interface IssuePayload {
  key: string
  summary: string
  status: string
  statusCategory: string
  issueType: string
  projectKey: string
  projectName: string
  priority: string | null
  originalEstimateMin: number | null
  remainingEstimateMin: number | null
  timeSpentMin: number | null
  sprintId: number | null
  sprintName: string | null
  sprintState: string | null
  dueDate: string | null
  isResolved: boolean
  isOrphaned: boolean
  assigneeUsername: string | null
  assigneeName: string | null
  url: string
  plannedMinutes: number
}

export function serializeIssue(issue: Issue & { sprint?: Sprint | null }, plannedMinutes = 0): IssuePayload {
  return {
    key: issue.key,
    summary: issue.summary,
    status: issue.status,
    statusCategory: issue.statusCategory,
    issueType: issue.issueType,
    projectKey: issue.projectKey,
    projectName: issue.projectName,
    priority: issue.priority,
    originalEstimateMin: issue.originalEstimateMin,
    remainingEstimateMin: issue.remainingEstimateMin,
    timeSpentMin: issue.timeSpentMin,
    sprintId: issue.sprintId,
    sprintName: issue.sprint?.name ?? null,
    sprintState: issue.sprint?.state ?? null,
    dueDate: issue.dueDate ? dbDateToKey(issue.dueDate) : null,
    isResolved: issue.isResolved,
    isOrphaned: issue.isOrphaned,
    assigneeUsername: issue.assigneeUsername,
    assigneeName: issue.assigneeName,
    url: issue.url,
    plannedMinutes,
  }
}

export interface EventPayload {
  id: string
  title: string
  startsAt: string
  endsAt: string
  allDay: boolean
  busyStatus: string
  countsToCapacity: boolean
  manual: boolean
  minutes: number
}

export interface AssignmentPayload {
  id: string
  issueKey: string
  plannedMinutes: number
  position: number
  note: string | null
  done: boolean
  issue: IssuePayload | null
}

export interface DayPayload {
  date: DateKey
  weekday: number
  isToday: boolean
  isWorkingDay: boolean
  holiday: string | null
  capacityMinutes: number
  overheadMinutes: number
  overheadRawMinutes: number
  availableMinutes: number
  plannedMinutes: number
  freeMinutes: number
  overbookedMinutes: number
  blockedAllDay: boolean
  override: { capacityMinutes: number; note: string | null } | null
  events: EventPayload[]
  assignments: AssignmentPayload[]
}

export interface WeekPayload {
  weekStart: DateKey
  weekEnd: DateKey
  isoWeek: number
  isoYear: number
  today: DateKey
  showWeekend: boolean
  days: DayPayload[]
  totals: {
    capacityMinutes: number
    overheadMinutes: number
    plannedMinutes: number
    freeMinutes: number
    overbookedMinutes: number
  }
  activeSprints: Array<{ id: number; name: string; startDate: string | null; endDate: string | null }>
}

function dayCapacity(user: User, key: DateKey, override: DayOverride | undefined, holiday: string | null): number {
  if (override) return override.capacityMinutes
  if (holiday) return 0
  return user.workingDays.includes(isoWeekday(key)) ? user.dailyCapacityMinutes : 0
}

function buildDay(
  user: User,
  key: DateKey,
  events: CalendarEvent[],
  assignments: Array<{ assignment: AssignmentPayload }>,
  override: DayOverride | undefined,
): DayPayload {
  const dayStart = localDayStart(key)
  const dayEnd = localDayEnd(key)
  const holiday = holidayName(key)

  const dayEvents = events.filter(
    (event) =>
      overlapMinutes(event.startsAt, event.endsAt, dayStart, dayEnd) > 0 ||
      (event.allDay && dbDateToKey(event.localDate) === key),
  )

  const blockedAllDay = dayEvents.some((event) => event.allDay && event.countsToCapacity)

  const busyIntervals: Array<[number, number]> = dayEvents
    .filter((event) => event.countsToCapacity && !event.allDay)
    .map((event): [number, number] => [
      Math.max(event.startsAt.getTime(), dayStart.getTime()),
      Math.min(
        event.overrideMinutes != null
          ? event.startsAt.getTime() + event.overrideMinutes * 60000
          : event.endsAt.getTime(),
        dayEnd.getTime(),
      ),
    ])
    .filter(([start, end]) => end > start)

  const overheadRawMinutes = Math.round(
    mergeIntervals(busyIntervals).reduce((sum, [start, end]) => sum + (end - start), 0) / 60000,
  )

  const baseCapacity = dayCapacity(user, key, override, holiday)
  const capacityMinutes = blockedAllDay ? 0 : baseCapacity
  const overheadMinutes = Math.min(capacityMinutes, overheadRawMinutes)
  const availableMinutes = Math.max(0, capacityMinutes - overheadMinutes)
  const plannedMinutes = assignments.reduce((sum, item) => sum + item.assignment.plannedMinutes, 0)

  return {
    date: key,
    weekday: isoWeekday(key),
    isToday: key === todayKey(),
    isWorkingDay: baseCapacity > 0,
    holiday,
    capacityMinutes,
    overheadMinutes,
    overheadRawMinutes,
    availableMinutes,
    plannedMinutes,
    freeMinutes: Math.max(0, availableMinutes - plannedMinutes),
    overbookedMinutes: Math.max(0, plannedMinutes - availableMinutes),
    blockedAllDay,
    override: override ? { capacityMinutes: override.capacityMinutes, note: override.note } : null,
    events: dayEvents
      .map((event) => ({
        id: event.id,
        title: event.title,
        startsAt: event.startsAt.toISOString(),
        endsAt: event.endsAt.toISOString(),
        allDay: event.allDay,
        busyStatus: event.busyStatus,
        countsToCapacity: event.countsToCapacity,
        manual: event.manual,
        minutes: event.allDay ? 0 : overlapMinutes(event.startsAt, event.endsAt, dayStart, dayEnd),
      }))
      .sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.startsAt.localeCompare(b.startsAt)),
    assignments: assignments.map((item) => item.assignment).sort((a, b) => a.position - b.position),
  }
}

export async function buildWeek(userId: string, from: DateKey): Promise<WeekPayload> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } })
  const weekStart = startOfIsoWeek(from)
  const keys = Array.from({ length: 7 }, (_, index) => addDaysToKey(weekStart, index))
  const weekEnd = keys[6]

  const [assignments, events, overrides, activeSprints] = await Promise.all([
    prisma.assignment.findMany({
      where: { userId, date: { gte: keyToDbDate(weekStart), lte: keyToDbDate(weekEnd) } },
      include: { issue: { include: { sprint: true } } },
      orderBy: { position: 'asc' },
    }),
    prisma.calendarEvent.findMany({
      where: {
        userId,
        cancelled: false,
        startsAt: { lt: localDayEnd(weekEnd) },
        endsAt: { gt: localDayStart(weekStart) },
      },
    }),
    prisma.dayOverride.findMany({
      where: { userId, date: { gte: keyToDbDate(weekStart), lte: keyToDbDate(weekEnd) } },
    }),
    prisma.sprint.findMany({ where: { state: 'ACTIVE' }, orderBy: { endDate: 'asc' } }),
  ])

  const plannedByIssue = new Map<string, number>()
  for (const assignment of await prisma.assignment.groupBy({
    by: ['issueId'],
    where: { userId, issueId: { in: assignments.map((a) => a.issueId) } },
    _sum: { plannedMinutes: true },
  })) {
    plannedByIssue.set(assignment.issueId, assignment._sum.plannedMinutes ?? 0)
  }

  const byDay = new Map<DateKey, Array<{ assignment: AssignmentPayload }>>()
  for (const assignment of assignments) {
    const key = dbDateToKey(assignment.date)
    const list = byDay.get(key) ?? []
    list.push({
      assignment: {
        id: assignment.id,
        issueKey: assignment.issue?.key ?? assignment.issueKeySnapshot,
        plannedMinutes: assignment.plannedMinutes,
        position: assignment.position,
        note: assignment.note,
        done: assignment.done,
        issue: assignment.issue ? serializeIssue(assignment.issue, plannedByIssue.get(assignment.issueId) ?? 0) : null,
      },
    })
    byDay.set(key, list)
  }

  const overrideByDay = new Map(overrides.map((override) => [dbDateToKey(override.date), override]))
  const days = keys.map((key) => buildDay(user, key, events, byDay.get(key) ?? [], overrideByDay.get(key)))
  const { week, year } = isoWeekNumber(weekStart)

  return {
    weekStart,
    weekEnd,
    isoWeek: week,
    isoYear: year,
    today: todayKey(),
    showWeekend: user.showWeekend,
    days,
    totals: {
      capacityMinutes: days.reduce((sum, day) => sum + day.capacityMinutes, 0),
      overheadMinutes: days.reduce((sum, day) => sum + day.overheadMinutes, 0),
      plannedMinutes: days.reduce((sum, day) => sum + day.plannedMinutes, 0),
      freeMinutes: days.reduce((sum, day) => sum + day.freeMinutes, 0),
      overbookedMinutes: days.reduce((sum, day) => sum + day.overbookedMinutes, 0),
    },
    activeSprints: activeSprints.map((sprint) => ({
      id: sprint.id,
      name: sprint.name,
      startDate: sprint.startDate?.toISOString() ?? null,
      endDate: sprint.endDate?.toISOString() ?? null,
    })),
  }
}
