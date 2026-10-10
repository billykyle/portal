import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  use: {
    baseURL: "http://127.0.0.1:43173",
    ...devices["Desktop Safari"],
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 1,
    hasTouch: true,
    isMobile: false,
  },
  projects: [{ name: "webkit", use: { browserName: "webkit" } }],
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:43173/dev/lightbox",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
