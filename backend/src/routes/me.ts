import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { DEFAULT_JQL } from '../env'
import { prisma } from '../lib/prisma'
import { runCalendarSync } from '../services/calendar/sync'
import { buildJql, runJiraSync } from '../services/jira/sync'
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
