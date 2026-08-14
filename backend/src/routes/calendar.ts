import crypto from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { keyToDbDate, localDayStart, startOfIsoWeek } from '../lib/dates'
import { prisma } from '../lib/prisma'
import { syncCalendarSource } from '../services/calendar/sync'
import { buildWeek } from '../services/week'
import { currentUser } from './context'

const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

const sourceSchema = z.object({
  name: z.string().min(1).max(100),
  url: z.string().url(),
  allDayPolicy: z.enum(['SMART', 'IGNORE', 'FULL_DAY']).optional(),
  countTentative: z.boolean().optional(),
})

const sourcePatchSchema = sourceSchema.partial().extend({ enabled: z.boolean().optional() })

const manualEventSchema = z.object({
  date: dateKey,
  title: z.string().min(1).max(200),
  startTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .default('09:00'),
  minutes: z
    .number()
    .int()
    .min(15)
    .max(24 * 60),
})

const eventPatchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  minutes: z
    .number()
    .int()
    .min(0)
    .max(24 * 60)
    .optional(),
  countsToCapacity: z.boolean().optional(),
})

export async function calendarRoutes(app: FastifyInstance) {
  app.get('/api/calendar/sources', async (request) => {
    const user = await currentUser(request)
    return prisma.calendarSource.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        name: true,
        url: true,
        kind: true,
        enabled: true,
        allDayPolicy: true,
        countTentative: true,
        lastSuccessAt: true,
        lastFetchedAt: true,
        lastError: true,
        eventCount: true,
      },
    })
  })

  app.post('/api/calendar/sources', async (request, reply) => {
    const user = await currentUser(request)
    const body = sourceSchema.parse(request.body)

    const source = await prisma.calendarSource.create({
      data: {
        userId: user.id,
        kind: 'ICS_URL',
        name: body.name,
        url: body.url,
        allDayPolicy: body.allDayPolicy ?? 'SMART',
        countTentative: body.countTentative ?? true,
      },
    })

    const result = await syncCalendarSource(source)
    reply.code(201)
    return { source: await prisma.calendarSource.findUnique({ where: { id: source.id } }), sync: result }
  })

  app.patch('/api/calendar/sources/:id', async (request) => {
    const user = await currentUser(request)
    const { id } = z.object({ id: z.string() }).parse(request.params)
    const body = sourcePatchSchema.parse(request.body)

    await prisma.calendarSource.findFirstOrThrow({ where: { id, userId: user.id } })
    return prisma.calendarSource.update({
      where: { id },
      // A changed URL invalidates the cached body hash, otherwise the next sync would skip it.
      data: { ...body, ...(body.url ? { contentHash: null, etag: null, lastModified: null } : {}) },
    })
  })

  app.delete('/api/calendar/sources/:id', async (request) => {
    const user = await currentUser(request)
    const { id } = z.object({ id: z.string() }).parse(request.params)

    await prisma.calendarSource.findFirstOrThrow({ where: { id, userId: user.id } })
    await prisma.calendarSource.delete({ where: { id } })
    return { ok: true }
  })

  app.post('/api/calendar/sources/:id/sync', async (request) => {
    const user = await currentUser(request)
    const { id } = z.object({ id: z.string() }).parse(request.params)

    const source = await prisma.calendarSource.findFirstOrThrow({ where: { id, userId: user.id } })
    return syncCalendarSource(source)
  })

  app.post('/api/calendar/events', async (request, reply) => {
    const user = await currentUser(request)
    const body = manualEventSchema.parse(request.body)

    const [hours, minutes] = body.startTime.split(':').map(Number)
    const startsAt = new Date(localDayStart(body.date).getTime() + (hours * 60 + minutes) * 60000)
    const endsAt = new Date(startsAt.getTime() + body.minutes * 60000)

    await prisma.calendarEvent.create({
      data: {
        userId: user.id,
        sourceId: null,
        uid: `manual-${crypto.randomUUID()}`,
        title: body.title,
        startsAt,
        endsAt,
        localDate: keyToDbDate(body.date),
        busyStatus: 'BUSY',
        countsToCapacity: true,
        manual: true,
      },
    })

    reply.code(201)
    return { week: await buildWeek(user.id, startOfIsoWeek(body.date)) }
  })

  app.patch('/api/calendar/events/:id', async (request) => {
    const user = await currentUser(request)
    const { id } = z.object({ id: z.string() }).parse(request.params)
    const body = eventPatchSchema.parse(request.body)

    const event = await prisma.calendarEvent.findFirstOrThrow({ where: { id, userId: user.id } })

    await prisma.calendarEvent.update({
      where: { id },
      data: {
        countsToCapacity: body.countsToCapacity,
        ...(body.title && event.manual ? { title: body.title } : {}),
        ...(body.minutes != null
          ? event.manual
            ? { endsAt: new Date(event.startsAt.getTime() + body.minutes * 60000) }
            : { overrideMinutes: body.minutes }
          : {}),
      },
    })

    return { week: await buildWeek(user.id, startOfIsoWeek(event.startsAt.toISOString().slice(0, 10))) }
  })

  app.delete('/api/calendar/events/:id', async (request, reply) => {
    const user = await currentUser(request)
    const { id } = z.object({ id: z.string() }).parse(request.params)

    const event = await prisma.calendarEvent.findFirstOrThrow({ where: { id, userId: user.id } })
    if (!event.manual) {
      reply.code(400)
      return { error: 'Události z kalendáře se mažou v Outlooku, ne tady. Můžeš ji ale vyřadit z kapacity.' }
    }

    await prisma.calendarEvent.delete({ where: { id } })
    return { week: await buildWeek(user.id, startOfIsoWeek(event.startsAt.toISOString().slice(0, 10))) }
  })

  app.put('/api/days/:date/capacity', async (request) => {
    const user = await currentUser(request)
    const { date } = z.object({ date: dateKey }).parse(request.params)
    const body = z
      .object({
        capacityMinutes: z
          .number()
          .int()
          .min(0)
          .max(24 * 60),
        note: z.string().max(200).nullish(),
      })
      .parse(request.body)

    await prisma.dayOverride.upsert({
      where: { userId_date: { userId: user.id, date: keyToDbDate(date) } },
      create: {
        userId: user.id,
        date: keyToDbDate(date),
        capacityMinutes: body.capacityMinutes,
        note: body.note ?? null,
      },
      update: { capacityMinutes: body.capacityMinutes, note: body.note ?? null },
    })

    return { week: await buildWeek(user.id, startOfIsoWeek(date)) }
  })

  app.delete('/api/days/:date/capacity', async (request) => {
    const user = await currentUser(request)
    const { date } = z.object({ date: dateKey }).parse(request.params)

    await prisma.dayOverride.deleteMany({ where: { userId: user.id, date: keyToDbDate(date) } })
    return { week: await buildWeek(user.id, startOfIsoWeek(date)) }
  })
}
