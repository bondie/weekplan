import { request } from '@playwright/test'

const API = process.env.E2E_API_URL ?? 'http://localhost:3011'

/**
 * The API syncs from the mock on boot. Waiting for the cached issues to appear keeps the tests
 * from racing that first sync, and forcing a sync makes reruns against a warm database honest.
 */
export default async function globalSetup() {
  const api = await request.newContext({ baseURL: API })
  const deadline = Date.now() + 120_000

  while (Date.now() < deadline) {
    try {
      const sync = await api.post('/api/sync/jira?full=1')
      if (sync.ok()) {
        const issues = await (await api.get('/api/issues')).json()
        if (issues.issues?.length > 0) {
          await api.dispose()
          return
        }
      }
    } catch {
      // API still starting
    }
    await new Promise((resolve) => setTimeout(resolve, 2000))
  }

  await api.dispose()
  throw new Error(`Weekplan API at ${API} did not become ready with mock data in time`)
}
