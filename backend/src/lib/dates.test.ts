import { describe, expect, it } from 'vitest'
import {
  addDaysToKey,
  czechHolidays,
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
} from './dates'

describe('date keys', () => {
  it('round-trips through the @db.Date representation', () => {
    expect(dbDateToKey(keyToDbDate('2026-08-12'))).toBe('2026-08-12')
  })

  it('keeps the day when DST starts (23h day)', () => {
    const start = localDayStart('2026-03-29')
    const end = localDayEnd('2026-03-29')
    expect((end.getTime() - start.getTime()) / 3_600_000).toBe(23)
    expect(addDaysToKey('2026-03-29', 1)).toBe('2026-03-30')
  })

  it('keeps the day when DST ends (25h day)', () => {
    const start = localDayStart('2026-10-25')
    const end = localDayEnd('2026-10-25')
    expect((end.getTime() - start.getTime()) / 3_600_000).toBe(25)
    expect(addDaysToKey('2026-10-25', 1)).toBe('2026-10-26')
  })

  it('starts weeks on Monday', () => {
    expect(startOfIsoWeek('2026-08-14')).toBe('2026-08-10')
    expect(startOfIsoWeek('2026-08-10')).toBe('2026-08-10')
    expect(startOfIsoWeek('2026-08-16')).toBe('2026-08-10')
  })

  it('numbers ISO weeks', () => {
    expect(isoWeekNumber('2026-08-14')).toEqual({ week: 33, year: 2026 })
    expect(isoWeekNumber('2027-01-01')).toEqual({ week: 53, year: 2026 })
  })

  it('maps weekdays to ISO 1..7', () => {
    expect(isoWeekday('2026-08-10')).toBe(1)
    expect(isoWeekday('2026-08-16')).toBe(7)
  })
})

describe('overlap and merging', () => {
  it('clips an interval to the day', () => {
    const minutes = overlapMinutes(
      new Date('2026-08-12T08:30:00+02:00'),
      new Date('2026-08-12T10:00:00+02:00'),
      localDayStart('2026-08-12'),
      localDayEnd('2026-08-12'),
    )
    expect(minutes).toBe(90)
  })

  it('counts nothing for an interval on another day', () => {
    const minutes = overlapMinutes(
      new Date('2026-08-13T08:00:00+02:00'),
      new Date('2026-08-13T09:00:00+02:00'),
      localDayStart('2026-08-12'),
      localDayEnd('2026-08-12'),
    )
    expect(minutes).toBe(0)
  })

  it('does not count double-booked meetings twice', () => {
    const merged = mergeIntervals([
      [0, 60],
      [30, 90],
      [120, 150],
    ])
    expect(merged).toEqual([
      [0, 90],
      [120, 150],
    ])
  })
})

describe('czech holidays', () => {
  it('includes fixed and easter-derived days', () => {
    const holidays = czechHolidays(2026)
    expect(holidays.get('2026-07-05')).toBe('Cyril a Metoděj')
    expect(holidays.get('2026-04-03')).toBe('Velký pátek')
    expect(holidays.get('2026-04-06')).toBe('Velikonoční pondělí')
  })

  it('returns null on a normal day', () => {
    expect(holidayName('2026-08-12')).toBeNull()
  })
})
