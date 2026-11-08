import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests against the running dev server and the development
 * database (seeded accounts from prisma/seed-policy.ts). Vitest owns
 * src/**\/*.test.ts(x); Playwright owns e2e/**\/*.spec.ts.
 *
 * The app may be served under NEXT_PUBLIC_BASE_PATH (e.g. /atara), so the
 * base URL ends in "/" and tests navigate with relative paths ("login", not
 * "/login" -- a leading slash would drop the base path).
 */
const basePath = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").trim().replace(/\/+$/, "");
const baseURL = `http://localhost:3000${basePath}/`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  retries: 0,
  reporter: "html",
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [
    // Logs each account in once: a new web login ends that account's other
    // web sessions, so tests share the saved cookie instead of logging in.
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup"],
    },
  ],
  webServer: {
    command: "npm run dev",
    url: `${baseURL}login`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
