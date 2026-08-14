export interface Issue {
  key: string
  summary: string
  status: string
  statusCategory: string
  issueType: string
  projectKey: string
  projectName: string
  priority: string | null
  originalEstimateMin: number | null
  remainingEstimateMin: number | null
  timeSpentMin: number | null
  sprintId: number | null
  sprintName: string | null
  sprintState: string | null
  dueDate: string | null
  isResolved: boolean
  isOrphaned: boolean
  assigneeUsername: string | null
  assigneeName: string | null
  url: string
  plannedMinutes: number
}

export interface CalendarEventItem {
  id: string
  title: string
  startsAt: string
  endsAt: string
  allDay: boolean
  busyStatus: string
  countsToCapacity: boolean
  manual: boolean
  minutes: number
}

export interface Assignment {
  id: string
  issueKey: string
  plannedMinutes: number
  position: number
  note: string | null
  done: boolean
  issue: Issue | null
}

export interface Day {
  date: string
  weekday: number
  isToday: boolean
  isWorkingDay: boolean
  holiday: string | null
  capacityMinutes: number
  overheadMinutes: number
  overheadRawMinutes: number
  availableMinutes: number
  plannedMinutes: number
  freeMinutes: number
  overbookedMinutes: number
  blockedAllDay: boolean
  loggedMinutes: number
  loggedOverheadMinutes: number
  override: { capacityMinutes: number; note: string | null } | null
  events: CalendarEventItem[]
  assignments: Assignment[]
  worklogs: WorklogItem[]
}

export interface Sprint {
  id: number
  name: string
  startDate: string | null
  endDate: string | null
}

export interface Week {
  weekStart: string
  weekEnd: string
  isoWeek: number
  isoYear: number
  today: string
  showWeekend: boolean
  days: Day[]
  totals: {
    capacityMinutes: number
    overheadMinutes: number
    plannedMinutes: number
    freeMinutes: number
    overbookedMinutes: number
  }
  sprintsForWeek: Sprint[]
  activeSprints: Sprint[]
  nextSprint: Sprint | null
}

export interface SprintOption extends Sprint {
  state: string
  count: number
}

export interface IssueList {
  issues: Issue[]
  sprints: SprintOption[]
  noSprintCount: number
  hiddenCount: number
  selected: string[]
  projects: Array<{ key: string; count: number }>
}

export interface Me {
  id: string
  jiraUsername: string
  displayName: string
  email: string | null
  dailyCapacityMinutes: number
  workingDays: number[]
  showWeekend: boolean
  jql: string | null
  ignoredProjects: string[]
  overheadProject: string | null
  defaultJql: string
  effectiveJql: string
  timezone: string
}

export interface CalendarSource {
  id: string
  name: string
  url: string | null
  kind: string
  enabled: boolean
  allDayPolicy: string
  countTentative: boolean
  lastSuccessAt: string | null
  lastFetchedAt: string | null
  lastError: string | null
  eventCount: number
}

export interface Workload {
  remainingMinutes: number
  sprintMinutes: number
  backlogMinutes: number
  issueCount: number
  withoutEstimateCount: number
  loggedThisMonthMinutes: number
  month: string
}

export interface WorklogItem {
  id: string
  issueKey: string
  issueSummary: string
  minutes: number
  comment: string | null
  role: string | null
  isOverhead: boolean
}

export interface SyncStatus {
  jira: {
    ok: boolean
    at: string
    hot?: number
    planned?: number
    full?: number
    error?: string
    authFailed?: boolean
  } | null
  calendar: { ok: boolean; at: string; sources: Array<{ name: string; ok: boolean; error?: string }> } | null
  sources: Array<{
    id: string
    name: string
    enabled: boolean
    lastSuccessAt: string | null
    lastError: string | null
    eventCount: number
  }>
}
