import { test, expect } from '@playwright/test'
import { provisionTenantViaApi, tenantBaseUrl } from './helpers/tenant'
import { loginViaUi, useEnglish } from './helpers/ui'

// K-57 core flow 4: built-in module CRUD after login — TASKS project → task
// on the Kanban board; NOTES: K-47 sample note + a freshly created note.
test.setTimeout(120_000)

test('TASKS project + Kanban task; note in the NOTES module', async ({ page, request }) => {
  await useEnglish(page)
  const tenant = await provisionTenantViaApi(request)
  const base = tenantBaseUrl(tenant)

  await loginViaUi(page, tenant)
  await expect(page.getByText('Getting Started')).toBeVisible()

  // --- TASKS module: create a project via the modal
  await page.getByRole('button', { name: '+ New Project' }).click()
  await page.getByPlaceholder('e.g. Sprint Board').fill('E2E Board')
  await page.getByRole('combobox').click()
  await page.getByRole('option', { name: 'Tasks — task board' }).click()
  await page.getByRole('button', { name: 'Create', exact: true }).click()

  // Create navigates to the project detail (Kanban)
  await expect(page.getByRole('button', { name: '+ New Task' })).toBeVisible()

  // --- Task appears on the board
  await page.getByRole('button', { name: '+ New Task' }).click()
  await page.getByPlaceholder('What needs doing?').fill('First E2E task')
  await page.getByRole('button', { name: 'Create', exact: true }).click()
  await expect(page.getByText('First E2E task')).toBeVisible()

  // --- NOTES module: K-47 sample note + create one of our own
  await page.goto(`${base}/notes`)
  await expect(page.getByText('Welcome to Notes')).toBeVisible()

  await page.getByRole('button', { name: '+ New Note' }).click()
  await page.getByPlaceholder('e.g. Meeting notes').fill('E2E note')
  await page.getByPlaceholder('Write markdown…').fill('Hello **E2E**')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('Note saved')).toBeVisible()

  // Editor moved to /notes/{id}; the list shows the new note
  await page.goto(`${base}/notes`)
  await expect(page.getByRole('link', { name: 'E2E note' })).toBeVisible()
})
