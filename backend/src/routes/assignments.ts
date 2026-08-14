import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { keyToDbDate, startOfIsoWeek, type DateKey } from '../lib/dates'
import { prisma } from '../lib/prisma'
import { ensureIssueByKey } from '../services/jira/sync'
import { buildWeek } from '../services/week'
import { currentUser } from './context'

const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

const createSchema = z.object({
  issueKey: z.string().min(1),
  date: dateKey,
  plannedMinutes: z
    .number()
    .int()
    .min(15)
    .max(24 * 60)
    .optional(),
})

const patchSchema = z.object({
  date: dateKey.optional(),
  plannedMinutes: z
    .number()
    .int()
    .min(15)
    .max(24 * 60)
    .optional(),
  note: z.string().max(500).nullable().optional(),
  done: z.boolean().optional(),
})

const splitSchema = z.object({
  date: dateKey,
  minutes: z
    .number()
    .int()
    .min(15)
    .max(24 * 60),
})
const reorderSchema = z.object({ date: dateKey, ids: z.array(z.string()) })

const roundToQuarter = (minutes: number) => Math.max(15, Math.round(minutes / 15) * 15)

function weekParam(request: FastifyRequest, fallback: DateKey): DateKey {
  const week = (request.query as Record<string, unknown> | undefined)?.week
  return typeof week === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(week) ? week : startOfIsoWeek(fallback)
}

async function nextPosition(userId: string, date: DateKey): Promise<number> {
  const last = await prisma.assignment.findFirst({
    where: { userId, date: keyToDbDate(date) },
    orderBy: { position: 'desc' },
  })
  return (last?.position ?? -1) + 1
}

export async function assignmentRoutes(app: FastifyInstance) {
  app.post('/api/assignments', async (request, reply) => {
    const user = await currentUser(request)
    const body = createSchema.parse(request.body)
    const issue = await ensureIssueByKey(body.issueKey)

    const existing = await prisma.assignment.findUnique({
      where: { userId_issueId_date: { userId: user.id, issueId: issue.id, date: keyToDbDate(body.date) } },
    })

    if (existing) {
      if (body.plannedMinutes) {
        await prisma.assignment.update({ where: { id: existing.id }, data: { plannedMinutes: body.plannedMinutes } })
      }
      return { week: await buildWeek(user.id, weekParam(request, body.date)) }
    }

    let minutes = body.plannedMinutes
    if (!minutes) {
      const week = await buildWeek(user.id, body.date)
      const free = week.days.find((day) => day.date === body.date)?.freeMinutes ?? 0
      // A zero remaining estimate means the work was logged, not that it takes no time.
      const estimate = issue.remainingEstimateMin || issue.originalEstimateMin || 120
      minutes = roundToQuarter(free > 0 ? Math.min(estimate, free) : estimate)
    }

    await prisma.assignment.create({
      data: {
        userId: user.id,
        issueId: issue.id,
        issueKeySnapshot: issue.key,
        date: keyToDbDate(body.date),
        plannedMinutes: minutes,
        position: await nextPosition(user.id, body.date),
      },
    })

    reply.code(201)
    return { week: await buildWeek(user.id, weekParam(request, body.date)) }
  })

  app.patch('/api/assignments/:id', async (request) => {
    const user = await currentUser(request)
    const { id } = z.object({ id: z.string() }).parse(request.params)
    const body = patchSchema.parse(request.body)

    const assignment = await prisma.assignment.findFirstOrThrow({ where: { id, userId: user.id } })
    const targetDate = body.date ?? undefined

    if (targetDate && keyToDbDate(targetDate).getTime() !== assignment.date.getTime()) {
      const collision = await prisma.assignment.findUnique({
        where: {
          userId_issueId_date: { userId: user.id, issueId: assignment.issueId, date: keyToDbDate(targetDate) },
        },
      })

      // Moving an issue onto a day where it already sits merges instead of violating the unique key.
      if (collision) {
        await prisma.$transaction([
          prisma.assignment.update({
            where: { id: collision.id },
            data: { plannedMinutes: collision.plannedMinutes + (body.plannedMinutes ?? assignment.plannedMinutes) },
          }),
          prisma.assignment.delete({ where: { id: assignment.id } }),
        ])
        return { week: await buildWeek(user.id, weekParam(request, targetDate)) }
      }

      await prisma.assignment.update({
        where: { id: assignment.id },
        data: { date: keyToDbDate(targetDate), position: await nextPosition(user.id, targetDate) },
      })
    }

    await prisma.assignment.update({
      where: { id: assignment.id },
      data: {
        plannedMinutes: body.plannedMinutes,
        note: body.note,
        done: body.done,
      },
    })

    return {
      week: await buildWeek(user.id, weekParam(request, targetDate ?? assignment.date.toISOString().slice(0, 10))),
    }
  })

  app.post('/api/assignments/:id/split', async (request) => {
    const user = await currentUser(request)
    const { id } = z.object({ id: z.string() }).parse(request.params)
    const body = splitSchema.parse(request.body)

    const assignment = await prisma.assignment.findFirstOrThrow({ where: { id, userId: user.id } })
    const moved = Math.min(body.minutes, assignment.plannedMinutes)
    const remaining = assignment.plannedMinutes - moved

    const target = await prisma.assignment.findUnique({
      where: { userId_issueId_date: { userId: user.id, issueId: assignment.issueId, date: keyToDbDate(body.date) } },
    })

    if (target) {
      await prisma.assignment.update({
        where: { id: target.id },
        data: { plannedMinutes: target.plannedMinutes + moved },
      })
    } else {
      await prisma.assignment.create({
        data: {
          userId: user.id,
          issueId: assignment.issueId,
          issueKeySnapshot: assignment.issueKeySnapshot,
          date: keyToDbDate(body.date),
          plannedMinutes: moved,
          position: await nextPosition(user.id, body.date),
          note: assignment.note,
        },
      })
    }

    if (remaining >= 15) {
      await prisma.assignment.update({ where: { id: assignment.id }, data: { plannedMinutes: remaining } })
    } else {
      await prisma.assignment.delete({ where: { id: assignment.id } })
    }

    return { week: await buildWeek(user.id, weekParam(request, body.date)) }
  })

  app.post('/api/assignments/reorder', async (request) => {
    const user = await currentUser(request)
    const body = reorderSchema.parse(request.body)

    await prisma.$transaction(
      body.ids.map((id, index) =>
        prisma.assignment.updateMany({ where: { id, userId: user.id }, data: { position: index } }),
      ),
    )

    return { week: await buildWeek(user.id, weekParam(request, body.date)) }
  })

  app.delete('/api/assignments/:id', async (request) => {
    const user = await currentUser(request)
    const { id } = z.object({ id: z.string() }).parse(request.params)

    const assignment = await prisma.assignment.findFirstOrThrow({ where: { id, userId: user.id } })
    await prisma.assignment.delete({ where: { id: assignment.id } })

    return { week: await buildWeek(user.id, weekParam(request, assignment.date.toISOString().slice(0, 10))) }
  })
}
