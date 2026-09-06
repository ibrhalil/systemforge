import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Separate from vite.config.ts so the app build stays free of test wiring.
// globals: false — tests import describe/it/expect/vi from 'vitest' explicitly
// (tsconfig types stay clean); jest-dom matchers augment via src/test/setup.ts.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['src/test/setup.ts'],
    // Explicit: keeps frontend/e2e/*.spec.ts (Playwright) out of Vitest's
    // default glob — without this, Vitest tries to run Playwright specs.
    include: ['src/test/**/*.test.{ts,tsx}'],
  },
})
