import ICAL from 'ical.js'

export interface Occurrence {
  uid: string
  recurrenceId: string
  title: string
  location: string | null
  startsAt: Date
  endsAt: Date
  allDay: boolean
  busyStatus: BusyStatus
  cancelled: boolean
}

export type BusyStatus = 'FREE' | 'TENTATIVE' | 'BUSY' | 'OOF' | 'WORKING_ELSEWHERE'

const MAX_OCCURRENCES_PER_EVENT = 2000
const MAX_OCCURRENCES_TOTAL = 20000

function readBusyStatus(component: ICAL.Component): BusyStatus {
  // Outlook fills X-MICROSOFT-CDO-BUSYSTATUS far more reliably than TRANSP.
  const raw = component.getFirstPropertyValue('x-microsoft-cdo-busystatus')
  if (typeof raw === 'string') {
    const value = raw.toUpperCase()
    if (value === 'FREE') return 'FREE'
    if (value === 'TENTATIVE') return 'TENTATIVE'
    if (value === 'OOF') return 'OOF'
    if (value === 'WORKINGELSEWHERE') return 'WORKING_ELSEWHERE'
    return 'BUSY'
  }

  const transp = component.getFirstPropertyValue('transp')
  return typeof transp === 'string' && transp.toUpperCase() === 'TRANSPARENT' ? 'FREE' : 'BUSY'
}

function isCancelled(component: ICAL.Component): boolean {
  const status = component.getFirstPropertyValue('status')
  return typeof status === 'string' && status.toUpperCase() === 'CANCELLED'
}

function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

/** ICS feeds may carry unbounded RRULEs, so expansion is always clamped to a window and a hard cap. */
export function expandIcs(text: string, windowStart: Date, windowEnd: Date): Occurrence[] {
  const root = new ICAL.Component(ICAL.parse(text))

  for (const vtimezone of root.getAllSubcomponents('vtimezone')) {
    const timezone = new ICAL.Timezone(vtimezone)
    if (!ICAL.TimezoneService.has(timezone.tzid)) ICAL.TimezoneService.register(timezone)
  }

  const masters = new Map<string, ICAL.Component>()
  const exceptions: ICAL.Component[] = []

  for (const vevent of root.getAllSubcomponents('vevent')) {
    const uid = vevent.getFirstPropertyValue('uid')
    if (typeof uid !== 'string') continue
    if (vevent.hasProperty('recurrence-id')) {
      exceptions.push(vevent)
      continue
    }
    masters.set(uid, vevent)
  }

  const occurrences: Occurrence[] = []

  const push = (component: ICAL.Component, uid: string, recurrenceId: string, start: ICAL.Time, end: ICAL.Time) => {
    if (occurrences.length >= MAX_OCCURRENCES_TOTAL) return
    occurrences.push({
      uid,
      recurrenceId,
      title: asString(component.getFirstPropertyValue('summary'), '(bez názvu)'),
      location:
        typeof component.getFirstPropertyValue('location') === 'string'
          ? (component.getFirstPropertyValue('location') as string)
          : null,
      startsAt: start.toJSDate(),
      endsAt: end.toJSDate(),
      allDay: start.isDate,
      busyStatus: readBusyStatus(component),
      cancelled: isCancelled(component),
    })
  }

  for (const [uid, master] of masters) {
    const event = new ICAL.Event(master)

    for (const exception of exceptions) {
      if (exception.getFirstPropertyValue('uid') === uid) event.relateException(exception)
    }

    if (!event.isRecurring()) {
      const start = event.startDate
      const end = event.endDate
      if (end.toJSDate() >= windowStart && start.toJSDate() <= windowEnd) push(master, uid, '', start, end)
      continue
    }

    const iterator = event.iterator()
    let guard = 0
    let next: ICAL.Time | null

    while ((next = iterator.next()) && guard < MAX_OCCURRENCES_PER_EVENT) {
      guard += 1
      if (next.toJSDate() > windowEnd) break

      const details = event.getOccurrenceDetails(next)
      if (details.endDate.toJSDate() < windowStart) continue

      const component = (details.item as ICAL.Event).component ?? master
      push(component, uid, details.recurrenceId.toString(), details.startDate, details.endDate)
    }
  }

  // A feed slice can contain an override whose master event is outside the published range.
  for (const exception of exceptions) {
    const uid = exception.getFirstPropertyValue('uid') as string
    if (masters.has(uid)) continue

    const event = new ICAL.Event(exception)
    if (event.endDate.toJSDate() < windowStart || event.startDate.toJSDate() > windowEnd) continue
    push(exception, uid, String(exception.getFirstPropertyValue('recurrence-id') ?? ''), event.startDate, event.endDate)
  }

  return occurrences
}
