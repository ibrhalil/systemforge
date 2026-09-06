import { test, expect } from '@playwright/test'
import { extractLink, waitForMessage } from './helpers/mailpit'
import { provisionTenantViaApi, tenantBaseUrl } from './helpers/tenant'
import { useEnglish } from './helpers/ui'

// K-57 core flow 3: forgot-password → Mailpit reset link → new password →
// login with it. Reset kills all sessions server-side; the new login proves
// the hash was replaced.
test.setTimeout(90_000)

test('forgot password → mailed reset link → new password logs in', async ({ page, request }) => {
  await useEnglish(page)
  const tenant = await provisionTenantViaApi(request)
  const base = tenantBaseUrl(tenant)

  await page.goto(`${base}/login`)
  await page.getByRole('link', { name: 'Forgot your password?' }).click()
  await expect(page).toHaveURL(/\/forgot-password$/)

  await page.locator('#forgot-email').fill(tenant.adminEmail)
  await page.getByRole('button', { name: 'Send reset link' }).click()
  await expect(page.getByText('If the address is registered')).toBeVisible()

  // The reset mail is the newest message to the admin address
  const message = await waitForMessage(request, tenant.adminEmail)
  const link = await extractLink(request, message, '/reset-password')

  const newPassword = 'E2ePass!5678'
  await page.goto(link)
  await page.locator('#reset-password').fill(newPassword)
  await page.locator('#reset-password-confirm').fill(newPassword)
  await page.getByRole('button', { name: 'Update my password' }).click()
  await expect(page.getByText('Your password has been updated')).toBeVisible()

  // Login with the NEW password on the tenant host
  await page.goto(`${base}/login`)
  await page.locator('#email').fill(tenant.adminEmail)
  await page.locator('#password').fill(newPassword)
  await page.getByRole('button', { name: 'Sign In' }).click()
  await expect(page.getByText('Getting Started')).toBeVisible()
})
