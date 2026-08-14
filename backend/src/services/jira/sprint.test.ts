import { describe, expect, it } from 'vitest'
import { extractSprintIds, pickSprintId } from './sprint'

const sprint = (id: number, state: string, startDate: Date | null = null) => ({
  id,
  name: `Sprint ${id}`,
  state,
  startDate,
  endDate: null,
  completeDate: null,
  originBoardId: 229,
})

const serialized = (id: number, state: string, name: string) =>
  `com.atlassian.greenhopper.service.sprint.Sprint@22996abc[id=${id},rapidViewId=229,state=${state},name=${name},startDate=2026-08-10T04:37:00.000+02:00,endDate=2026-08-14T04:37:00.000+02:00,completeDate=<null>,sequence=${id},goal=,autoStartStop=false]`

describe('extractSprintIds', () => {
  it('reads ids from the serialized java toString', () => {
    expect(extractSprintIds([serialized(1019, 'CLOSED', '1/4 Srpen 2026 (1019)')])).toEqual([1019])
  })

  it('survives sprint names containing commas and brackets', () => {
    expect(extractSprintIds([serialized(1020, 'ACTIVE', 'Sprint A, B [pilot] (1020)')])).toEqual([1020])
  })

  it('does not confuse rapidViewId with the sprint id', () => {
    expect(extractSprintIds([serialized(7, 'ACTIVE', 'x')])).toEqual([7])
  })

  it('handles multiple sprints on a carried-over issue', () => {
    expect(
      extractSprintIds([
        serialized(1019, 'CLOSED', 'old'),
        serialized(1020, 'ACTIVE', 'new'),
        serialized(1020, 'ACTIVE', 'dup'),
      ]),
    ).toEqual([1019, 1020])
  })

  it('accepts object-shaped values from newer JIRA versions', () => {
    expect(extractSprintIds([{ id: 42, name: 'Sprint 42', state: 'active' }])).toEqual([42])
  })

  it('returns nothing for an issue outside any sprint', () => {
    expect(extractSprintIds(null)).toEqual([])
    expect(extractSprintIds([])).toEqual([])
  })
})

describe('pickSprintId', () => {
  const cache = new Map([
    [1019, sprint(1019, 'CLOSED', new Date('2026-08-03'))],
    [1020, sprint(1020, 'ACTIVE', new Date('2026-08-10'))],
    [1021, sprint(1021, 'FUTURE', new Date('2026-08-17'))],
    [1022, sprint(1022, 'FUTURE')],
    [1023, sprint(1023, 'FUTURE')],
  ])

  it('prefers the active sprint over a carried-over closed one', () => {
    expect(pickSprintId([1019, 1020], cache)).toBe(1020)
  })

  it('prefers the active sprint over a future one', () => {
    expect(pickSprintId([1021, 1020], cache)).toBe(1020)
  })

  it('picks the nearest future sprint by date', () => {
    expect(pickSprintId([1022, 1021], cache)).toBe(1021)
  })

  it('falls back to the lower id when future sprints have no dates yet', () => {
    expect(pickSprintId([1023, 1022], cache)).toBe(1022)
  })

  it('returns the newest closed sprint when nothing else is left', () => {
    expect(pickSprintId([1019], cache)).toBe(1019)
  })

  it('ignores ids that are not in the cache', () => {
    expect(pickSprintId([9999], cache)).toBeNull()
  })
})
