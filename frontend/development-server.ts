import type { ServerOptions } from "vite";

export const developmentServer: ServerOptions = {
  proxy: {
    "/api": {
      target: "http://localhost:3000",
      changeOrigin: true
    }
  }
};
