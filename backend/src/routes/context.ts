import type { FastifyRequest } from 'fastify'
import type { User } from '@prisma/client'
import { prisma } from '../lib/prisma'

/**
 * Single-user UI today, multi-user data model already. Resolution goes through here so
 * adding a user switcher (or auth) later touches this function only.
 */
export async function currentUser(request: FastifyRequest): Promise<User> {
  const requested = request.headers['x-user-id']

  if (typeof requested === 'string' && requested) {
    const user = await prisma.user.findUnique({ where: { id: requested } })
    if (user) return user
  }

  const user = await prisma.user.findFirst({ where: { isActive: true }, orderBy: { createdAt: 'asc' } })
  if (!user) throw new Error('No user provisioned yet — JIRA sync has not run')
  return user
}
