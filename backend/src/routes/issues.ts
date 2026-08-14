import type { Prisma } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { serializeIssue, sprintCoversWeek } from '../services/week'
import { currentUser } from './context'

const NO_SPRINT = 'none'

const querySchema = z.object({
  sprints: z.string().optional(), // "1020,1021,none"; missing = sprints covering `week`
  week: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  q: z.string().trim().optional(),
  project: z.string().trim().optional(),
  hidden: z.coerce.boolean().optional(),
  unplanned: z.coerce.boolean().optional(),
})

const STATE_ORDER: Record<string, number> = { ACTIVE: 0, FUTURE: 1, CLOSED: 3 }
const NO_SPRINT_ORDER = 2

export async function issuesRoutes(app: FastifyInstance) {
  app.get('/api/issues', async (request) => {
    const user = await currentUser(request)
    const { sprints, week, q, project, hidden, unplanned } = querySchema.parse(request.query)

    const hiddenRows = await prisma.hiddenIssue.findMany({ where: { userId: user.id }, select: { issueId: true } })
    const hiddenIds = hiddenRows.map((row) => row.issueId)

    const plannedIds = unplanned
      ? (
          await prisma.assignment.findMany({
            where: { userId: user.id },
            select: { issueId: true },
            distinct: ['issueId'],
          })
        ).map((row) => row.issueId)
      : []

    const excluded = [...new Set([...hiddenIds, ...plannedIds])]

    const base: Prisma.IssueWhereInput = {
      assigneeUsername: user.jiraUsername,
      isResolved: false,
      isOrphaned: false,
      ...(hidden ? { id: { in: hiddenIds } } : excluded.length > 0 ? { id: { notIn: excluded } } : {}),
    }

    const grouped = await prisma.issue.groupBy({ by: ['sprintId'], where: base, _count: { _all: true } })
    const allSprints = await prisma.sprint.findMany()

    /**
     * Only the running sprint series is plannable: the active sprint and the dated sprints
     * that follow it. Dumping-ground sprints are FUTURE too, but they carry no dates and
     * their ids predate the active sprint — their issues belong to the backlog.
     */
    const activeIds = allSprints.filter((sprint) => sprint.state === 'ACTIVE').map((sprint) => sprint.id)
    const firstActiveId = activeIds.length > 0 ? Math.min(...activeIds) : null
    const isPlannable = (sprint: { id: number; state: string; startDate: Date | null }) =>
      sprint.state === 'ACTIVE' ||
      (sprint.state === 'FUTURE' && sprint.startDate !== null && (firstActiveId === null || sprint.id >= firstActiveId))

    const plannable = allSprints.filter(isPlannable)
    const plannableIds = new Set(plannable.map((sprint) => sprint.id))
    // Closed sprints are history: not plannable and, like in JIRA, not part of the backlog.
    const backlogSprintIds = allSprints
      .filter((sprint) => !plannableIds.has(sprint.id) && sprint.state !== 'CLOSED')
      .map((sprint) => sprint.id)

    const countBySprint = new Map(grouped.map((row) => [row.sprintId, row._count._all]))

    const options = plannable
      .filter((sprint) => (countBySprint.get(sprint.id) ?? 0) > 0 || (week ? sprintCoversWeek(sprint, week) : false))
      .map((sprint) => ({
        id: sprint.id,
        name: sprint.name,
        state: sprint.state,
        startDate: sprint.startDate?.toISOString() ?? null,
        endDate: sprint.endDate?.toISOString() ?? null,
        count: countBySprint.get(sprint.id) ?? 0,
      }))
      .sort(
        (a, b) =>
          (STATE_ORDER[a.state] ?? 4) - (STATE_ORDER[b.state] ?? 4) ||
          (a.startDate ? Date.parse(a.startDate) : Infinity) - (b.startDate ? Date.parse(b.startDate) : Infinity) ||
          a.id - b.id,
      )

    const noSprintCount =
      (countBySprint.get(null) ?? 0) + backlogSprintIds.reduce((sum, id) => sum + (countBySprint.get(id) ?? 0), 0)

    // Default view follows the week on screen: the sprint that covers it. Everything else
    // (dumping-ground sprints, closed sprints, backlog) is opt-in.
    const covering = week ? options.filter((option) => sprintCoversWeek(option, week)) : []
    const active = options.filter((option) => option.state === 'ACTIVE').map((option) => option.id)
    // Never guess a future sprint: dumping-ground sprints are FUTURE too, just without dates.
    // An upcoming sprint nobody has filled in yet would leave an empty panel, so keep the
    // current sprint alongside it.
    const defaultSelection =
      covering.length === 0
        ? active
        : covering.some((option) => option.count > 0)
          ? covering.map((option) => option.id)
          : [...new Set([...covering.map((option) => option.id), ...active])]

    const requested = sprints === undefined ? null : sprints.split(',').filter(Boolean)
    const selectedIds = requested
      ? requested
          .filter((value) => value !== NO_SPRINT)
          .map(Number)
          .filter(Number.isFinite)
      : defaultSelection
    const includeNoSprint = requested ? requested.includes(NO_SPRINT) : false

    const sprintFilter: Prisma.IssueWhereInput[] = [
      ...(selectedIds.length > 0 ? [{ sprintId: { in: selectedIds } }] : []),
      ...(includeNoSprint
        ? [{ sprintId: null }, ...(backlogSprintIds.length > 0 ? [{ sprintId: { in: backlogSprintIds } }] : [])]
        : []),
    ]

    // Searching by name or key looks across every sprint — otherwise an issue would be
    // unreachable just because its sprint is not ticked.
    const where: Prisma.IssueWhereInput = q
      ? {
          ...base,
          ...(project ? { projectKey: project } : {}),
          OR: [{ summary: { contains: q, mode: 'insensitive' } }, { key: { contains: q, mode: 'insensitive' } }],
        }
      : {
          ...base,
          ...(project ? { projectKey: project } : {}),
          OR: sprintFilter,
        }

    const issues =
      sprintFilter.length === 0 && !q
        ? []
        : await prisma.issue.findMany({
            where,
            include: { sprint: true },
            orderBy: [{ sprintId: 'asc' }, { rank: { sort: 'asc', nulls: 'last' } }],
            take: 300,
          })

    const planned = await prisma.assignment.groupBy({
      by: ['issueId'],
      where: { userId: user.id, issueId: { in: issues.map((issue) => issue.id) } },
      _sum: { plannedMinutes: true },
    })
    const plannedByIssue = new Map(planned.map((row) => [row.issueId, row._sum.plannedMinutes ?? 0]))

    const ordered = issues.sort((a, b) => {
      const aOrder = a.sprintId === null ? NO_SPRINT_ORDER : (STATE_ORDER[a.sprint?.state ?? ''] ?? 4)
      const bOrder = b.sprintId === null ? NO_SPRINT_ORDER : (STATE_ORDER[b.sprint?.state ?? ''] ?? 4)
      if (aOrder !== bOrder) return aOrder - bOrder
      if (a.sprintId !== b.sprintId) return (a.sprintId ?? 0) - (b.sprintId ?? 0)
      return (a.rank ?? '~').localeCompare(b.rank ?? '~')
    })

    const projects = await prisma.issue.groupBy({ by: ['projectKey'], where: base, _count: { _all: true } })

    return {
      issues: ordered.map((issue) => serializeIssue(issue, plannedByIssue.get(issue.id) ?? 0)),
      sprints: options,
      noSprintCount,
      hiddenCount: hiddenIds.length,
      selected: [...selectedIds.map(String), ...(includeNoSprint ? [NO_SPRINT] : [])],
      projects: projects
        .map((row) => ({ key: row.projectKey, count: row._count._all }))
        .sort((a, b) => b.count - a.count),
    }
  })

  app.post('/api/issues/:key/hide', async (request) => {
    const user = await currentUser(request)
    const { key } = z.object({ key: z.string() }).parse(request.params)

    const issue = await prisma.issue.findUniqueOrThrow({ where: { key } })
    await prisma.hiddenIssue.upsert({
      where: { userId_issueId: { userId: user.id, issueId: issue.id } },
      create: { userId: user.id, issueId: issue.id },
      update: {},
    })

    return { ok: true }
  })

  app.delete('/api/issues/:key/hide', async (request) => {
    const user = await currentUser(request)
    const { key } = z.object({ key: z.string() }).parse(request.params)

    const issue = await prisma.issue.findUniqueOrThrow({ where: { key } })
    await prisma.hiddenIssue.deleteMany({ where: { userId: user.id, issueId: issue.id } })

    return { ok: true }
  })
}
