import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { DEFAULT_JQL } from '../env'
import { prisma } from '../lib/prisma'
import { runCalendarSync } from '../services/calendar/sync'
import { buildJql, runJiraSync } from '../services/jira/sync'
import { loggedThisMonth } from '../services/jira/worklogs'
import { classifySprints, remainingMinutes } from '../services/sprints'
import { serializeIssue } from '../services/week'
import { currentUser } from './context'

const patchSchema = z.object({
  dailyCapacityMinutes: z
    .number()
    .int()
    .min(0)
    .max(24 * 60)
    .optional(),
  workingDays: z.array(z.number().int().min(1).max(7)).optional(),
  showWeekend: z.boolean().optional(),
  jql: z.string().max(1000).nullable().optional(),
  ignoredProjects: z.array(z.string().max(50)).optional(),
  overheadProject: z.string().max(50).nullable().optional(),
})

export async function meRoutes(app: FastifyInstance) {
  app.get('/api/me', async (request) => {
    const user = await currentUser(request)
    return {
      id: user.id,
      jiraUsername: user.jiraUsername,
      displayName: user.displayName,
      email: user.email,
      dailyCapacityMinutes: user.dailyCapacityMinutes,
      workingDays: user.workingDays,
      showWeekend: user.showWeekend,
      jql: user.jql,
      ignoredProjects: user.ignoredProjects,
      overheadProject: user.overheadProject,
      defaultJql: DEFAULT_JQL,
      effectiveJql: buildJql(user),
      timezone: user.timezone,
    }
  })

  app.patch('/api/me', async (request) => {
    const user = await currentUser(request)
    const body = patchSchema.parse(request.body)

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        dailyCapacityMinutes: body.dailyCapacityMinutes,
        workingDays: body.workingDays,
        showWeekend: body.showWeekend,
        jql: body.jql === '' ? null : body.jql,
        ignoredProjects: body.ignoredProjects,
        overheadProject: body.overheadProject === '' ? null : body.overheadProject,
      },
    })

    return {
      id: updated.id,
      dailyCapacityMinutes: updated.dailyCapacityMinutes,
      workingDays: updated.workingDays,
      showWeekend: updated.showWeekend,
      jql: updated.jql,
      ignoredProjects: updated.ignoredProjects,
      overheadProject: updated.overheadProject,
    }
  })

  /** Week-independent: how much work is waiting in JIRA overall. */
  app.get('/api/workload', async (request) => {
    const user = await currentUser(request)
    const [hiddenRows, { plannableIds }] = await Promise.all([
      prisma.hiddenIssue.findMany({ where: { userId: user.id }, select: { issueId: true } }),
      classifySprints(),
    ])

    const hiddenIds = hiddenRows.map((row) => row.issueId)
    const issues = await prisma.issue.findMany({
      where: {
        assigneeUsername: user.jiraUsername,
        isResolved: false,
        isOrphaned: false,
        isSubtask: false,
        // Overhead is not deliverable work — counting it would skew "how much is left".
        projectKey: { notIn: [...user.ignoredProjects, ...(user.overheadProject ? [user.overheadProject] : [])] },
        ...(hiddenIds.length > 0 ? { id: { notIn: hiddenIds } } : {}),
      },
      include: { sprint: true },
    })

    let sprintMinutes = 0
    let backlogMinutes = 0
    let withoutEstimate = 0
    const counted: typeof issues = []

    for (const issue of issues) {
      const inSprint = issue.sprintId !== null && plannableIds.has(issue.sprintId)
      // Issues parked in dumping-ground or closed sprints are not upcoming work.
      if (!inSprint && issue.sprintId !== null) continue

      const minutes = remainingMinutes(issue)
      counted.push(issue)
      if (minutes === 0) withoutEstimate += 1
      if (inSprint) sprintMinutes += minutes
      else backlogMinutes += minutes
    }

    const planned = await prisma.assignment.groupBy({
      by: ['issueId'],
      where: { userId: user.id, issueId: { in: counted.map((issue) => issue.id) } },
      _sum: { plannedMinutes: true },
    })
    const plannedByIssue = new Map(planned.map((row) => [row.issueId, row._sum.plannedMinutes ?? 0]))

    const logged = await loggedThisMonth(user.id)

    return {
      remainingMinutes: sprintMinutes + backlogMinutes,
      sprintMinutes,
      backlogMinutes,
      issueCount: counted.length,
      withoutEstimateCount: withoutEstimate,
      loggedThisMonthMinutes: logged.minutes,
      month: logged.month,
      issues: counted
        .map((issue) => serializeIssue(issue, plannedByIssue.get(issue.id) ?? 0))
        .sort(
          (a, b) =>
            (b.remainingEstimateMin || b.originalEstimateMin || 0) -
            (a.remainingEstimateMin || a.originalEstimateMin || 0),
        ),
    }
  })

  app.get('/api/sync/status', async () => {
    const [states, sources] = await Promise.all([
      prisma.syncState.findMany(),
      prisma.calendarSource.findMany({
        select: { id: true, name: true, enabled: true, lastSuccessAt: true, lastError: true, eventCount: true },
      }),
    ])

    const byKey = Object.fromEntries(states.map((state) => [state.key, state.value]))
    return { jira: byKey.jira ?? null, calendar: byKey.calendar ?? null, sources }
  })

  app.post('/api/sync/jira', async (request) => {
    const full = z.object({ full: z.coerce.boolean().optional() }).parse(request.query).full
    return runJiraSync({ full })
  })

  app.post('/api/sync/calendar', async () => runCalendarSync())
}
