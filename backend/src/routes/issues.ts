import type { Prisma } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { serializeIssue } from '../services/week'
import { currentUser } from './context'

const SCOPES = ['sprint', 'future', 'backlog', 'all'] as const
type Scope = (typeof SCOPES)[number]

const querySchema = z.object({
  scope: z.enum(SCOPES).default('sprint'),
  q: z.string().trim().optional(),
  project: z.string().trim().optional(),
})

function scopeFilter(scope: Scope): Prisma.IssueWhereInput {
  if (scope === 'sprint') return { sprint: { state: 'ACTIVE' } }
  if (scope === 'future') return { sprint: { state: 'FUTURE' } }
  if (scope === 'backlog') return { OR: [{ sprintId: null }, { sprint: { state: 'CLOSED' } }] }
  return {}
}

export async function issuesRoutes(app: FastifyInstance) {
  app.get('/api/issues', async (request) => {
    const user = await currentUser(request)
    const { scope, q, project } = querySchema.parse(request.query)

    const base: Prisma.IssueWhereInput = {
      assigneeUsername: user.jiraUsername,
      isResolved: false,
      isOrphaned: false,
    }

    const where: Prisma.IssueWhereInput = {
      ...base,
      ...scopeFilter(scope),
      ...(project ? { projectKey: project } : {}),
      ...(q
        ? { OR: [{ summary: { contains: q, mode: 'insensitive' } }, { key: { contains: q, mode: 'insensitive' } }] }
        : {}),
    }

    const [issues, counts, projects] = await Promise.all([
      prisma.issue.findMany({
        where,
        include: { sprint: true },
        orderBy: [{ rank: { sort: 'asc', nulls: 'last' } }, { key: 'asc' }],
        take: 300,
      }),
      Promise.all(
        SCOPES.map(
          async (name) => [name, await prisma.issue.count({ where: { ...base, ...scopeFilter(name) } })] as const,
        ),
      ),
      prisma.issue.groupBy({ by: ['projectKey'], where: base, _count: { _all: true } }),
    ])

    const planned = await prisma.assignment.groupBy({
      by: ['issueId'],
      where: { userId: user.id, issueId: { in: issues.map((issue) => issue.id) } },
      _sum: { plannedMinutes: true },
    })
    const plannedByIssue = new Map(planned.map((row) => [row.issueId, row._sum.plannedMinutes ?? 0]))

    return {
      issues: issues.map((issue) => serializeIssue(issue, plannedByIssue.get(issue.id) ?? 0)),
      counts: Object.fromEntries(counts),
      projects: projects
        .map((row) => ({ key: row.projectKey, count: row._count._all }))
        .sort((a, b) => b.count - a.count),
    }
  })
}
