import { expect, test, type Page } from '@playwright/test'

const API = process.env.E2E_API_URL ?? 'http://localhost:3011'

function isoDate(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function mondayOfThisWeek(): Date {
  const now = new Date()
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
  return monday
}

const dayKey = (offset: number) => {
  const date = mondayOfThisWeek()
  date.setDate(date.getDate() + offset)
  return isoDate(date)
}

/** dnd-kit only starts dragging after the pointer moves past its activation distance. */
async function dragOnto(page: Page, source: string, target: string) {
  const from = await page.getByTestId(source).boundingBox()
  const to = await page.getByTestId(target).boundingBox()
  if (!from || !to) throw new Error(`missing element: ${source} -> ${target}`)

  await page.mouse.move(from.x + from.width / 2, from.y + 20)
  await page.mouse.down()
  await page.mouse.move(from.x + from.width / 2, from.y + 40, { steps: 5 })
  await page.mouse.move(to.x + to.width / 2, to.y + 200, { steps: 20 })
  await page.mouse.up()
}

test.beforeEach(async ({ request }) => {
  const week = await (await request.get(`${API}/api/week`)).json()
  for (const day of week.days) {
    for (const assignment of day.assignments) {
      await request.delete(`${API}/api/assignments/${assignment.id}`)
    }
    for (const event of day.events.filter((item: { manual: boolean }) => item.manual)) {
      await request.delete(`${API}/api/calendar/events/${event.id}`)
    }
  }
})

test('naplánuje task na den a plán přežije reload', async ({ page }) => {
  const wednesday = dayKey(2)
  await page.goto('/')
  await expect(page.getByTestId('issue-WEEK-1')).toBeVisible()

  await dragOnto(page, 'issue-WEEK-1', `day-${wednesday}`)

  const planned = page.getByTestId(`day-${wednesday}`).getByTestId('assignment-WEEK-1')
  await expect(planned).toBeVisible()
  // The estimate is 3 h, so that is what the day should take on.
  await expect(page.getByTestId(`day-${wednesday}`)).toContainText('3 h')

  await page.reload()
  await expect(page.getByTestId(`day-${wednesday}`).getByTestId('assignment-WEEK-1')).toBeVisible()
})

test('přesune naplánovaný task na jiný den', async ({ page }) => {
  const wednesday = dayKey(2)
  const thursday = dayKey(3)
  await page.goto('/')
  await dragOnto(page, 'issue-WEEK-2', `day-${wednesday}`)
  await expect(page.getByTestId(`day-${wednesday}`).getByTestId('assignment-WEEK-2')).toBeVisible()

  await dragOnto(page, 'assignment-WEEK-2', `day-${thursday}`)

  await expect(page.getByTestId(`day-${thursday}`).getByTestId('assignment-WEEK-2')).toBeVisible()
  await expect(page.getByTestId(`day-${wednesday}`).getByTestId('assignment-WEEK-2')).toHaveCount(0)
})

test('odplánování tasku projde (požadavek bez těla)', async ({ page }) => {
  const monday = dayKey(0)
  await page.goto('/')
  await dragOnto(page, 'issue-WEEK-3', `day-${monday}`)

  const card = page.getByTestId(`day-${monday}`).getByTestId('assignment-WEEK-3')
  await expect(card).toBeVisible()

  await card.hover()
  await card.getByTitle('Odplánovat').click()

  await expect(page.getByTestId(`day-${monday}`).getByTestId('assignment-WEEK-3')).toHaveCount(0)
  await page.reload()
  await expect(page.getByTestId(`day-${monday}`).getByTestId('assignment-WEEK-3')).toHaveCount(0)
})

test('kapacita dne klesne o ruční blok režie', async ({ page }) => {
  const tuesday = dayKey(1)
  await page.goto('/')

  const day = page.getByTestId(`day-${tuesday}`)
  await expect(day.getByTestId('capacity')).toContainText('8 h')

  await day.getByTestId('add-overhead').click()
  await day.getByPlaceholder('Název režie').fill('Porada')
  await day.getByPlaceholder('1h').fill('2')
  await day.getByRole('button', { name: 'Přidat' }).click()

  await expect(day.getByTestId('capacity')).toContainText('6 h')
  await expect(day).toContainText('Porada')
})

test('formulář režie jde zavřít bez uložení', async ({ page }) => {
  const tuesday = dayKey(1)
  await page.goto('/')

  const day = page.getByTestId(`day-${tuesday}`)
  await day.getByTestId('add-overhead').click()
  await day.getByPlaceholder('Název režie').fill('Nechci')
  await day.getByTitle('Zrušit (Esc)').click()

  await expect(day.getByPlaceholder('Název režie')).toHaveCount(0)
  await expect(day).not.toContainText('Nechci')
})
