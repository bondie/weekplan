import { expect, test } from '@playwright/test'

const API = process.env.E2E_API_URL ?? 'http://localhost:3011'

test('tlačítko Sync opravdu synchronizuje', async ({ page, request }) => {
  // Regression: the client used to send a JSON content type without a body, which Fastify
  // rejects — the button spun and nothing happened.
  const before = await (await request.get(`${API}/api/sync/status`)).json()

  await page.goto('/')
  await page.getByRole('button', { name: 'Sync' }).click()

  await expect
    .poll(
      async () => {
        const status = await (await request.get(`${API}/api/sync/status`)).json()
        return status.jira?.at !== before.jira?.at && status.calendar?.at !== before.calendar?.at
      },
      { timeout: 25_000 },
    )
    .toBe(true)

  const after = await (await request.get(`${API}/api/sync/status`)).json()
  expect(after.jira.ok).toBe(true)
})

test('skrytý task zmizí z panelu a jde vrátit', async ({ page }) => {
  await page.goto('/')

  const card = page.getByTestId('issue-WEEK-9')

  // WEEK-9 sits in the backlog, so tick it in the sprint picker first.
  await page.getByTestId('sprint-picker').click()
  await page.getByTestId('sprint-option-none').click()
  await expect(card).toBeVisible()
  await page.getByTestId('sprint-picker').click()
  await card.hover()
  await card.getByTitle('Skrýt z nabídky').click()
  await expect(page.getByTestId('issue-WEEK-9')).toHaveCount(0)

  await page.getByRole('button', { name: /skryté/ }).click()
  const hidden = page.getByTestId('issue-WEEK-9')
  await expect(hidden).toBeVisible()
  await hidden.hover()
  await hidden.getByTitle('Vrátit do nabídky').click()
  await expect(page.getByTestId('issue-WEEK-9')).toHaveCount(0)
})

test('vykázaný čas z Tempa je vidět u dne', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('Vykázáno').first()).toBeVisible()
  await expect(page.getByText('WEEK-2').first()).toBeVisible()
})
