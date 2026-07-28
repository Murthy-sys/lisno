import { defineConfig } from "vitest/config";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";

import { developmentServer } from "./development-server";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: developmentServer,
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"]
  }
});
