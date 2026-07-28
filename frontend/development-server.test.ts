import { describe, expect, it } from "vitest";

import { developmentServer } from "./development-server";

describe("Vite development server", () => {
  it("proxies relative API requests to the local backend", () => {
    expect(developmentServer.proxy?.["/api"]).toMatchObject({
      target: "http://localhost:3000",
      changeOrigin: true
    });
  });
});
