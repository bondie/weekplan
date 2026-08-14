import cors from '@fastify/cors'
import Fastify from 'fastify'
import { ZodError } from 'zod'
import { env } from './env'
import { startScheduler } from './jobs/scheduler'
import { prisma } from './lib/prisma'
import { assignmentRoutes } from './routes/assignments'
import { calendarRoutes } from './routes/calendar'
import { issuesRoutes } from './routes/issues'
import { meRoutes } from './routes/me'
import { weekRoutes } from './routes/week'
import { ensureEnvIcsSource, runCalendarSync } from './services/calendar/sync'
import { ensureUser, runJiraSync } from './services/jira/sync'

const app = Fastify({ logger: { transport: { target: 'pino-pretty' } } })

app.setErrorHandler((error, _request, reply) => {
  if (error instanceof ZodError) {
    return reply.code(400).send({ error: 'Neplatný požadavek', details: error.flatten() })
  }
  if ((error as { code?: string }).code === 'P2025') {
    return reply.code(404).send({ error: 'Záznam nenalezen' })
  }

  app.log.error(error)
  return reply.code(500).send({ error: (error as Error).message })
})

await app.register(cors, { origin: true })

app.get('/healthz', async () => {
  await prisma.$queryRaw`SELECT 1`
  return { ok: true }
})

await app.register(meRoutes)
await app.register(issuesRoutes)
await app.register(weekRoutes)
await app.register(assignmentRoutes)
await app.register(calendarRoutes)

let schedulerStarted = false

/** The API must come up even when JIRA is unreachable, so bootstrap runs detached. */
async function bootstrap(): Promise<void> {
  try {
    const user = await ensureUser()
    app.log.info(`User ${user.jiraUsername} ready`)

    await ensureEnvIcsSource(user.id)
    if (!schedulerStarted) {
      startScheduler((message) => app.log.info(message))
      schedulerStarted = true
    }

    const jira = await runJiraSync({ full: true })
    app.log.info(`Initial JIRA sync: ${jira.ok ? `${jira.full} issues` : jira.error}`)

    const calendar = await runCalendarSync()
    app.log.info(`Initial calendar sync: ${calendar.sources.length} sources`)
  } catch (err) {
    app.log.error(`Bootstrap failed, retrying in 60s: ${(err as Error).message}`)
    setTimeout(() => void bootstrap(), 60_000)
  }
}

await app.listen({ port: env.PORT, host: '0.0.0.0' })
void bootstrap()
