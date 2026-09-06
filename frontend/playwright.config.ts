import { defineConfig, devices } from '@playwright/test'

// K-57: E2E against the prod-like single-jar topology (backend + embedded
// frontend on :8080). Prereqs: `docker compose up -d db redis mailpit` and a
// FULL reactor build `./mvnw clean package -DskipTests` from the repo root
// (the -pl backend -am shortcut skips the frontend module = no SPA in the jar).
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:8080',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'java -jar backend/target/forgesys-backend.jar',
    cwd: '..',
    url: 'http://localhost:8080/actuator/health',
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
    env: {
      SPRING_PROFILES_ACTIVE: 'dev,smtp',
      APP_BASE_URL: 'http://localhost:8080',
    },
  },
})
