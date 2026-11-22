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
  test: { include: ["tests/**/*.test.ts"] },
});
