import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/browser",
  outputDir: "test-results/browser",
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
      VITE_SUPABASE_ANON_KEY: "browser-test-public-key",
    },
  },
});
