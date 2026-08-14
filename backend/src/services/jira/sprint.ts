import { prisma } from '../../lib/prisma'
import { getSprint } from './client'

/**
 * Jira Server returns customfield_10004 as a serialized java toString:
 *   com.atlassian.greenhopper.service.sprint.Sprint@22996abc[id=1020,rapidViewId=229,
 *   state=ACTIVE,name=2/4 Srpen 2026 (1020),startDate=...,goal=,autoStartStop=false]
 *
 * Splitting that on commas corrupts sprint names (they contain "/", "(" and commas),
 * so only the numeric id is taken from it and the rest comes from the Agile API,
 * which returns clean JSON. Sprint state must stay live — the active sprint rotates weekly.
 */

const SPRINT_ID = /\[id=(\d+)/
const CACHE_TTL_MS = 60 * 60 * 1000

export function extractSprintIds(rawField: unknown): number[] {
  const list = Array.isArray(rawField) ? rawField : rawField ? [rawField] : []
  const ids: number[] = []

  for (const item of list) {
    if (item && typeof item === 'object' && typeof (item as any).id === 'number') {
      ids.push((item as any).id)
      continue
    }
    if (typeof item !== 'string') continue
    const match = item.match(SPRINT_ID)
    if (match) ids.push(Number(match[1]))
  }

  return [...new Set(ids)]
}

const STATE_PRIORITY: Record<string, number> = { ACTIVE: 0, FUTURE: 1, CLOSED: 2 }

type CachedSprint = {
  id: number
  name: string
  state: string
  startDate: Date | null
  endDate: Date | null
  completeDate: Date | null
  originBoardId: number | null
}

/** One unreachable sprint must not fail the whole sync, hence the per-id try/catch. */
export async function resolveSprints(ids: number[]): Promise<Map<number, CachedSprint>> {
  const result = new Map<number, CachedSprint>()
  if (ids.length === 0) return result

  const cached = await prisma.sprint.findMany({ where: { id: { in: ids } } })
  const fresh = Date.now() - CACHE_TTL_MS

  for (const sprint of cached) {
    const isStale = sprint.state !== 'CLOSED' && sprint.fetchedAt.getTime() < fresh
    if (!isStale) result.set(sprint.id, sprint)
  }

  for (const id of ids) {
    if (result.has(id)) continue
    try {
      const data = await getSprint(id)
      const record = {
        id: data.id,
        name: data.name ?? `Sprint ${data.id}`,
        state: (data.state ?? 'unknown').toUpperCase(),
        startDate: data.startDate ? new Date(data.startDate) : null,
        endDate: data.endDate ? new Date(data.endDate) : null,
        completeDate: data.completeDate ? new Date(data.completeDate) : null,
        originBoardId: data.originBoardId ?? null,
      }
      await prisma.sprint.upsert({
        where: { id: record.id },
        create: { ...record, fetchedAt: new Date() },
        update: { ...record, fetchedAt: new Date() },
      })
      result.set(id, record)
    } catch {
      const stale = cached.find((s) => s.id === id)
      if (stale) result.set(id, stale)
    }
  }

  return result
}

/** An issue carried over from a previous sprint belongs to several: ACTIVE wins, then FUTURE, then newest CLOSED. */
export function pickSprintId(ids: number[], sprints: Map<number, CachedSprint>): number | null {
  const known = ids.map((id) => sprints.get(id)).filter((s): s is CachedSprint => !!s)
  if (known.length === 0) return null

  known.sort((a, b) => {
    const stateDiff = (STATE_PRIORITY[a.state] ?? 3) - (STATE_PRIORITY[b.state] ?? 3)
    if (stateDiff !== 0) return stateDiff
    const aStart = a.startDate?.getTime() ?? 0
    const bStart = b.startDate?.getTime() ?? 0
    return a.state === 'CLOSED' ? bStart - aStart : aStart - bStart
  })

  return known[0].id
}
