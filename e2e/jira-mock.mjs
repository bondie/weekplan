import { createServer } from 'node:http'

/**
 * Minimal stand-in for Jira Server + Tempo, so end-to-end tests run offline and always see
 * the same data. Only the endpoints the app actually calls are implemented.
 */

const USER = { key: 'e2e.user', name: 'e2e.user@example.com', displayName: 'E2E User', timeZone: 'Europe/Prague' }

function mondayOfThisWeek() {
  const now = new Date()
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7))
  return monday
}

const monday = mondayOfThisWeek()
const shiftDays = (days, hours = 6) => {
  const date = new Date(monday)
  date.setUTCDate(date.getUTCDate() + days)
  date.setUTCHours(hours)
  return date.toISOString()
}

const SPRINT = {
  id: 100,
  name: 'Sprint 100',
  state: 'active',
  startDate: shiftDays(0, 4),
  endDate: shiftDays(4, 20),
  originBoardId: 1,
}

const sprintField = `com.atlassian.greenhopper.service.sprint.Sprint@1[id=${SPRINT.id},rapidViewId=1,state=ACTIVE,name=${SPRINT.name},startDate=${SPRINT.startDate},endDate=${SPRINT.endDate},completeDate=<null>,goal=]`

const issue = (id, key, summary, minutes, { inSprint = true, status = 'To Do' } = {}) => ({
  id: String(id),
  key,
  fields: {
    summary,
    status: { name: status, statusCategory: { key: status === 'Code Review' ? 'indeterminate' : 'new' } },
    issuetype: { name: 'Service-task', subtask: false },
    project: { key: key.split('-')[0], name: 'Weekplan E2E' },
    priority: { name: 'Medium' },
    assignee: { name: USER.name, displayName: USER.displayName },
    resolution: null,
    duedate: null,
    labels: [],
    updated: shiftDays(0, 8),
    timetracking: {
      originalEstimateSeconds: minutes * 60,
      remainingEstimateSeconds: minutes * 60,
    },
    aggregatetimespent: null,
    customfield_10004: inSprint ? [sprintField] : null,
    customfield_10009: `0|${String(id).padStart(6, '0')}:`,
    customfield_10002: null,
  },
})

const ISSUES = [
  issue(1, 'WEEK-1', 'Naplánovat týden', 180),
  issue(2, 'WEEK-2', 'Opravit export objednávek', 60),
  issue(3, 'WEEK-3', 'Refaktor kalkulace cen', 120),
  issue(9, 'WEEK-9', 'Task v backlogu', 60, { inSprint: false }),
]

const WORKLOGS = [
  {
    id: 5001,
    jiraWorklogId: 5001,
    timeSpentSeconds: 1800,
    dateStarted: `${shiftDays(0).slice(0, 10)}T00:00:00.000`,
    comment: 'Analýza',
    issue: { key: 'WEEK-2', summary: 'Opravit export objednávek' },
    author: { name: USER.name, key: USER.key },
    worklogAttributes: [{ key: 'Role', value: 'BE' }],
  },
]

const send = (res, body) => {
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

const page = (issues) => ({ startAt: 0, maxResults: 100, total: issues.length, issues })

createServer((req, res) => {
  const url = new URL(req.url, 'http://mock')
  const path = url.pathname

  if (path === '/rest/api/2/myself') return send(res, USER)
  if (path === '/rest/api/2/search') return send(res, page(ISSUES))
  if (path.startsWith('/rest/agile/1.0/board/') && path.endsWith('/issue')) return send(res, page(ISSUES))
  if (path.startsWith('/rest/agile/1.0/board/') && path.endsWith('/sprint')) {
    return send(res, { values: [SPRINT], isLast: true })
  }
  if (path.startsWith('/rest/agile/1.0/sprint/')) return send(res, SPRINT)
  if (path.startsWith('/rest/tempo-timesheets/3/worklogs')) return send(res, WORKLOGS)

  const single = path.match(/^\/rest\/api\/2\/issue\/([^/]+)$/)
  if (single) {
    const found = ISSUES.find((item) => item.key === decodeURIComponent(single[1]))
    if (found) return send(res, found)
  }

  res.writeHead(404, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ errorMessages: [`mock: ${path} not implemented`] }))
}).listen(8080, () => console.log('jira mock on :8080'))
