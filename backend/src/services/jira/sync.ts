import type { Prisma, User } from '@prisma/client'
import { DEFAULT_JQL, env } from '../../env'
import { addDaysToKey, keyToDbDate, todayKey } from '../../lib/dates'
import { prisma } from '../../lib/prisma'
import { JiraError, getIssue, getMyself, searchBoardIssues, searchIssues, type JiraIssue } from './client'
import { extractSprintIds, pickSprintId, resolveSprints, syncBoardSprints } from './sprint'
import { syncWorklogs } from './worklogs'

const HOT_JQL =
  'assignee = "{user}" AND statusCategory != Done AND (sprint in openSprints() OR updated >= -7d) ORDER BY Rank ASC'

const toMinutes = (seconds?: number | null) => (seconds == null ? null : Math.round(seconds / 60))

export function buildJql(user: Pick<User, 'jiraUsername' | 'jql'>, template?: string): string {
  const jql = template ?? user.jql ?? DEFAULT_JQL
  return jql.replaceAll('{user}', user.jiraUsername).replaceAll('currentUser()', `"${user.jiraUsername}"`)
}

function mapIssue(issue: JiraIssue) {
  const f = issue.fields
  const statusCategory: string = f.status?.statusCategory?.key ?? 'new'

  return {
    jiraId: issue.id,
    key: issue.key,
    summary: f.summary ?? issue.key,
    status: f.status?.name ?? 'Unknown',
    statusCategory,
    issueType: f.issuetype?.name ?? 'Task',
    isSubtask: f.issuetype?.subtask === true,
    projectKey: f.project?.key ?? issue.key.split('-')[0],
    projectName: f.project?.name ?? '',
    priority: f.priority?.name ?? null,
    assigneeUsername: f.assignee?.name ?? null,
    assigneeName: f.assignee?.displayName ?? null,
    originalEstimateMin: toMinutes(f.timetracking?.originalEstimateSeconds ?? f.timeoriginalestimate),
    remainingEstimateMin: toMinutes(f.timetracking?.remainingEstimateSeconds ?? f.timeestimate),
    timeSpentMin: toMinutes(f.aggregatetimespent),
    storyPoints: typeof f.customfield_10002 === 'number' ? f.customfield_10002 : null,
    rank: typeof f.customfield_10009 === 'string' ? f.customfield_10009 : null,
    dueDate: f.duedate ? keyToDbDate(f.duedate) : null,
    isResolved: statusCategory === 'done' || Boolean(f.resolution),
    labels: Array.isArray(f.labels) ? f.labels : [],
    url: `${env.JIRA_URL}/browse/${issue.key}`,
    jiraUpdatedAt: f.updated ? new Date(f.updated) : null,
    lastSeenAt: new Date(),
    syncedAt: new Date(),
    isOrphaned: false,
  }
}

async function upsertIssues(issues: JiraIssue[]): Promise<number> {
  if (issues.length === 0) return 0

  const sprintIds = [...new Set(issues.flatMap((issue) => extractSprintIds(issue.fields.customfield_10004)))]
  const sprints = await resolveSprints(sprintIds)

  let count = 0
  for (const issue of issues) {
    const sprintId = pickSprintId(extractSprintIds(issue.fields.customfield_10004), sprints)
    const base = mapIssue(issue)
    const create: Prisma.IssueCreateInput = sprintId ? { ...base, sprint: { connect: { id: sprintId } } } : base
    const { jiraId, ...rest } = base
    const update: Prisma.IssueUpdateInput = {
      ...rest,
      sprint: sprintId ? { connect: { id: sprintId } } : { disconnect: true },
    }

    try {
      await prisma.issue.upsert({ where: { jiraId: issue.id }, create, update })
    } catch (err) {
      // An issue moved between projects reuses a key that another cached row still holds.
      if ((err as Prisma.PrismaClientKnownRequestError).code !== 'P2002') throw err
      await prisma.issue.deleteMany({ where: { key: issue.key, jiraId: { not: issue.id } } })
      await prisma.issue.upsert({ where: { jiraId: issue.id }, create, update })
    }
    count += 1
  }

  return count
}

/** Scoping to a board makes the panel show exactly what JIRA's board shows, backlog included. */
function searchForUser(user: User, jql: string, maxTotal: number) {
  return user.boardId ? searchBoardIssues(user.boardId, jql, maxTotal) : searchIssues(jql, maxTotal)
}

/** Sprint issues and anything touched in the last week — cheap enough to run every few minutes. */
export async function syncHot(user: User): Promise<number> {
  return upsertIssues(await searchForUser(user, buildJql(user, HOT_JQL), 300))
}

/**
 * Refresh issues that are already on the board by key, not by filter — that is the only way
 * to notice an issue was finished, reassigned or moved after it dropped out of the query.
 */
export async function syncPlanned(user: User): Promise<number> {
  const from = keyToDbDate(addDaysToKey(todayKey(), -21))
  const to = keyToDbDate(addDaysToKey(todayKey(), 60))

  const assignments = await prisma.assignment.findMany({
    where: { userId: user.id, date: { gte: from, lte: to } },
    select: { issue: { select: { key: true } } },
  })

  const keys = [...new Set(assignments.map((a) => a.issue.key))]
  if (keys.length === 0) return 0

  let count = 0
  for (let i = 0; i < keys.length; i += 100) {
    const chunk = keys.slice(i, i + 100).map((key) => `"${key}"`)
    count += await upsertIssues(await searchIssues(`key in (${chunk.join(',')})`, 100))
  }

  return count
}

/** Full working set. Only this tier may flag issues as orphaned. */
export async function syncFull(user: User): Promise<number> {
  const startedAt = new Date()
  const count = await upsertIssues(await searchForUser(user, buildJql(user), 2000))
  await syncBoardSprints()

  if (count > 0) {
    await prisma.issue.updateMany({
      where: { assigneeUsername: user.jiraUsername, lastSeenAt: { lt: startedAt }, isOrphaned: false },
      data: { isOrphaned: true },
    })
  }

  return count
}

/** Planning an issue that is not cached yet (deep link, stale panel) must still work. */
export async function ensureIssueByKey(key: string) {
  const cached = await prisma.issue.findUnique({ where: { key } })
  if (cached) return cached

  const fetched = await getIssue(key)
  await upsertIssues([fetched])
  return prisma.issue.findUniqueOrThrow({ where: { jiraId: fetched.id } })
}

export async function ensureUser(): Promise<User> {
  const myself = await getMyself()
  const existing = await prisma.user.findUnique({ where: { jiraKey: myself.key } })

  if (existing) {
    return prisma.user.update({
      where: { id: existing.id },
      data: {
        jiraUsername: myself.name,
        displayName: myself.displayName,
        email: myself.emailAddress ?? null,
      },
    })
  }

  return prisma.user.create({
    data: {
      jiraKey: myself.key,
      jiraUsername: myself.name,
      displayName: myself.displayName,
      email: myself.emailAddress ?? null,
      timezone: myself.timeZone ?? 'Europe/Prague',
    },
  })
}

export interface JiraSyncResult {
  ok: boolean
  at: string
  hot?: number
  planned?: number
  full?: number
  worklogs?: number
  error?: string
  authFailed?: boolean
}

export async function runJiraSync(options: { full?: boolean } = {}): Promise<JiraSyncResult> {
  const result: JiraSyncResult = { ok: true, at: new Date().toISOString() }

  try {
    const users = await prisma.user.findMany({ where: { isActive: true } })
    result.hot = 0
    result.planned = 0
    result.full = 0
    result.worklogs = 0

    for (const user of users) {
      if (options.full) result.full += await syncFull(user)
      else result.hot += await syncHot(user)
      result.planned += await syncPlanned(user)
      result.worklogs += await syncWorklogs(user)
    }
  } catch (err) {
    result.ok = false
    result.error = (err as Error).message
    result.authFailed = err instanceof JiraError && err.isAuthError
  }

  await prisma.syncState.upsert({
    where: { key: 'jira' },
    create: { key: 'jira', value: result as unknown as Prisma.InputJsonValue },
    update: { value: result as unknown as Prisma.InputJsonValue },
  })

  return result
}

/** Credentials are wrong until a manual sync proves otherwise; retrying on a cron could lock the account. */
export async function isJiraAuthBlocked(): Promise<boolean> {
  const state = await prisma.syncState.findUnique({ where: { key: 'jira' } })
  return Boolean((state?.value as JiraSyncResult | undefined)?.authFailed)
}
