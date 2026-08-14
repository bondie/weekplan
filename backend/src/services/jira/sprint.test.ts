import { describe, expect, it } from 'vitest'
import { extractSprintIds } from './sprint'

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
