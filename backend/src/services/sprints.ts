import type { Sprint } from '@prisma/client'
import { prisma } from '../lib/prisma'

/**
 * Only the running sprint series is plannable: the active sprint and the dated sprints that
 * follow it. Everything else — closed sprints and the dateless dumping grounds old tasks get
 * parked in — is out of scope for planning. Their issues are not backlog either: the backlog
 * is what JIRA calls the backlog, i.e. issues in no sprint at all.
 */
export interface SprintClassification {
  all: Sprint[]
  plannable: Sprint[]
  plannableIds: Set<number>
}

export async function classifySprints(): Promise<SprintClassification> {
  const all = await prisma.sprint.findMany()

  const activeIds = all.filter((sprint) => sprint.state === 'ACTIVE').map((sprint) => sprint.id)
  const firstActiveId = activeIds.length > 0 ? Math.min(...activeIds) : null

  const plannable = all.filter(
    (sprint) =>
      sprint.state === 'ACTIVE' ||
      (sprint.state === 'FUTURE' &&
        sprint.startDate !== null &&
        (firstActiveId === null || sprint.id >= firstActiveId)),
  )

  const plannableIds = new Set(plannable.map((sprint) => sprint.id))

  return { all, plannable, plannableIds }
}

/** A zero remaining estimate means the work was logged, not that the task takes no time. */
export function remainingMinutes(issue: { remainingEstimateMin: number | null; originalEstimateMin: number | null }) {
  return issue.remainingEstimateMin || issue.originalEstimateMin || 0
}
