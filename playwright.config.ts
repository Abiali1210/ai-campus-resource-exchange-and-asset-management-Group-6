import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/browser",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    browserName: "chromium",
    channel: "chrome",
    headless: true,
    baseURL: "http://127.0.0.1:5174",
  },
  webServer: {
    command: "npm run dev -- --port 5174 --strictPort",
    url: "http://127.0.0.1:5174",
    reuseExistingServer: false,
    env: {
      VITE_SUPABASE_URL: "http://127.0.0.1:54321",
      VITE_SUPABASE_PUBLISHABLE_KEY: "browser-test-publishable-key",
    },
  },
});
