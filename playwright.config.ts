import { defineConfig } from "@playwright/test"
export default defineConfig({
  testDir: "./tests/browser",
  workers: 1,
  timeout: 30_000,
  reporter: "list",
  webServer: {
    command: "bun tests/server.ts",
    url: "http://localhost:8798/health",
    reuseExistingServer: false,
  },
})
