import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'
import type { ProvisionedTenant } from './tenant'
import { tenantBaseUrl } from './tenant'

/**
 * Forces the EN locale before any app code runs (FE defaults to `tr`;
 * specs assert on fixed EN strings — TenantSampleDataService seeds EN too).
 */
export async function useEnglish(page: Page): Promise<void> {
  await page.addInitScript(() => localStorage.setItem('sf_locale', 'en'))
}

/** Logs in through the real /login form on the tenant's subdomain host. */
export async function loginViaUi(page: Page, tenant: ProvisionedTenant): Promise<void> {
  await page.goto(`${tenantBaseUrl(tenant)}/login`)
  await expect(page.locator('#tenant')).toHaveValue(tenant.subdomain)
  await page.locator('#email').fill(tenant.adminEmail)
  await page.locator('#password').fill(tenant.adminPassword)
  await page.getByRole('button', { name: 'Sign In' }).click()
  await expect(page).toHaveURL(new RegExp(`${tenantBaseUrl(tenant)}/?$`))
}
