import type { User } from '@prisma/client'
import { addDaysToKey, keyToDbDate, localDateKey, todayKey, type DateKey } from '../../lib/dates'
import { prisma } from '../../lib/prisma'
import { getTempoWorklogs } from './client'

const WINDOW_BACK_DAYS = 75
const WINDOW_FORWARD_DAYS = 7

function windowRange(): { from: DateKey; to: DateKey } {
  const today = todayKey()
  // Reaches back over the previous month so month totals stay correct right after a rollover.
  return { from: addDaysToKey(today, -WINDOW_BACK_DAYS), to: addDaysToKey(today, WINDOW_FORWARD_DAYS) }
}

export async function syncWorklogs(user: User): Promise<number> {
  const { from, to } = windowRange()
  const entries = await getTempoWorklogs(user.jiraUsername, from, to)

  const seen: number[] = []
  for (const entry of entries) {
    if (!entry.issue?.key) continue

    const date = entry.dateStarted.slice(0, 10)
    const data = {
      userId: user.id,
      tempoId: entry.id,
      jiraWorklogId: entry.jiraWorklogId ?? null,
      issueKey: entry.issue.key,
      issueSummary: entry.issue.summary ?? entry.issue.key,
      date: keyToDbDate(date),
      minutes: Math.round(entry.timeSpentSeconds / 60),
      comment: entry.comment?.trim() || null,
      role: entry.worklogAttributes?.find((attribute) => attribute.key === 'Role')?.value ?? null,
      syncedAt: new Date(),
    }

    await prisma.worklog.upsert({ where: { tempoId: entry.id }, create: data, update: data })
    seen.push(entry.id)
  }

  // Worklogs deleted in JIRA have to disappear here too, hence the sweep over the same window.
  await prisma.worklog.deleteMany({
    where: {
      userId: user.id,
      date: { gte: keyToDbDate(from), lte: keyToDbDate(to) },
      ...(seen.length > 0 ? { tempoId: { notIn: seen } } : {}),
    },
  })

  return seen.length
}

export async function loggedThisMonth(userId: string): Promise<{ minutes: number; month: string }> {
  const now = new Date()
  const first = localDateKey(new Date(now.getFullYear(), now.getMonth(), 1))
  const last = localDateKey(new Date(now.getFullYear(), now.getMonth() + 1, 0))

  const result = await prisma.worklog.aggregate({
    where: { userId, date: { gte: keyToDbDate(first), lte: keyToDbDate(last) } },
    _sum: { minutes: true },
  })

  return { minutes: result._sum.minutes ?? 0, month: first.slice(0, 7) }
}
