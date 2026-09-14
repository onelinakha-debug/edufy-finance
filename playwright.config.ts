import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  retries: 1,
  workers: 1,
  use: {
    baseURL: "http://localhost:5199",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    channel: "chrome",
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
  webServer: {
    command: "npx vite --port 5199",
    port: 5199,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
