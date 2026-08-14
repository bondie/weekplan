import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { DEFAULT_JQL } from '../env'
import { prisma } from '../lib/prisma'
import { runCalendarSync } from '../services/calendar/sync'
import { buildJql, runJiraSync } from '../services/jira/sync'
import { loggedThisMonth } from '../services/jira/worklogs'
import { classifySprints, remainingMinutes } from '../services/sprints'
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
      },
    })

    return {
      id: updated.id,
      dailyCapacityMinutes: updated.dailyCapacityMinutes,
      workingDays: updated.workingDays,
      showWeekend: updated.showWeekend,
      jql: updated.jql,
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
        ...(hiddenIds.length > 0 ? { id: { notIn: hiddenIds } } : {}),
      },
      select: { remainingEstimateMin: true, originalEstimateMin: true, sprintId: true },
    })

    let sprintMinutes = 0
    let backlogMinutes = 0
    let withoutEstimate = 0
    let counted = 0

    for (const issue of issues) {
      const inSprint = issue.sprintId !== null && plannableIds.has(issue.sprintId)
      // Issues parked in dumping-ground or closed sprints are not upcoming work.
      if (!inSprint && issue.sprintId !== null) continue

      const minutes = remainingMinutes(issue)
      counted += 1
      if (minutes === 0) withoutEstimate += 1
      if (inSprint) sprintMinutes += minutes
      else backlogMinutes += minutes
    }

    const logged = await loggedThisMonth(user.id)

    return {
      remainingMinutes: sprintMinutes + backlogMinutes,
      sprintMinutes,
      backlogMinutes,
      issueCount: counted,
      withoutEstimateCount: withoutEstimate,
      loggedThisMonthMinutes: logged.minutes,
      month: logged.month,
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
