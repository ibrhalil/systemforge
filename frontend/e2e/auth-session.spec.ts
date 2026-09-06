import { test, expect } from '@playwright/test'
import { provisionTenantViaApi, tenantBaseUrl } from './helpers/tenant'
import { loginViaUi, useEnglish } from './helpers/ui'

// K-57 core flow 2: cookie session lifecycle — reload keeps the session,
// logout ends it. The wrong-password check runs on its OWN throwaway tenant:
// 5 failed logins lock the account for 15 min (lockout trap).
test.setTimeout(90_000)

test('login → reload keeps session → logout redirects to /login', async ({ page, request }) => {
  await useEnglish(page)
  const tenant = await provisionTenantViaApi(request)

  await loginViaUi(page, tenant)
  await expect(page.getByText('Getting Started')).toBeVisible()

  // httpOnly cookie auth survives a full reload
  await page.reload()
  await expect(page.getByText('Getting Started')).toBeVisible()

  // Logout: topbar trigger → confirm dialog (both labelled "Logout")
  await page.getByRole('button', { name: 'Logout' }).first().click()
  await page.getByRole('dialog').getByRole('button', { name: 'Logout' }).click()
  await expect(page).toHaveURL(/\/login$/)
})

test('wrong password shows the backend error, then the correct one logs in', async ({ page, request }) => {
  await useEnglish(page)
  const tenant = await provisionTenantViaApi(request)

  await page.goto(`${tenantBaseUrl(tenant)}/login`)
  await expect(page.locator('#tenant')).toHaveValue(tenant.subdomain)
  await page.locator('#email').fill(tenant.adminEmail)
  await page.locator('#password').fill('WrongPass!9999')
  await page.getByRole('button', { name: 'Sign In' }).click()

  // Stable backend message surfaces via toast (auth_bad_credentials)
  await expect(page.getByText('Invalid username or password')).toBeVisible()

  // One failure must not lock the account — the correct login follows
  await page.locator('#password').fill(tenant.adminPassword)
  await page.getByRole('button', { name: 'Sign In' }).click()
  await expect(page.getByText('Getting Started')).toBeVisible()
})
