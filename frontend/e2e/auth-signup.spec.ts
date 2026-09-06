import { test, expect } from '@playwright/test'
import { extractLink, waitForMessage } from './helpers/mailpit'
import { useEnglish } from './helpers/ui'

// K-57 core flow 1: the whole self-service signup journey against the
// prod-like jar — register form → verification mail (Mailpit) → subdomain
// verify link → synchronous provisioning → admin login on the tenant host.
test.setTimeout(90_000)

test('signup → verify link from mail → tenant provisioned → admin login', async ({ page, request }) => {
  await useEnglish(page)

  const subdomain = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const adminEmail = `admin-${subdomain}@example.com`
  const adminPassword = 'E2ePass!1234'

  await page.goto('/register')
  await page.locator('#companyName').fill(`E2E ${subdomain}`)
  await page.locator('#subdomain').fill(subdomain)
  await page.locator('#adminEmail').fill(adminEmail)
  await page.locator('#adminPassword').fill(adminPassword)
  await page.getByRole('button', { name: 'Create Organization' }).click()

  // 202 → success notice (mail is out; provisioning waits for the token)
  await expect(page.getByText('Verification sent')).toBeVisible()

  // Mailpit: verification link (bare host on purpose — the tenant subdomain
  // does not resolve until the company is ACTIVE)
  const message = await waitForMessage(request, adminEmail)
  const link = await extractLink(request, message, '/verify-tenant')
  expect(link).toContain('/verify-tenant?token=')

  // The link opens the app on the tenant's subdomain host (SPA fallback +
  // TenantFilter resolution) and provisions synchronously
  await page.goto(link)
  await expect(page.getByText('You can now sign in as the admin.')).toBeVisible()

  // Continue to login — the page has seeded the tenant field
  await page.getByRole('link', { name: 'Sign in as admin' }).click()
  await expect(page.locator('#tenant')).toHaveValue(subdomain)
  await page.locator('#email').fill(adminEmail)
  await page.locator('#password').fill(adminPassword)
  await page.getByRole('button', { name: 'Sign In' }).click()

  // Shell is up; K-47 sample data proves the tenant schema was provisioned
  await expect(page.getByText('Getting Started')).toBeVisible({ timeout: 30_000 })
})
