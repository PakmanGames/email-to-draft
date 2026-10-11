import { defineConfig, devices } from "@playwright/test";

// Same committed defaults as Vitest, so E2E never sees a real LLM key and works without
// a .env file. Variables already set in the shell still win.
process.loadEnvFile(".env.test");

// Not 3000, so a `pnpm dev` server that happens to be running is never tested by mistake.
const port = 3100;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${port}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // A production build, so E2E tests what ships rather than the dev server.
    command: `pnpm build && pnpm start --port ${port}`,
    url: `http://localhost:${port}`,
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
