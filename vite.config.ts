import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id))
            return "react";
          if (id.includes("@supabase")) return "supabase";
          return undefined;
        },
      },
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    // White-box evidence for Phase 7: statement/branch/function/line coverage
    // of the client logic. React views are exercised by the Playwright suite.
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/main.tsx", "src/types.ts"],
      reporter: ["text", "json-summary", "html"],
      reportsDirectory: "coverage",
    },
  },
});
