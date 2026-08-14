import cron from 'node-cron'
import { env } from '../env'
import { runCalendarSync } from '../services/calendar/sync'
import { isJiraAuthBlocked, runJiraSync } from '../services/jira/sync'

let jiraRunning = false
let calendarRunning = false

async function safeJiraSync(full: boolean, log: (message: string) => void) {
  if (jiraRunning) return
  // A wrong password must not be retried on a schedule — LDAP accounts lock out.
  if (await isJiraAuthBlocked()) {
    log('JIRA sync skipped: credentials rejected, run a manual sync after fixing them')
    return
  }

  jiraRunning = true
  try {
    const result = await runJiraSync({ full })
    log(
      `JIRA sync ${result.ok ? 'ok' : 'failed'} (hot=${result.hot ?? 0} planned=${result.planned ?? 0} full=${result.full ?? 0})`,
    )
  } finally {
    jiraRunning = false
  }
}

export function startScheduler(log: (message: string) => void) {
  const options = { timezone: 'Europe/Prague' as const }

  cron.schedule(env.JIRA_SYNC_CRON, () => void safeJiraSync(false, log), options)
  cron.schedule(env.JIRA_FULL_SYNC_CRON, () => void safeJiraSync(true, log), options)

  cron.schedule(
    env.CALENDAR_SYNC_CRON,
    () => {
      if (calendarRunning) return
      calendarRunning = true
      void runCalendarSync()
        .then((result) => log(`Calendar sync ${result.ok ? 'ok' : 'failed'} (${result.sources.length} sources)`))
        .finally(() => {
          calendarRunning = false
        })
    },
    options,
  )
}
