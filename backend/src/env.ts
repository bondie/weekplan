import { z } from 'zod'

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().default(3010),
  JIRA_URL: z.string().url(),
  JIRA_USERNAME: z.string().min(1),
  JIRA_PASSWORD: z.string().min(1),
  JIRA_SYNC_CRON: z.string().default('*/5 * * * *'),
  JIRA_FULL_SYNC_CRON: z.string().default('7 */6 * * *'),
  CALENDAR_SYNC_CRON: z.string().default('*/30 * * * *'),
  ICS_URL: z.string().optional(),
})

const parsed = schema.safeParse(process.env)

if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors)
  process.exit(1)
}

export const env = {
  ...parsed.data,
  JIRA_URL: parsed.data.JIRA_URL.replace(/\/+$/, ''),
  ICS_URL: parsed.data.ICS_URL?.trim() || undefined,
}

export const DEFAULT_JQL = 'assignee = "{user}" AND statusCategory != Done ORDER BY Rank ASC'
