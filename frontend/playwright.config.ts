import { defineConfig, devices } from '@playwright/test'

/**
 * End-to-end tests in a real Chromium against a running kadkerja with the demo profile:
 *   KADKERJA_PROFILES=postgres,demo docker compose up -d --build --wait   (CI; http://localhost:8081)
 * or the API (`./mvnw spring-boot:run -Dspring-boot.run.profiles=demo`) + `npm run build && npx vite preview` with
 *   E2E_BASE_URL=http://localhost:4173 npm run e2e
 * (not `npm run dev`: on its first load Vite prepares dependencies and reloads the page mid-test).
 * The tests make their own cars (random plates), so they can run again on the same database.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: '*.spec.ts',
  // One server with in-memory sign-in limits and shared demo stock: run the tests one after another.
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:8081',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
