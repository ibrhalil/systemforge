import type { APIRequestContext } from '@playwright/test'
import { expect } from '@playwright/test'
import { extractLink, waitForMessage } from './mailpit'

const APP_URL = process.env.APP_E2E_URL ?? 'http://localhost:8080'

export interface ProvisionedTenant {
  companyName: string
  subdomain: string
  adminEmail: string
  adminPassword: string
}

/**
 * Provisions a throwaway tenant over the public API: register (202) → poll
 * Mailpit for the verification mail → verify (synchronous schema + Flyway +
 * admin user). Every spec provisions its OWN tenant — isolation makes the
 * suite parallel-safe and repeated runs collision-free.
 */
export async function provisionTenantViaApi(
  request: APIRequestContext,
): Promise<ProvisionedTenant> {
  const subdomain = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const tenant: ProvisionedTenant = {
    companyName: `E2E ${subdomain}`,
    subdomain,
    adminEmail: `admin-${subdomain}@example.com`,
    adminPassword: 'E2ePass!1234',
  }

  const register = await request.post(`${APP_URL}/api/v1/auth/company/register`, {
    data: {
      companyName: tenant.companyName,
      subdomain: tenant.subdomain,
      adminEmail: tenant.adminEmail,
      adminPassword: tenant.adminPassword,
      adminFirstName: 'E2E',
      adminLastName: 'Runner',
    },
  })
  expect(register.status()).toBe(202)

  const message = await waitForMessage(request, tenant.adminEmail)
  const link = await extractLink(request, message, '/verify-tenant')
  const token = new URL(link).searchParams.get('token')
  expect(token).toBeTruthy()

  const verify = await request.post(`${APP_URL}/api/v1/auth/company/verify`, {
    data: { token },
  })
  expect(verify.status()).toBe(200)

  return tenant
}

/** Base URL of the tenant's subdomain host ({sub}.localhost → 127.0.0.1 in Chromium). */
export function tenantBaseUrl(tenant: ProvisionedTenant): string {
  const port = new URL(APP_URL).port
  const hostPart = port ? `${tenant.subdomain}.localhost:${port}` : `${tenant.subdomain}.localhost`
  return `${new URL(APP_URL).protocol}//${hostPart}`
}
