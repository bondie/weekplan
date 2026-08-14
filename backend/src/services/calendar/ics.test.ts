import { describe, expect, it } from 'vitest'
import { expandIcs } from './ics'

const feed = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Microsoft Corporation//Outlook 16.0 MIMEDIR//EN
CALSCALE:GREGORIAN
METHOD:PUBLISH
BEGIN:VTIMEZONE
TZID:Central Europe Standard Time
BEGIN:STANDARD
DTSTART:16011028T030000
TZOFFSETFROM:+0200
TZOFFSETTO:+0100
RRULE:FREQ=YEARLY;BYDAY=-1SU;BYMONTH=10
END:STANDARD
BEGIN:DAYLIGHT
DTSTART:16010325T020000
TZOFFSETFROM:+0100
TZOFFSETTO:+0200
RRULE:FREQ=YEARLY;BYDAY=-1SU;BYMONTH=3
END:DAYLIGHT
END:VTIMEZONE
BEGIN:VEVENT
UID:standup-1
SUMMARY:Denní standup
DTSTART;TZID=Central Europe Standard Time:20260810T090000
DTEND;TZID=Central Europe Standard Time:20260810T091500
RRULE:FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR
EXDATE;TZID=Central Europe Standard Time:20260812T090000
X-MICROSOFT-CDO-BUSYSTATUS:BUSY
END:VEVENT
BEGIN:VEVENT
UID:standup-1
RECURRENCE-ID;TZID=Central Europe Standard Time:20260813T090000
SUMMARY:Standup (posunutý)
DTSTART;TZID=Central Europe Standard Time:20260813T100000
DTEND;TZID=Central Europe Standard Time:20260813T103000
X-MICROSOFT-CDO-BUSYSTATUS:BUSY
END:VEVENT
BEGIN:VEVENT
UID:planning-1
SUMMARY:Plánování
DTSTART;TZID=Central Europe Standard Time:20260811T130000
DTEND;TZID=Central Europe Standard Time:20260811T143000
END:VEVENT
BEGIN:VEVENT
UID:free-1
SUMMARY:Volitelný webinář
DTSTART;TZID=Central Europe Standard Time:20260811T160000
DTEND;TZID=Central Europe Standard Time:20260811T170000
TRANSP:TRANSPARENT
X-MICROSOFT-CDO-BUSYSTATUS:FREE
END:VEVENT
BEGIN:VEVENT
UID:cancelled-1
SUMMARY:Zrušená schůzka
DTSTART;TZID=Central Europe Standard Time:20260812T110000
DTEND;TZID=Central Europe Standard Time:20260812T120000
STATUS:CANCELLED
END:VEVENT
BEGIN:VEVENT
UID:vacation-1
SUMMARY:Dovolená
DTSTART;VALUE=DATE:20260814
DTEND;VALUE=DATE:20260815
X-MICROSOFT-CDO-BUSYSTATUS:OOF
END:VEVENT
END:VCALENDAR`

const windowStart = new Date('2026-08-10T00:00:00+02:00')
const windowEnd = new Date('2026-08-16T23:59:59+02:00')

describe('expandIcs', () => {
  const occurrences = expandIcs(feed, windowStart, windowEnd)
  const byUid = (uid: string) => occurrences.filter((occurrence) => occurrence.uid === uid)

  it('expands a recurring meeting and honours EXDATE', () => {
    const days = byUid('standup-1').map((occurrence) => occurrence.startsAt.toISOString().slice(0, 10))
    expect(days).toContain('2026-08-10')
    expect(days).toContain('2026-08-11')
    expect(days).not.toContain('2026-08-12')
  })

  it('applies a RECURRENCE-ID override instead of the master', () => {
    const moved = byUid('standup-1').find((occurrence) => occurrence.title === 'Standup (posunutý)')
    expect(moved).toBeDefined()
    expect(moved!.startsAt.toISOString()).toBe('2026-08-13T08:00:00.000Z')
    expect((moved!.endsAt.getTime() - moved!.startsAt.getTime()) / 60000).toBe(30)
  })

  it('resolves TZID through VTIMEZONE into the right instant', () => {
    const planning = byUid('planning-1')[0]
    expect(planning.startsAt.toISOString()).toBe('2026-08-11T11:00:00.000Z')
    expect(planning.busyStatus).toBe('BUSY')
  })

  it('marks free and cancelled events so capacity can skip them', () => {
    expect(byUid('free-1')[0].busyStatus).toBe('FREE')
    expect(byUid('cancelled-1')[0].cancelled).toBe(true)
  })

  it('detects an all-day out-of-office block', () => {
    const vacation = byUid('vacation-1')[0]
    expect(vacation.allDay).toBe(true)
    expect(vacation.busyStatus).toBe('OOF')
  })
})
