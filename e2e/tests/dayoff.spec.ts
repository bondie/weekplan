import { expect, test } from '@playwright/test'

const API = process.env.E2E_API_URL ?? 'http://localhost:3011'

function dayKey(offset: number): string {
  const now = new Date()
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7) + offset)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${monday.getFullYear()}-${pad(monday.getMonth() + 1)}-${pad(monday.getDate())}`
}

test.afterEach(async ({ request }) => {
  await request.delete(`${API}/api/days/${dayKey(3)}/capacity`)
})

test('dovolená je na dni jasně vidět', async ({ page }) => {
  const thursday = dayKey(3)
  await page.goto('/')

  const day = page.getByTestId(`day-${thursday}`)
  await expect(day.getByTestId('capacity')).toContainText('8 h')

  await day.getByTestId('day-off-menu').click()
  await page.getByRole('button', { name: 'Dovolená' }).click()

  await expect(day).toContainText('Dovolená')
  await expect(day.getByTestId('capacity')).toContainText('nepracuji')

  await page.reload()
  await expect(page.getByTestId(`day-${thursday}`)).toContainText('Dovolená')
})

test('plná kapacita dovolenou zruší', async ({ page }) => {
  const thursday = dayKey(3)
  await page.goto('/')

  const day = page.getByTestId(`day-${thursday}`)
  await day.getByTestId('day-off-menu').click()
  await page.getByRole('button', { name: 'Dovolená' }).click()
  await expect(day.getByTestId('capacity')).toContainText('nepracuji')

  await day.getByTestId('day-off-menu').click()
  await page.getByRole('button', { name: 'Plná kapacita' }).click()

  await expect(day.getByTestId('capacity')).toContainText('8 h')
  await expect(day).not.toContainText('Dovolená')
})
