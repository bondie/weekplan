import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { todayKey } from '../lib/dates'
import { buildWeek } from '../services/week'
import { currentUser } from './context'

const querySchema = z.object({
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
})

export async function weekRoutes(app: FastifyInstance) {
  app.get('/api/week', async (request) => {
    const user = await currentUser(request)
    const { from } = querySchema.parse(request.query)
    return buildWeek(user.id, from ?? todayKey())
  })
}
