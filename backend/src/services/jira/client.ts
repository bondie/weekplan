import { env } from '../../env'

const AUTH = 'Basic ' + Buffer.from(`${env.JIRA_USERNAME}:${env.JIRA_PASSWORD}`).toString('base64')

export class JiraError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message)
    this.name = 'JiraError'
  }

  get isAuthError(): boolean {
    return this.status === 401 || this.status === 403
  }
}

/** Credentials must never reach logs or API responses. */
export function redact(text: string): string {
  return text.split(env.JIRA_PASSWORD).join('***').split(AUTH).join('***')
}

async function jiraFetch<T>(path: string, init: RequestInit = {}, attempt = 0): Promise<T> {
  try {
    const res = await fetch(`${env.JIRA_URL}${path}`, {
      ...init,
      headers: {
        Authorization: AUTH,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
      signal: AbortSignal.timeout(60_000),
    })

    // Never retry auth failures: repeated attempts can lock an LDAP/AD account.
    if (res.status === 401 || res.status === 403) {
      throw new JiraError(`JIRA rejected credentials (${res.status}) on ${path}`, res.status)
    }
    if (res.status >= 500 && attempt < 2) {
      await sleep(1000 * (attempt + 1))
      return jiraFetch<T>(path, init, attempt + 1)
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new JiraError(`JIRA ${res.status} on ${path}: ${redact(body).slice(0, 300)}`, res.status)
    }

    return (await res.json()) as T
  } catch (err) {
    if (err instanceof JiraError) throw err
    if (attempt < 2) {
      await sleep(1000 * (attempt + 1))
      return jiraFetch<T>(path, init, attempt + 1)
    }
    throw new JiraError(`JIRA unreachable (${path}): ${redact((err as Error).message)}`)
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export interface JiraMyself {
  key: string
  name: string
  displayName: string
  emailAddress?: string
  timeZone?: string
}

export function getMyself(): Promise<JiraMyself> {
  return jiraFetch<JiraMyself>('/rest/api/2/myself')
}

export const ISSUE_FIELDS = [
  'summary',
  'status',
  'issuetype',
  'project',
  'priority',
  'assignee',
  'resolution',
  'duedate',
  'labels',
  'updated',
  'timetracking',
  'timeoriginalestimate',
  'timeestimate',
  'aggregatetimespent',
  'customfield_10004', // Sprint
  'customfield_10009', // Rank
  'customfield_10002', // Story Points
]

export interface JiraIssue {
  id: string
  key: string
  fields: Record<string, any>
}

interface SearchResponse {
  startAt: number
  maxResults: number
  total: number
  issues: JiraIssue[]
}

/** maxTotal guards against an accidental JQL that would page through the whole instance. */
export async function searchIssues(jql: string, maxTotal = 2000): Promise<JiraIssue[]> {
  const issues: JiraIssue[] = []
  let startAt = 0

  while (issues.length < maxTotal) {
    const page = await jiraFetch<SearchResponse>('/rest/api/2/search', {
      method: 'POST',
      body: JSON.stringify({ jql, startAt, maxResults: 100, fields: ISSUE_FIELDS }),
    })
    issues.push(...page.issues)
    startAt += page.issues.length
    if (page.issues.length === 0 || startAt >= page.total) break
    await sleep(250) // shared production JIRA — keep paging polite
  }

  return issues
}

/**
 * Same query, but limited to what a board shows. JIRA's own backlog is a board view, so this is
 * the only way to make the panel match what the user sees in JIRA.
 */
export async function searchBoardIssues(boardId: number, jql: string, maxTotal = 2000): Promise<JiraIssue[]> {
  const issues: JiraIssue[] = []
  let startAt = 0

  while (issues.length < maxTotal) {
    const params = new URLSearchParams({
      jql,
      startAt: String(startAt),
      maxResults: '100',
      fields: ISSUE_FIELDS.join(','),
    })
    const page = await jiraFetch<SearchResponse>(`/rest/agile/1.0/board/${boardId}/issue?${params}`)

    issues.push(...page.issues)
    startAt += page.issues.length
    if (page.issues.length === 0 || startAt >= page.total) break
    await sleep(250)
  }

  return issues
}

export function getIssue(key: string): Promise<JiraIssue> {
  return jiraFetch<JiraIssue>(`/rest/api/2/issue/${encodeURIComponent(key)}?fields=${ISSUE_FIELDS.join(',')}`)
}

export interface JiraSprint {
  id: number
  name?: string
  state?: string
  startDate?: string
  endDate?: string
  completeDate?: string
  originBoardId?: number
}

export function getSprint(id: number): Promise<JiraSprint> {
  return jiraFetch<JiraSprint>(`/rest/agile/1.0/sprint/${id}`)
}

export interface TempoWorklog {
  id: number
  jiraWorklogId?: number
  timeSpentSeconds: number
  dateStarted: string
  comment?: string
  issue?: { key?: string; summary?: string }
  author?: { name?: string; key?: string }
  worklogAttributes?: Array<{ key?: string; value?: string }>
}

/** Tempo v3 answers "what did this person log between these dates"; core JIRA cannot. */
export function getTempoWorklogs(username: string, from: string, to: string): Promise<TempoWorklog[]> {
  const params = new URLSearchParams({ dateFrom: from, dateTo: to, username })
  return jiraFetch<TempoWorklog[]>(`/rest/tempo-timesheets/3/worklogs?${params}`)
}

/** Upcoming sprints exist before any issue is moved into them, so they come from the board. */
export async function getBoardSprints(boardId: number): Promise<JiraSprint[]> {
  const sprints: JiraSprint[] = []
  let startAt = 0

  for (;;) {
    const page = await jiraFetch<{ values: JiraSprint[]; isLast: boolean }>(
      `/rest/agile/1.0/board/${boardId}/sprint?state=active,future&startAt=${startAt}&maxResults=50`,
    )
    sprints.push(...page.values)
    startAt += page.values.length
    if (page.isLast || page.values.length === 0) break
  }

  return sprints
}
