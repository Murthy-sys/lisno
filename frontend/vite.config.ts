import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";

import { developmentServer } from "./development-server";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: developmentServer,
  optimizeDeps: {
    esbuildOptions: {
      // Keep cached React chunks identical regardless of the launch directory.
      absWorkingDir: fileURLToPath(new URL(".", import.meta.url))
    }
  },
  worker: { format: "es" },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    env: {
      VITE_API_URL: "/api/v1"
    }
  }
});
